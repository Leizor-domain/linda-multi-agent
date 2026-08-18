import type { LLMGenerateOptions, LLMGenerateResult, LLMProvider } from "./llmProvider.js";
import type { ProviderName } from "../models/types.js";

export interface MockProviderConfig {
  /** When true, every generate() call rejects — used to test provider
   * failure -> fallback/escalation behavior in LLMService. */
  shouldFail?: boolean;
  failureMessage?: string;
  /** When false, isAvailable() returns false so ModelRouter skips this
   * provider entirely (distinct from shouldFail, which simulates an
   * available-but-erroring provider). Defaults to true. */
  available?: boolean;
  /** Which registry slot this instance occupies. Defaults to "mock". Tests
   * that want to exercise the real agentModelPreferences config (which
   * only lists "anthropic"/"openai") can register a MockProvider under one
   * of those names instead, without needing a live API key. */
  name?: ProviderName;
}

/**
 * Deterministic, network-free provider. Used by every automated test that
 * exercises ProviderRegistry/ModelRouter/LLMService, and as the documented
 * runtime fallback message path when neither OpenAI nor Anthropic is
 * configured (see LLMService — Linda does not register MockProvider at
 * runtime; it's test-only, so a real deployment with no keys configured
 * gets a clear "no provider available" error rather than a fake answer).
 */
export class MockProvider implements LLMProvider {
  readonly name: ProviderName;

  constructor(private readonly config: MockProviderConfig = {}) {
    this.name = config.name ?? "mock";
  }

  isAvailable(): boolean {
    return this.config.available ?? true;
  }

  async generate(prompt: string, model: string, _options?: LLMGenerateOptions): Promise<LLMGenerateResult> {
    if (this.config.shouldFail) {
      throw new Error(this.config.failureMessage ?? "Simulated MockProvider failure.");
    }
    return {
      text:
        `[mock-llm-response via ${model}] Received prompt of ${prompt.length} chars. ` +
        `This is a deterministic placeholder response, not a real model output.`,
      model,
      inputTokens: Math.ceil(prompt.length / 4),
      outputTokens: 32,
    };
  }
}
