import { describe, it, expect } from "vitest";
import { AgentRouter } from "../src/core/router.js";

describe("AgentRouter", () => {
  const router = new AgentRouter();

  it("routes research requests to the research category", () => {
    expect(router.route("Research the latest developments in AI agent frameworks.")).toBe("research");
  });

  it("routes development requests to the development category", () => {
    expect(
      router.route("Inspect this TypeScript project and explain why the API server crashes.")
    ).toBe("development");
  });

  it("routes administrative requests to the administration category", () => {
    expect(router.route("Help me organize my priorities for tomorrow.")).toBe("administration");
  });

  it("fails gracefully to 'unknown' for unclassifiable requests", () => {
    expect(router.route("purple elephants dance sideways")).toBe("unknown");
  });
});
