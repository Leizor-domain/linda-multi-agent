import { BaseAgent } from "./baseAgent.js";
import type { AgentExecutionContext, AgentResult } from "../models/types.js";
import type { LLMService } from "../core/llmService.js";
import { agentDescriptors } from "../config/agents.config.js";

export class AdminAgent extends BaseAgent {
  constructor(private readonly llmService: LLMService) {
    super(agentDescriptors.admin!);
  }

  async execute(context: AgentExecutionContext): Promise<AgentResult> {
    const { task } = context;

    // Milestone 1: no email, calendar, or third-party contact capabilities —
    // those are explicitly out of scope. Pure planning/organization reasoning.
    const prompt =
      `You are Linda's Admin Agent. A user asked: "${task.originalRequest}". ` +
      `You can only reason and organize — you cannot send emails, modify calendars, ` +
      `or contact anyone. Provide clear, actionable organizational help within that constraint.`;

    // Model/provider selection, fallback, escalation, and usage tracking are
    // all centralized in LLMService — this agent never talks to a provider
    // SDK or picks a model itself.
    const generation = await this.llmService.execute({
      agentId: this.id,
      taskId: task.id,
      prompt,
      system: "You are an efficient personal admin assistant with no external side effects.",
    });

    if (!generation.success) {
      return { success: false, output: "", toolCalls: [], error: generation.error ?? "LLM generation failed." };
    }

    return {
      success: true,
      output: generation.text,
      toolCalls: [],
      metadata: { agent: this.id, provider: generation.provider, model: generation.model, tier: generation.tier },
    };
  }
}
