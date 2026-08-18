import { BaseAgent } from "./baseAgent.js";
import type { AgentExecutionContext, AgentResult, ToolCallRecord } from "../models/types.js";
import type { LLMService } from "../core/llmService.js";
import { agentDescriptors } from "../config/agents.config.js";

export class DeveloperAgent extends BaseAgent {
  constructor(private readonly llmService: LLMService) {
    super(agentDescriptors.developer!);
  }

  async execute(context: AgentExecutionContext): Promise<AgentResult> {
    const { task } = context;
    const toolCalls: ToolCallRecord[] = [];

    // Milestone 1: reason about the request with the LLM directly. Real
    // filesystem/shell investigation is available via context.requestTool
    // and permission-gated (reads flow through; writes and unsafe shell
    // commands come back as REQUIRES_APPROVAL) — wire in actual repo
    // inspection here as a next step, see README "what to extend first".
    const prompt =
      `You are Linda's Developer Agent. A user asked: "${task.originalRequest}". ` +
      `You have access to a sandboxed filesystem (read allowed, write requires approval) ` +
      `and a shell restricted to a safe command allowlist (dangerous commands require approval). ` +
      `Explain what you would investigate and propose next steps. Do not claim you already ran ` +
      `commands or inspected files unless you actually did.`;

    // Model/provider selection, fallback, escalation, and usage tracking are
    // all centralized in LLMService — this agent never talks to a provider
    // SDK or picks a model itself.
    const generation = await this.llmService.execute({
      agentId: this.id,
      taskId: task.id,
      prompt,
      system: "You are a precise, safety-conscious software engineer. Never claim actions you did not take.",
    });

    if (!generation.success) {
      return { success: false, output: "", toolCalls, error: generation.error ?? "LLM generation failed." };
    }

    return {
      success: true,
      output: generation.text,
      toolCalls,
      metadata: { agent: this.id, provider: generation.provider, model: generation.model, tier: generation.tier },
    };
  }
}
