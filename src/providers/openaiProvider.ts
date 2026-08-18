import OpenAI from "openai";
import type { LLMGenerateOptions, LLMGenerateResult, LLMProvider } from "./llmProvider.js";

/**
 * OpenAI implementation of LLMProvider, mirroring AnthropicProvider's shape
 * exactly so ModelRouter/LLMService never need to know which one they're
 * talking to. isAvailable() is false (not a thrown error) when no API key
 * is configured, so Linda can start with only one provider configured.
 */
export class OpenAIProvider implements LLMProvider {
  readonly name = "openai" as const;
  private readonly client: OpenAI | null;

  constructor(private readonly apiKey: string | undefined) {
    this.client = apiKey ? new OpenAI({ apiKey }) : null;
  }

  isAvailable(): boolean {
    return this.client !== null;
  }

  async generate(prompt: string, model: string, options?: LLMGenerateOptions): Promise<LLMGenerateResult> {
    if (!this.client) {
      throw new Error("OpenAIProvider is unavailable: no OPENAI_API_KEY configured.");
    }

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
    if (options?.system) {
      messages.push({ role: "system", content: options.system });
    }
    messages.push({ role: "user", content: prompt });

    const response = await this.client.chat.completions.create({
      model,
      max_tokens: options?.maxTokens ?? 1024,
      messages,
    });

    const text = response.choices[0]?.message?.content ?? "";

    return {
      text,
      model,
      inputTokens: response.usage?.prompt_tokens ?? null,
      outputTokens: response.usage?.completion_tokens ?? null,
    };
  }
}
