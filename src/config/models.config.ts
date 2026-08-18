import type { CostTier, ProviderName } from "../models/types.js";

/**
 * The only place model IDs are allowed to live. ModelRouter reads this to
 * resolve (provider, tier) -> concrete model string. Agents and providers
 * never hard-code a model name.
 *
 * NOTE: verify these against each provider's current model lineup before
 * enabling paid usage — model IDs are renamed/retired over time and this
 * table is exactly where you update them.
 */
export const modelConfig: Record<ProviderName, Partial<Record<CostTier, string>>> = {
  anthropic: {
    low: "claude-haiku-4-5-20251001",
    standard: "claude-sonnet-5",
    premium: "claude-opus-4-8",
  },
  openai: {
    // Placeholder IDs — confirm current model names in the OpenAI dashboard
    // before enabling paid usage. Isolated here so that's a one-line change.
    low: "gpt-4o-mini",
    standard: "gpt-4o",
    premium: "o1",
  },
  mock: {
    low: "mock-low",
    standard: "mock-standard",
    premium: "mock-premium",
  },
};
