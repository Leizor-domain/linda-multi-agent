import { describe, it, expect } from "vitest";
import { LLMService } from "../src/core/llmService.js";
import { ModelRouter } from "../src/core/modelRouter.js";
import { ProviderRegistry } from "../src/core/providerRegistry.js";
import { InMemoryUsageStore } from "../src/core/usageStore.js";
import { BudgetGuard } from "../src/core/budgetGuard.js";
import { MockProvider } from "../src/providers/mockProvider.js";
import { createLogger } from "../src/app/logger.js";
import type { EscalationConfig } from "../src/config/escalation.config.js";

const logger = createLogger("error");

function buildService(opts: {
  providers: MockProvider[];
  escalation?: EscalationConfig;
  dailyBudgetUsd?: number | null;
}) {
  const providerRegistry = new ProviderRegistry();
  opts.providers.forEach((p) => providerRegistry.register(p));
  const modelRouter = new ModelRouter(providerRegistry, logger);
  const usageStore = new InMemoryUsageStore();
  const budgetGuard = new BudgetGuard(usageStore, opts.dailyBudgetUsd ?? null, null, logger);
  const escalation: EscalationConfig = opts.escalation ?? {
    enabled: true,
    tierOrder: ["low", "standard", "premium"],
    maxAttemptsPerRequest: 4,
  };
  const service = new LLMService(modelRouter, usageStore, budgetGuard, logger, escalation);
  return { service, usageStore };
}

describe("LLMService — successful call", () => {
  it("returns generated text with provider/model/tier metadata", async () => {
    const { service } = buildService({ providers: [new MockProvider({ name: "anthropic" })] });
    const result = await service.execute({ agentId: "research", taskId: "t1", prompt: "hello" });

    expect(result.success).toBe(true);
    expect(result.provider).toBe("anthropic");
    expect(result.tier).toBe("standard"); // research's default tier
    expect(result.text).toContain("mock-llm-response");
  });

  it("records a usage entry for a successful call", async () => {
    const { service, usageStore } = buildService({ providers: [new MockProvider({ name: "anthropic" })] });
    await service.execute({ agentId: "admin", taskId: "t2", prompt: "hi" });

    const records = usageStore.list();
    expect(records).toHaveLength(1);
    expect(records[0]?.success).toBe(true);
    expect(records[0]?.agentId).toBe("admin");
    expect(records[0]?.taskId).toBe("t2");
    expect(records[0]?.inputTokens).not.toBeNull();
    expect(records[0]?.outputTokens).not.toBeNull();
  });
});

describe("LLMService — provider fallback", () => {
  it("falls back to the next preferred provider when the first fails", async () => {
    const { service, usageStore } = buildService({
      providers: [
        new MockProvider({ name: "anthropic", shouldFail: true, failureMessage: "anthropic down" }),
        new MockProvider({ name: "openai" }),
      ],
    });
    // developer prefers ["anthropic", "openai"]
    const result = await service.execute({ agentId: "developer", taskId: "t3", prompt: "debug this" });

    expect(result.success).toBe(true);
    expect(result.provider).toBe("openai");

    const records = usageStore.list();
    expect(records).toHaveLength(2);
    expect(records.some((r) => !r.success && r.provider === "anthropic")).toBe(true);
    expect(records.some((r) => r.success && r.provider === "openai")).toBe(true);
  });
});

describe("LLMService — escalation", () => {
  it("escalates to the next tier when every provider fails at the starting tier", async () => {
    // Both providers fail — LLMService should climb the tier ladder and log
    // an escalation, still recording a usage row for every real attempt.
    const failing = () => new MockProvider({ shouldFail: true, failureMessage: "boom" });
    const { service, usageStore } = buildService({
      providers: [
        new MockProvider({ name: "anthropic", shouldFail: true, failureMessage: "boom" }),
        new MockProvider({ name: "openai", shouldFail: true, failureMessage: "boom" }),
      ],
      escalation: { enabled: true, tierOrder: ["low", "standard", "premium"], maxAttemptsPerRequest: 10 },
    });

    const result = await service.execute({ agentId: "developer", taskId: "t4", prompt: "x" });
    expect(result.success).toBe(false);

    // developer starts at "standard" -> escalates to "premium": 2 providers
    // per tier * 2 tiers = 4 attempts, all recorded, all failed.
    const records = usageStore.list();
    expect(records).toHaveLength(4);
    expect(records.every((r) => !r.success)).toBe(true);
    expect(new Set(records.map((r) => r.tier))).toEqual(new Set(["standard", "premium"]));
    void failing; // (unused helper kept for readability of intent above)
  });

  it("obeys a strict maximum attempt count and does not exceed it", async () => {
    const { service, usageStore } = buildService({
      providers: [
        new MockProvider({ name: "anthropic", shouldFail: true }),
        new MockProvider({ name: "openai", shouldFail: true }),
      ],
      escalation: { enabled: true, tierOrder: ["low", "standard", "premium"], maxAttemptsPerRequest: 2 },
    });

    const result = await service.execute({ agentId: "developer", taskId: "t5", prompt: "x" });
    expect(result.success).toBe(false);
    // Cap is 2 — must not have made more than 2 real provider calls even
    // though 2 tiers x 2 providers = 4 would otherwise be available.
    expect(usageStore.list()).toHaveLength(2);
  });

  it("does not escalate when escalation is disabled", async () => {
    const { service, usageStore } = buildService({
      providers: [new MockProvider({ name: "anthropic", shouldFail: true })],
      escalation: { enabled: false, tierOrder: ["low", "standard", "premium"], maxAttemptsPerRequest: 10 },
    });

    const result = await service.execute({ agentId: "developer", taskId: "t6", prompt: "x" });
    expect(result.success).toBe(false);
    // Only the starting tier ("standard") should have been tried.
    expect(usageStore.list()).toHaveLength(1);
    expect(usageStore.list()[0]?.tier).toBe("standard");
  });
});

describe("LLMService — no provider available", () => {
  it("fails gracefully with a clear message and records no usage", async () => {
    const { service, usageStore } = buildService({ providers: [] });
    const result = await service.execute({ agentId: "admin", taskId: "t7", prompt: "x" });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/no configured llm provider/i);
    expect(usageStore.list()).toHaveLength(0);
  });
});
