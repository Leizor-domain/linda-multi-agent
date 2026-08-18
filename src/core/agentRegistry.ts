import type { BaseAgent } from "../agents/baseAgent.js";
import type { Task, TaskCategory } from "../models/types.js";

/**
 * Holds every available worker agent. Linda (the orchestrator) asks this
 * registry for a capable agent — it never instantiates or references a
 * specific agent class directly, so new agents can be added without
 * touching the orchestrator or the Slack interface.
 */
export class AgentRegistry {
  private readonly agents = new Map<string, BaseAgent>();

  register(agent: BaseAgent): void {
    this.agents.set(agent.id, agent);
  }

  get(agentId: string): BaseAgent | undefined {
    return this.agents.get(agentId);
  }

  all(): BaseAgent[] {
    return [...this.agents.values()];
  }

  findByCapability(category: TaskCategory): BaseAgent[] {
    return this.all().filter((agent) => agent.capabilities.includes(category));
  }

  findForTask(task: Task): BaseAgent | undefined {
    return this.findByCapability(task.taskType)[0];
  }
}
