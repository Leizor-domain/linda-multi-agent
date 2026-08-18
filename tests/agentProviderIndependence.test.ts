import { describe, it, expect, vi } from "vitest";
import { ResearchAgent } from "../src/agents/researchAgent.js";
import { DeveloperAgent } from "../src/agents/developerAgent.js";
import { AdminAgent } from "../src/agents/adminAgent.js";
import type { AgentExecutionContext, Task } from "../src/models/types.js";
import type { LLMService, LLMServiceResult } from "../src/core/llmService.js";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    originalRequest: "do the thing",
    taskType: "research",
    assignedAgentId: null,
    status: "running",
    result: null,
    error: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    requesterId: "user-1",
    ...overrides,
  };
}

function makeContext(task: Task): AgentExecutionContext {
  return {
    task,
    requestTool: vi.fn().mockResolvedValue({ decision: "ALLOW", success: true, output: { query: task.originalRequest, results: [], note: "mock" } }),
  };
}

function fakeLLMService(result: LLMServiceResult): LLMService {
  return { execute: vi.fn().mockResolvedValue(result) } as unknown as LLMService;
}

describe("Agents are provider-independent — they only call LLMService.execute()", () => {
  it("ResearchAgent delegates generation to LLMService and surfaces provider/model/tier metadata", async () => {
    const llmService = fakeLLMService({
      success: true,
      text: "the research answer",
      provider: "openai",
      model: "gpt-4o",
      tier: "standard",
    });
    const agent = new ResearchAgent(llmService);
    const task = makeTask({ taskType: "research" });

    const result = await agent.execute(makeContext(task));

    expect(llmService.execute).toHaveBeenCalledTimes(1);
    const call = (llmService.execute as any).mock.calls[0][0];
    expect(call.agentId).toBe("research");
    expect(call.taskId).toBe("task-1");
    expect(typeof call.prompt).toBe("string");

    expect(result.success).toBe(true);
    expect(result.output).toBe("the research answer");
    expect(result.metadata).toMatchObject({ provider: "openai", model: "gpt-4o", tier: "standard" });
  });

  it("DeveloperAgent delegates generation to LLMService", async () => {
    const llmService = fakeLLMService({
      success: true,
      text: "here's what I'd investigate",
      provider: "anthropic",
      model: "claude-sonnet-5",
      tier: "standard",
    });
    const agent = new DeveloperAgent(llmService);
    const task = makeTask({ taskType: "development" });

    const result = await agent.execute(makeContext(task));

    expect(llmService.execute).toHaveBeenCalledTimes(1);
    expect((llmService.execute as any).mock.calls[0][0].agentId).toBe("developer");
    expect(result.success).toBe(true);
    expect(result.output).toBe("here's what I'd investigate");
  });

  it("AdminAgent delegates generation to LLMService", async () => {
    const llmService = fakeLLMService({
      success: true,
      text: "here's your plan",
      provider: "anthropic",
      model: "claude-haiku-4-5-20251001",
      tier: "low",
    });
    const agent = new AdminAgent(llmService);
    const task = makeTask({ taskType: "administration" });

    const result = await agent.execute(makeContext(task));

    expect(llmService.execute).toHaveBeenCalledTimes(1);
    expect((llmService.execute as any).mock.calls[0][0].agentId).toBe("admin");
    expect(result.success).toBe(true);
    expect(result.output).toBe("here's your plan");
  });

  it("propagates an LLMService failure as an agent failure rather than reporting fabricated success", async () => {
    const llmService = fakeLLMService({
      success: false,
      text: "",
      provider: null,
      model: null,
      tier: null,
      error: "No configured LLM provider is currently available.",
    });
    const agent = new AdminAgent(llmService);
    const task = makeTask({ taskType: "administration" });

    const result = await agent.execute(makeContext(task));

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/no configured llm provider/i);
  });
});
