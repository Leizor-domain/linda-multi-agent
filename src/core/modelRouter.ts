import type { CostTier, ProviderName } from "../models/types.js";
import type { LLMProvider } from "../providers/llmProvider.js";
import type { ProviderRegistry } from "./providerRegistry.js";
import type { Logger } from "../app/logger.js";
import { modelConfig } from "../config/models.config.js";
import { agentModelPreferences, defaultModelPreference } from "../config/agentModelPreferences.config.js";

/**
 * ModelRouter answers a different question from core/router.ts:
 *
 *   core/router.ts (AgentRouter)  -> "which AGENT should perform this task?"
 *   core/modelRouter.ts (this)    -> "which PROVIDER/MODEL should that
 *                                     agent use for this execution?"
 *
 * These are deliberately kept separate. ModelRouter never looks at task
 * text or task category — only at agent id and cost tier.
 */
export interface ModelSelection {
  provider: LLMProvider;
  providerName: ProviderName;
  model: string;
  tier: CostTier;
}

export class ModelRouter {
  constructor(
    private readonly registry: ProviderRegistry,
    private readonly logger: Logger
  ) {}

  resolveDefaultTier(agentId: string): CostTier {
    return (agentModelPreferences[agentId] ?? defaultModelPreference).defaultTier;
  }

  /**
   * Returns available (provider, model) candidates for this agent+tier, in
   * the agent's preferred order. Providers with no configured model for
   * this tier, or that are currently unavailable, are silently skipped —
   * never a hard binding to one provider.
   */
  candidatesForTier(agentId: string, tier: CostTier): ModelSelection[] {
    const preference = agentModelPreferences[agentId] ?? defaultModelPreference;

    const candidates: ModelSelection[] = [];
    for (const providerName of preference.preferredProviders) {
      if (!this.registry.isAvailable(providerName)) continue;
      const model = modelConfig[providerName]?.[tier];
      if (!model) continue;
      const provider = this.registry.get(providerName);
      if (!provider) continue;
      candidates.push({ provider, providerName, model, tier });
    }

    this.logger.info({
      event: "model_routing_decision",
      agentId,
      tier,
      candidates: candidates.map((c) => `${c.providerName}:${c.model}`),
    });

    return candidates;
  }
}
