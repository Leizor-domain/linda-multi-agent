import type { CostTier, ProviderName } from "../models/types.js";

export interface AgentModelPreference {
  /** Providers to try, in order. Not a hard binding — ModelRouter skips any
   * that are unavailable and falls back to the next one. */
  preferredProviders: ProviderName[];
  defaultTier: CostTier;
}

/**
 * Preferences only — never a hard binding to a single provider. If the
 * preferred provider is unavailable or fails, ModelRouter/LLMService fall
 * back to the next configured provider, and escalate tier on repeated
 * failure (see config/escalation.config.ts).
 */
export const agentModelPreferences: Record<string, AgentModelPreference> = {
  admin: {
    preferredProviders: ["openai", "anthropic"],
    defaultTier: "low",
  },
  research: {
    preferredProviders: ["openai", "anthropic"],
    defaultTier: "standard",
  },
  developer: {
    preferredProviders: ["anthropic", "openai"],
    defaultTier: "standard",
  },
};

/** Fallback preference order for any agent id not listed above. */
export const defaultModelPreference: AgentModelPreference = {
  preferredProviders: ["anthropic", "openai"],
  defaultTier: "standard",
};
