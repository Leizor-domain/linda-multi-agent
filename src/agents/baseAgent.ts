import type {
  AgentCapabilityDescriptor,
  AgentExecutionContext,
  AgentResult,
  Task,
  ToolName,
} from "../models/types.js";

export abstract class BaseAgent {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly capabilities: AgentCapabilityDescriptor["capabilities"];
  readonly allowedTools: ToolName[];

  protected constructor(descriptor: AgentCapabilityDescriptor) {
    this.id = descriptor.id;
    this.name = descriptor.name;
    this.description = descriptor.description;
    this.capabilities = descriptor.capabilities;
    this.allowedTools = descriptor.allowedTools;
  }

  canHandle(task: Task): boolean {
    return this.capabilities.includes(task.taskType);
  }

  abstract execute(context: AgentExecutionContext): Promise<AgentResult>;
}
