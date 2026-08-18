import { describe, it, expect } from "vitest";
import { BudgetGuard } from "../src/core/budgetGuard.js";
import { InMemoryUsageStore } from "../src/core/usageStore.js";
import { LLMService } from "../src/core/llmService.js";
import { ModelRouter } from "../src/core/modelRouter.js";
import { ProviderRegistry } from "../src/core/providerRegistry.js";
import { MockProvider } from "../src/providers/mockProvider.js";
import { createLogger } from "../src/app/logger.js";
import type { LLMUsageRecord } from "../src/models/types.js";

const logger = createLogger("error");

function usageRecord(overrides: Partial<LLMUsageRecord>): LLMUsageRecord {
  return {
    id: "rec1",
    provider: "anthropic",
    model: "claude-sonnet-5",
    tier: "standard",
    inputTokens: 100,
    outputTokens: 100,
    estimatedCostUsd: 1,
    latencyMs: 10,
    success: true,
    error: null,
    taskId: "t1",
    agentId: "research",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("BudgetGuard", () => {
  it("allows execution when no budget is configured", () => {
    const usageStore = new InMemoryUsageStore();
    usageStore.insert(usageRecord({ estimatedCostUsd: 1_000_000 })); // huge spend, irrelevant
    const guard = new BudgetGuard(usageStore, null, null, logger);
    expect(guard.check().allowed).toBe(true);
  });

  it("allows execution when spend is under the configured daily budget", () => {
    const usageStore = new InMemoryUsageStore();
    usageStore.insert(usageRecord({ estimatedCostUsd: 1 }));
    const guard = new BudgetGuard(usageStore, 10, null, logger);
    expect(guard.check().allowed).toBe(true);
  });

  it("rejects execution once the daily budget has already been reached", () => {
    const usageStore = new InMemoryUsageStore();
    usageStore.insert(usageRecord({ estimatedCostUsd: 10 }));
    const guard = new BudgetGuard(usageStore, 10, null, logger);
    const result = guard.check();
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/daily llm budget/i);
  });

  it("rejects execution once the monthly budget has already been reached", () => {
    const usageStore = new InMemoryUsageStore();
    usageStore.insert(usageRecord({ estimatedCostUsd: 50 }));
    const guard = new BudgetGuard(usageStore, null, 50, logger);
    const result = guard.check();
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/monthly llm budget/i);
  });

  it("ignores spend from before the budget window (e.g. yesterday) for the daily check", () => {
    const usageStore = new InMemoryUsageStore();
    const yesterday = new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString();
    usageStore.insert(usageRecord({ estimatedCostUsd: 999, createdAt: yesterday }));
    const guard = new BudgetGuard(usageStore, 10, null, logger);
    expect(guard.check().allowed).toBe(true);
  });
});

describe("LLMService — budget integration", () => {
  it("rejects execution before calling any provider once the hard budget is exceeded", async () => {
    const usageStore = new InMemoryUsageStore();
    usageStore.insert(usageRecord({ estimatedCostUsd: 10 }));
    const budgetGuard = new BudgetGuard(usageStore, 10, null, logger);

    const providerRegistry = new ProviderRegistry();
    const provider = new MockProvider({ name: "anthropic" });
    providerRegistry.register(provider);
    const modelRouter = new ModelRouter(providerRegistry, logger);

    const service = new LLMService(modelRouter, usageStore, budgetGuard, logger);
    const result = await service.execute({ agentId: "research", taskId: "t2", prompt: "hi" });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/daily llm budget/i);
    // Only the pre-seeded record should exist — no new provider call happened.
    expect(usageStore.list()).toHaveLength(1);
  });
});
