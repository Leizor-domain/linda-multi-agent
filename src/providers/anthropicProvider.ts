import Anthropic from "@anthropic-ai/sdk";
import type { LLMGenerateOptions, LLMGenerateResult, LLMProvider } from "./llmProvider.js";

/**
 * Anthropic implementation of LLMProvider. Renamed from the earlier
 * single-provider ClaudeProvider to AnthropicProvider for symmetry with
 * OpenAIProvider now that Linda supports multiple providers — no behavior
 * change beyond the multi-model/usage-metadata contract in LLMProvider.
 *
 * isAvailable() returns false (rather than throwing at construction) when
 * no API key is configured, so the composition root can skip registering
 * this provider instead of crashing Linda's startup.
 */
export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic" as const;
  private readonly client: Anthropic | null;

  constructor(private readonly apiKey: string | undefined) {
    this.client = apiKey ? new Anthropic({ apiKey }) : null;
  }

  isAvailable(): boolean {
    return this.client !== null;
  }

  async generate(prompt: string, model: string, options?: LLMGenerateOptions): Promise<LLMGenerateResult> {
    if (!this.client) {
      throw new Error("AnthropicProvider is unavailable: no ANTHROPIC_API_KEY configured.");
    }

    const response = await this.client.messages.create({
      model,
      max_tokens: options?.maxTokens ?? 1024,
      system: options?.system,
      messages: [{ role: "user", content: prompt }],
    });

    const textBlock = response.content.find((block) => block.type === "text");
    const text = textBlock && "text" in textBlock ? textBlock.text : "";

    return {
      text,
      model,
      inputTokens: response.usage?.input_tokens ?? null,
      outputTokens: response.usage?.output_tokens ?? null,
    };
  }
}
