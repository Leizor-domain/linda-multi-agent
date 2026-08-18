import type { UsageStore } from "./usageStore.js";
import type { Logger } from "../app/logger.js";

export interface BudgetCheckResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Simple, conservative guard — not a billing system. If neither budget is
 * configured (both null), every check passes. Otherwise it sums today's
 * and this month's recorded cost via UsageStore.sumCostSince() and rejects
 * once a configured limit has already been reached.
 */
export class BudgetGuard {
  constructor(
    private readonly usageStore: UsageStore,
    private readonly dailyBudgetUsd: number | null,
    private readonly monthlyBudgetUsd: number | null,
    private readonly logger: Logger
  ) {}

  check(): BudgetCheckResult {
    if (this.dailyBudgetUsd === null && this.monthlyBudgetUsd === null) {
      return { allowed: true };
    }

    const now = new Date();

    if (this.dailyBudgetUsd !== null) {
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const spentToday = this.usageStore.sumCostSince(startOfDay);
      if (spentToday >= this.dailyBudgetUsd) {
        const reason = `Daily LLM budget of $${this.dailyBudgetUsd} has already been reached ($${spentToday.toFixed(4)} spent).`;
        this.logger.warn({ event: "budget_rejection", scope: "daily", spentUsd: spentToday, budgetUsd: this.dailyBudgetUsd });
        return { allowed: false, reason };
      }
    }

    if (this.monthlyBudgetUsd !== null) {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const spentThisMonth = this.usageStore.sumCostSince(startOfMonth);
      if (spentThisMonth >= this.monthlyBudgetUsd) {
        const reason = `Monthly LLM budget of $${this.monthlyBudgetUsd} has already been reached ($${spentThisMonth.toFixed(4)} spent).`;
        this.logger.warn({ event: "budget_rejection", scope: "monthly", spentUsd: spentThisMonth, budgetUsd: this.monthlyBudgetUsd });
        return { allowed: false, reason };
      }
    }

    return { allowed: true };
  }
}
