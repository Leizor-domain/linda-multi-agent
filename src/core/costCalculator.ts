import type { ProviderName } from "../models/types.js";
import { pricingConfig } from "../config/pricing.config.js";

/**
 * Returns an estimated cost in USD, or null when it cannot be reliably
 * calculated (missing token counts, or no pricing entry for the model).
 * Never fabricates a number — a null here is the correct, honest answer.
 */
export function estimateCostUsd(
  provider: ProviderName,
  model: string,
  inputTokens: number | null,
  outputTokens: number | null
): number | null {
  if (inputTokens === null || outputTokens === null) return null;

  const pricing = pricingConfig[provider]?.[model];
  if (!pricing) return null;

  const inputCost = (inputTokens / 1_000_000) * pricing.inputPerMillionTokensUsd;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPerMillionTokensUsd;
  return inputCost + outputCost;
}
