import type { ProviderName } from "../models/types.js";

/**
 * Provider-agnostic LLM interface. Agents never depend on this directly —
 * they go through LLMService, which goes through ModelRouter and
 * ProviderRegistry (see core/llmService.ts, core/modelRouter.ts,
 * core/providerRegistry.ts). Only the provider adapters in this directory
 * (anthropicProvider.ts, openaiProvider.ts, mockProvider.ts) may import a
 * concrete SDK.
 *
 * A provider implementation should throw on failure (network error, auth
 * error, etc.) rather than swallowing it — LLMService is responsible for
 * catching that, recording it as usage, and deciding whether to fall back
 * or escalate. Providers should not implement their own fallback/retry
 * logic; that's centralized by design.
 */
export interface LLMGenerateOptions {
  system?: string;
  maxTokens?: number;
}

/** Successful generation result. Token counts are null when the underlying
 * SDK response doesn't reliably report them — LLMService/cost calculation
 * must never fabricate a number in that case. */
export interface LLMGenerateResult {
  text: string;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
}

export interface LLMProvider {
  readonly name: ProviderName;
  /** Cheap, synchronous check — e.g. "is an API key configured" — used by
   * ProviderRegistry/ModelRouter to skip unavailable providers without
   * making a network call. */
  isAvailable(): boolean;
  generate(prompt: string, model: string, options?: LLMGenerateOptions): Promise<LLMGenerateResult>;
}
