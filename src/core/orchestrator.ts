import type { AgentExecutionContext, Task, ToolInvocationResult, ToolName } from "../models/types.js";
import { TaskManager } from "./taskManager.js";
import { AgentRouter } from "./router.js";
import { AgentRegistry } from "./agentRegistry.js";
import type { ToolRegistry } from "../tools/toolRegistry.js";
import type { Logger } from "../app/logger.js";

export interface LindaResponse {
  taskId: string;
  status: Task["status"];
  message: string;
}

/**
 * Linda is the orchestrator. It receives normalized requests, creates
 * tasks, routes them, assigns a capable agent, and coordinates execution.
 * It deliberately contains NO specialist task logic — that all lives in
 * agents/*.ts. It never talks to Slack directly, so it can be reused by any
 * interface.
 */
export class LindaOrchestrator {
  constructor(
    private readonly taskManager: TaskManager,
    private readonly router: AgentRouter,
    private readonly registry: AgentRegistry,
    private readonly toolRegistry: ToolRegistry,
    private readonly logger: Logger
  ) {}

  async handleRequest(rawMessage: string, requesterId: string): Promise<LindaResponse> {
    const normalized = rawMessage.trim();
    const task = this.taskManager.createTask(normalized, requesterId);

    const category = this.router.route(normalized);
    this.taskManager.setTaskType(task.id, category);

    const agent = this.registry.findForTask({ ...task, taskType: category });

    if (!agent) {
      const failed = this.taskManager.fail(
        task.id,
        `No registered agent can handle category '${category}'.`
      );
      return {
        taskId: failed.id,
        status: failed.status,
        message:
          category === "unknown"
            ? "I couldn't figure out what kind of request this is, so I can't route it yet. Could you rephrase it?"
            : `I don't have an agent capable of handling '${category}' requests yet. That capability is currently unavailable.`,
      };
    }

    this.taskManager.assign(task.id, agent.id);
    this.taskManager.start(task.id);

    const context: AgentExecutionContext = {
      task: { ...task, taskType: category, assignedAgentId: agent.id, status: "running" },
      requestTool: async <TInput, TOutput>(toolName: ToolName, input: TInput): Promise<ToolInvocationResult<TOutput>> =>
        this.toolRegistry.invoke<TInput, TOutput>(agent.id, agent.allowedTools, toolName, input),
    };

    try {
      const result = await agent.execute(context);

      if (!result.success) {
        const failed = this.taskManager.fail(task.id, result.error ?? "Agent reported failure with no error message.");
        return {
          taskId: failed.id,
          status: failed.status,
          message: `The ${agent.name} ran into a problem: ${result.error ?? "unknown error"}.`,
        };
      }

      const completed = this.taskManager.complete(task.id, result.output);
      return {
        taskId: completed.id,
        status: completed.status,
        message: result.output,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error({ event: "agent_crash", taskId: task.id, agentId: agent.id, error: message });
      const failed = this.taskManager.fail(task.id, message);
      return {
        taskId: failed.id,
        status: failed.status,
        message: `The ${agent.name} crashed while handling this request: ${message}`,
      };
    }
  }
}
