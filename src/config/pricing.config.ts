import type { ProviderName } from "../models/types.js";

export interface ModelPricing {
  inputPerMillionTokensUsd: number;
  outputPerMillionTokensUsd: number;
}

/**
 * Illustrative pricing, isolated here specifically so it can be corrected
 * without touching any calling code. VERIFY THESE AGAINST EACH PROVIDER'S
 * CURRENT PRICING PAGE before relying on cost tracking for real budget
 * decisions — prices change, and getting this wrong silently under- or
 * over-reports spend. If a model is missing here, costCalculator.ts
 * returns null rather than guessing.
 */
export const pricingConfig: Record<ProviderName, Record<string, ModelPricing>> = {
  anthropic: {
    "claude-haiku-4-5-20251001": { inputPerMillionTokensUsd: 1, outputPerMillionTokensUsd: 5 },
    "claude-sonnet-5": { inputPerMillionTokensUsd: 3, outputPerMillionTokensUsd: 15 },
    "claude-opus-4-8": { inputPerMillionTokensUsd: 15, outputPerMillionTokensUsd: 75 },
  },
  openai: {
    "gpt-4o-mini": { inputPerMillionTokensUsd: 0.15, outputPerMillionTokensUsd: 0.6 },
    "gpt-4o": { inputPerMillionTokensUsd: 2.5, outputPerMillionTokensUsd: 10 },
    "o1": { inputPerMillionTokensUsd: 15, outputPerMillionTokensUsd: 60 },
  },
  mock: {
    "mock-low": { inputPerMillionTokensUsd: 0, outputPerMillionTokensUsd: 0 },
    "mock-standard": { inputPerMillionTokensUsd: 0, outputPerMillionTokensUsd: 0 },
    "mock-premium": { inputPerMillionTokensUsd: 0, outputPerMillionTokensUsd: 0 },
  },
};
