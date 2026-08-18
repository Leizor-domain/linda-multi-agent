import { nanoid } from "nanoid";
import type { Task, TaskCategory, TaskStatus } from "../models/types.js";
import type { TaskStore } from "./taskStore.js";
import type { Logger } from "../app/logger.js";

const VALID_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  pending: ["assigned", "failed"],
  assigned: ["running", "failed"],
  running: ["completed", "failed"],
  completed: [],
  failed: [],
};

export class TaskManager {
  constructor(
    private readonly store: TaskStore,
    private readonly logger: Logger
  ) {}

  createTask(originalRequest: string, requesterId: string): Task {
    const now = new Date().toISOString();
    const task: Task = {
      id: nanoid(12),
      originalRequest,
      taskType: "unknown",
      assignedAgentId: null,
      status: "pending",
      result: null,
      error: null,
      requesterId,
      createdAt: now,
      updatedAt: now,
    };
    this.store.insert(task);
    this.logger.info({ event: "task_created", taskId: task.id, requesterId });
    return task;
  }

  setTaskType(taskId: string, taskType: TaskCategory): Task {
    const task = this.requireTask(taskId);
    task.taskType = taskType;
    task.updatedAt = new Date().toISOString();
    this.store.update(task);
    this.logger.info({ event: "route_decision", taskId, taskType });
    return task;
  }

  assign(taskId: string, agentId: string): Task {
    const task = this.transition(taskId, "assigned");
    task.assignedAgentId = agentId;
    task.updatedAt = new Date().toISOString();
    this.store.update(task);
    this.logger.info({ event: "agent_assignment", taskId, agentId });
    return task;
  }

  start(taskId: string): Task {
    const task = this.transition(taskId, "running");
    this.logger.info({ event: "task_start", taskId });
    return task;
  }

  complete(taskId: string, result: string): Task {
    const task = this.transition(taskId, "completed");
    task.result = result;
    task.updatedAt = new Date().toISOString();
    this.store.update(task);
    this.logger.info({ event: "task_completion", taskId });
    return task;
  }

  fail(taskId: string, error: string): Task {
    const task = this.requireTask(taskId);
    // Failure is allowed from any non-terminal state.
    if (task.status === "completed" || task.status === "failed") {
      throw new Error(`Cannot fail task ${taskId} from terminal state '${task.status}'.`);
    }
    task.status = "failed";
    task.error = error;
    task.updatedAt = new Date().toISOString();
    this.store.update(task);
    this.logger.error({ event: "task_failure", taskId, error });
    return task;
  }

  get(taskId: string): Task | undefined {
    return this.store.get(taskId);
  }

  list(): Task[] {
    return this.store.list();
  }

  private requireTask(taskId: string): Task {
    const task = this.store.get(taskId);
    if (!task) throw new Error(`Task '${taskId}' not found.`);
    return task;
  }

  private transition(taskId: string, next: TaskStatus): Task {
    const task = this.requireTask(taskId);
    const allowed = VALID_TRANSITIONS[task.status];
    if (!allowed.includes(next)) {
      throw new Error(`Invalid task transition '${task.status}' -> '${next}' for task ${taskId}.`);
    }
    task.status = next;
    task.updatedAt = new Date().toISOString();
    this.store.update(task);
    return task;
  }
}
