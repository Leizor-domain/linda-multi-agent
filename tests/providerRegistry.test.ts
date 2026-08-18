import { describe, it, expect } from "vitest";
import { ProviderRegistry } from "../src/core/providerRegistry.js";
import { MockProvider } from "../src/providers/mockProvider.js";

describe("ProviderRegistry", () => {
  it("registers a provider and returns it by name", () => {
    const registry = new ProviderRegistry();
    const provider = new MockProvider({ name: "anthropic" });
    registry.register(provider);
    expect(registry.get("anthropic")).toBe(provider);
  });

  it("returns undefined for an unregistered provider name", () => {
    const registry = new ProviderRegistry();
    expect(registry.get("openai")).toBeUndefined();
  });

  it("reports availability based on the provider's own isAvailable()", () => {
    const registry = new ProviderRegistry();
    registry.register(new MockProvider({ name: "anthropic", available: true }));
    registry.register(new MockProvider({ name: "openai", available: false }));

    expect(registry.isAvailable("anthropic")).toBe(true);
    expect(registry.isAvailable("openai")).toBe(false);
    expect(registry.isAvailable("mock")).toBe(false); // never registered
  });

  it("listAvailable() excludes unavailable and unregistered providers", () => {
    const registry = new ProviderRegistry();
    registry.register(new MockProvider({ name: "anthropic", available: true }));
    registry.register(new MockProvider({ name: "openai", available: false }));

    const available = registry.listAvailable().map((p) => p.name);
    expect(available).toEqual(["anthropic"]);
  });

  it("listRegistered() includes providers regardless of availability", () => {
    const registry = new ProviderRegistry();
    registry.register(new MockProvider({ name: "anthropic", available: false }));
    expect(registry.listRegistered().map((p) => p.name)).toEqual(["anthropic"]);
  });
});
