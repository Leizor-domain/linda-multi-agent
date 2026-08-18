import { BaseAgent } from "./baseAgent.js";
import type { AgentExecutionContext, AgentResult, ToolCallRecord } from "../models/types.js";
import type { LLMService } from "../core/llmService.js";
import { agentDescriptors } from "../config/agents.config.js";
import type { WebSearchInput, WebSearchResult } from "../tools/webSearchTool.js";

export class ResearchAgent extends BaseAgent {
  constructor(private readonly llmService: LLMService) {
    super(agentDescriptors.research!);
  }

  async execute(context: AgentExecutionContext): Promise<AgentResult> {
    const { task } = context;
    const toolCalls: ToolCallRecord[] = [];

    const searchResult = await context.requestTool<WebSearchInput, WebSearchResult>(
      "web_search",
      { query: task.originalRequest }
    );
    toolCalls.push({
      toolName: "web_search",
      input: { query: task.originalRequest },
      decision: searchResult.decision,
      success: searchResult.success,
      output: searchResult.output,
      error: searchResult.error,
    });

    const searchContext = searchResult.success
      ? JSON.stringify(searchResult.output)
      : `(web search unavailable: ${searchResult.error})`;

    const prompt =
      `You are Linda's Research Agent. A user asked: "${task.originalRequest}". ` +
      `Web search context: ${searchContext}. ` +
      `Write a concise, honest answer. If no real search results were available, say so explicitly ` +
      `rather than inventing facts.`;

    // Model/provider selection, fallback, escalation, and usage tracking are
    // all centralized in LLMService — this agent never talks to a provider
    // SDK or picks a model itself.
    const generation = await this.llmService.execute({
      agentId: this.id,
      taskId: task.id,
      prompt,
      system: "You are a careful research assistant. Never fabricate sources or facts.",
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
