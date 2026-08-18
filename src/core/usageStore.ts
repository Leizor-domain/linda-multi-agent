import type { LLMUsageRecord } from "../models/types.js";

/**
 * Persists LLM usage/cost telemetry, separately from task history
 * (core/taskStore.ts). SQLiteUsageStore (src/memory) is the runtime
 * implementation; InMemoryUsageStore is for fast unit tests. This is the
 * data foundation for future "how much did I spend today" type questions —
 * no query/reporting surface is built on top of it yet, by design.
 */
export interface UsageStore {
  insert(record: LLMUsageRecord): void;
  list(): LLMUsageRecord[];
  /** Sum of estimatedCostUsd for records with createdAt >= sinceIso.
   * Records with a null estimatedCostUsd are excluded from the sum (not
   * treated as zero-cost and not treated as unknown-therefore-blocking) —
   * this is a known limitation: usage that couldn't be priced doesn't count
   * toward the budget guard. See BudgetGuard for how this is used. */
  sumCostSince(sinceIso: string): number;
}

export class InMemoryUsageStore implements UsageStore {
  private readonly records: LLMUsageRecord[] = [];

  insert(record: LLMUsageRecord): void {
    this.records.push({ ...record });
  }

  list(): LLMUsageRecord[] {
    return this.records.map((r) => ({ ...r }));
  }

  sumCostSince(sinceIso: string): number {
    return this.records
      .filter((r) => r.createdAt >= sinceIso && r.estimatedCostUsd !== null)
      .reduce((sum, r) => sum + (r.estimatedCostUsd ?? 0), 0);
  }
}
