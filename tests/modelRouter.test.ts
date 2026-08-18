import { describe, it, expect } from "vitest";
import { ModelRouter } from "../src/core/modelRouter.js";
import { ProviderRegistry } from "../src/core/providerRegistry.js";
import { MockProvider } from "../src/providers/mockProvider.js";
import { createLogger } from "../src/app/logger.js";
import { modelConfig } from "../src/config/models.config.js";

describe("ModelRouter", () => {
  const logger = createLogger("error");

  it("resolves each agent's configured default tier", () => {
    const router = new ModelRouter(new ProviderRegistry(), logger);
    expect(router.resolveDefaultTier("admin")).toBe("low");
    expect(router.resolveDefaultTier("research")).toBe("standard");
    expect(router.resolveDefaultTier("developer")).toBe("standard");
  });

  it("falls back to the default preference for an unlisted agent id", () => {
    const router = new ModelRouter(new ProviderRegistry(), logger);
    expect(router.resolveDefaultTier("some-future-agent")).toBe("standard");
  });

  it("selects low-tier candidates with the correct configured model", () => {
    const registry = new ProviderRegistry();
    registry.register(new MockProvider({ name: "openai" }));
    registry.register(new MockProvider({ name: "anthropic" }));
    const router = new ModelRouter(registry, logger);

    const candidates = router.candidatesForTier("admin", "low");
    expect(candidates[0]?.providerName).toBe("openai"); // admin prefers openai first
    expect(candidates[0]?.model).toBe(modelConfig.openai.low);
  });

  it("selects standard-tier candidates", () => {
    const registry = new ProviderRegistry();
    registry.register(new MockProvider({ name: "anthropic" }));
    registry.register(new MockProvider({ name: "openai" }));
    const router = new ModelRouter(registry, logger);

    const candidates = router.candidatesForTier("developer", "standard");
    expect(candidates[0]?.providerName).toBe("anthropic"); // developer prefers anthropic first
    expect(candidates[0]?.model).toBe(modelConfig.anthropic.standard);
  });

  it("selects premium-tier candidates", () => {
    const registry = new ProviderRegistry();
    registry.register(new MockProvider({ name: "anthropic" }));
    const router = new ModelRouter(registry, logger);

    const candidates = router.candidatesForTier("developer", "premium");
    expect(candidates[0]?.model).toBe(modelConfig.anthropic.premium);
  });

  it("honors preferred provider order when both are available", () => {
    const registry = new ProviderRegistry();
    registry.register(new MockProvider({ name: "openai" }));
    registry.register(new MockProvider({ name: "anthropic" }));
    const router = new ModelRouter(registry, logger);

    const candidates = router.candidatesForTier("research", "standard");
    expect(candidates.map((c) => c.providerName)).toEqual(["openai", "anthropic"]);
  });

  it("falls back to the next preferred provider when the first is unavailable", () => {
    const registry = new ProviderRegistry();
    registry.register(new MockProvider({ name: "openai", available: false }));
    registry.register(new MockProvider({ name: "anthropic", available: true }));
    const router = new ModelRouter(registry, logger);

    // research prefers ["openai", "anthropic"] — openai is unavailable.
    const candidates = router.candidatesForTier("research", "standard");
    expect(candidates.map((c) => c.providerName)).toEqual(["anthropic"]);
  });

  it("returns no candidates when no preferred provider is available", () => {
    const registry = new ProviderRegistry(); // nothing registered
    const router = new ModelRouter(registry, logger);
    expect(router.candidatesForTier("admin", "low")).toEqual([]);
  });
});
