import type { Task } from "../models/types.js";

/**
 * Storage abstraction for tasks. SQLiteTaskStore (src/memory) is the
 * Milestone 1 implementation; InMemoryTaskStore exists for fast unit tests.
 * Swapping to Postgres later means writing one new class against this
 * interface — nothing else changes.
 */
export interface TaskStore {
  insert(task: Task): void;
  update(task: Task): void;
  get(taskId: string): Task | undefined;
  list(): Task[];
}

export class InMemoryTaskStore implements TaskStore {
  private readonly tasks = new Map<string, Task>();

  insert(task: Task): void {
    this.tasks.set(task.id, { ...task });
  }

  update(task: Task): void {
    this.tasks.set(task.id, { ...task });
  }

  get(taskId: string): Task | undefined {
    const t = this.tasks.get(taskId);
    return t ? { ...t } : undefined;
  }

  list(): Task[] {
    return [...this.tasks.values()].map((t) => ({ ...t }));
  }
}
