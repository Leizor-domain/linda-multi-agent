import type { LLMProvider } from "../providers/llmProvider.js";
import type { ProviderName } from "../models/types.js";

/**
 * Holds every registered LLM provider. Nothing outside this registry and
 * the composition root (src/index.ts) should ever `new` up a concrete
 * provider — ModelRouter/LLMService only ever go through here, exactly
 * like AgentRegistry for agents.
 */
export class ProviderRegistry {
  private readonly providers = new Map<ProviderName, LLMProvider>();

  register(provider: LLMProvider): void {
    this.providers.set(provider.name, provider);
  }

  get(name: ProviderName): LLMProvider | undefined {
    return this.providers.get(name);
  }

  isAvailable(name: ProviderName): boolean {
    const provider = this.providers.get(name);
    return provider !== undefined && provider.isAvailable();
  }

  listAvailable(): LLMProvider[] {
    return [...this.providers.values()].filter((p) => p.isAvailable());
  }

  listRegistered(): LLMProvider[] {
    return [...this.providers.values()];
  }
}
