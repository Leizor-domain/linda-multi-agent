import { nanoid } from "nanoid";
import type { CostTier, LLMUsageRecord, ProviderName } from "../models/types.js";
import type { ModelRouter, ModelSelection } from "./modelRouter.js";
import type { UsageStore } from "./usageStore.js";
import type { BudgetGuard } from "./budgetGuard.js";
import type { Logger } from "../app/logger.js";
import { estimateCostUsd } from "./costCalculator.js";
import { escalationConfig as defaultEscalationConfig, type EscalationConfig } from "../config/escalation.config.js";

export interface LLMServiceParams {
  agentId: string;
  taskId: string;
  prompt: string;
  system?: string;
  /** Overrides the agent's configured default tier for this one call. */
  tier?: CostTier;
}

export interface LLMServiceResult {
  success: boolean;
  text: string;
  provider: ProviderName | null;
  model: string | null;
  tier: CostTier | null;
  error?: string;
}

/**
 * The single entry point agents use to talk to a model. Agents never touch
 * ModelRouter, ProviderRegistry, or a provider SDK directly — see
 * agents/*.ts, which depend only on this class.
 *
 * Responsibilities: ask ModelRouter for candidates, try them in order
 * (provider fallback), escalate up the tier ladder on exhausted failure
 * (bounded by escalationConfig.maxAttemptsPerRequest across the *whole*
 * call), record usage for every attempt — success or failure — and apply
 * the budget guard before spending anything.
 */
export class LLMService {
  constructor(
    private readonly modelRouter: ModelRouter,
    private readonly usageStore: UsageStore,
    private readonly budgetGuard: BudgetGuard,
    private readonly logger: Logger,
    private readonly escalation: EscalationConfig = defaultEscalationConfig
  ) {}

  async execute(params: LLMServiceParams): Promise<LLMServiceResult> {
    const budgetCheck = this.budgetGuard.check();
    if (!budgetCheck.allowed) {
      return this.fail(budgetCheck.reason ?? "LLM budget has been reached.");
    }

    const startTier = params.tier ?? this.modelRouter.resolveDefaultTier(params.agentId);
    const startIndex = this.escalation.tierOrder.indexOf(startTier);
    const tierSequence = this.escalation.enabled && startIndex >= 0
      ? this.escalation.tierOrder.slice(startIndex)
      : [startTier];

    let attempts = 0;
    let lastError: string | undefined;

    for (let i = 0; i < tierSequence.length; i++) {
      const tier = tierSequence[i]!;
      const candidates = this.modelRouter.candidatesForTier(params.agentId, tier);

      for (const candidate of candidates) {
        if (attempts >= this.escalation.maxAttemptsPerRequest) {
          this.logger.warn({
            event: "escalation_limit_reached",
            agentId: params.agentId,
            taskId: params.taskId,
            attempts,
            maxAttemptsPerRequest: this.escalation.maxAttemptsPerRequest,
          });
          return this.fail(lastError ?? "Maximum LLM attempts reached for this request.");
        }

        attempts++;
        const result = await this.tryCandidate(params, candidate);
        if (result.success) {
          this.logger.info({
            event: "model_selected",
            agentId: params.agentId,
            taskId: params.taskId,
            provider: candidate.providerName,
            model: candidate.model,
            tier,
          });
          return {
            success: true,
            text: result.text,
            provider: candidate.providerName,
            model: candidate.model,
            tier,
          };
        }
        lastError = result.error;
        this.logger.warn({
          event: "provider_failure",
          agentId: params.agentId,
          taskId: params.taskId,
          provider: candidate.providerName,
          model: candidate.model,
          tier,
          error: result.error,
        });
        // Falling through to the next candidate in this tier is the
        // "fallback" behavior; falling through to the next tier below is
        // "escalation" — logged separately so the two are distinguishable.
      }

      const isLastTier = i === tierSequence.length - 1;
      if (!isLastTier) {
        this.logger.info({
          event: "escalation",
          agentId: params.agentId,
          taskId: params.taskId,
          fromTier: tier,
          toTier: tierSequence[i + 1],
        });
      }
    }

    return this.fail(
      lastError ?? "No configured LLM provider is currently available."
    );
  }

  private async tryCandidate(
    params: LLMServiceParams,
    candidate: ModelSelection
  ): Promise<{ success: true; text: string } | { success: false; error: string }> {
    const start = Date.now();
    try {
      const result = await candidate.provider.generate(params.prompt, candidate.model, {
        system: params.system,
      });
      const latencyMs = Date.now() - start;
      const estimatedCostUsd = estimateCostUsd(
        candidate.providerName,
        candidate.model,
        result.inputTokens,
        result.outputTokens
      );
      this.recordUsage(params, candidate, {
        latencyMs,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        estimatedCostUsd,
        success: true,
        error: null,
      });
      return { success: true, text: result.text };
    } catch (err) {
      const latencyMs = Date.now() - start;
      const message = err instanceof Error ? err.message : String(err);
      this.recordUsage(params, candidate, {
        latencyMs,
        inputTokens: null,
        outputTokens: null,
        estimatedCostUsd: null,
        success: false,
        error: message,
      });
      return { success: false, error: message };
    }
  }

  private recordUsage(
    params: LLMServiceParams,
    candidate: ModelSelection,
    outcome: {
      latencyMs: number;
      inputTokens: number | null;
      outputTokens: number | null;
      estimatedCostUsd: number | null;
      success: boolean;
      error: string | null;
    }
  ): void {
    const record: LLMUsageRecord = {
      id: nanoid(12),
      provider: candidate.providerName,
      model: candidate.model,
      tier: candidate.tier,
      inputTokens: outcome.inputTokens,
      outputTokens: outcome.outputTokens,
      estimatedCostUsd: outcome.estimatedCostUsd,
      latencyMs: outcome.latencyMs,
      success: outcome.success,
      error: outcome.error,
      taskId: params.taskId,
      agentId: params.agentId,
      createdAt: new Date().toISOString(),
    };
    this.usageStore.insert(record);
    this.logger.info({ event: "usage", ...record });
  }

  private fail(error: string): LLMServiceResult {
    return { success: false, text: "", provider: null, model: null, tier: null, error };
  }
}
