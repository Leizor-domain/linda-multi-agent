import { describe, it, expect } from "vitest";
import { AgentRegistry } from "../src/core/agentRegistry.js";
import { BaseAgent } from "../src/agents/baseAgent.js";
import type { AgentExecutionContext, AgentResult } from "../src/models/types.js";

class StubAgent extends BaseAgent {
  async execute(_context: AgentExecutionContext): Promise<AgentResult> {
    return { success: true, output: `handled by ${this.id}`, toolCalls: [] };
  }
}

describe("AgentRegistry", () => {
  it("allows dynamic registration and lookup by id", () => {
    const registry = new AgentRegistry();
    const agent = new StubAgent({
      id: "research",
      name: "Research Agent",
      description: "test",
      capabilities: ["research"],
      allowedTools: ["web_search"],
    });
    registry.register(agent);
    expect(registry.get("research")).toBe(agent);
  });

  it("discovers agents by capability", () => {
    const registry = new AgentRegistry();
    registry.register(
      new StubAgent({ id: "research", name: "R", description: "", capabilities: ["research"], allowedTools: [] })
    );
    registry.register(
      new StubAgent({ id: "developer", name: "D", description: "", capabilities: ["development"], allowedTools: [] })
    );

    expect(registry.findByCapability("research").map((a) => a.id)).toEqual(["research"]);
    expect(registry.findByCapability("development").map((a) => a.id)).toEqual(["developer"]);
    expect(registry.findByCapability("administration")).toEqual([]);
  });

  it("returns undefined/empty when no agent can handle a category", () => {
    const registry = new AgentRegistry();
    expect(registry.findByCapability("unknown")).toEqual([]);
  });
});
