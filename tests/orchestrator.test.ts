import { describe, it, expect, beforeEach } from "vitest";
import { LindaOrchestrator } from "../src/core/orchestrator.js";
import { TaskManager } from "../src/core/taskManager.js";
import { InMemoryTaskStore } from "../src/core/taskStore.js";
import { AgentRouter } from "../src/core/router.js";
import { AgentRegistry } from "../src/core/agentRegistry.js";
import { PermissionsManager } from "../src/core/permissions.js";
import { ToolRegistry } from "../src/tools/toolRegistry.js";
import { WebSearchTool } from "../src/tools/webSearchTool.js";
import { createLogger } from "../src/app/logger.js";
import { permissionPolicy } from "../src/config/permissions.config.js";
import { ResearchAgent } from "../src/agents/researchAgent.js";
import { DeveloperAgent } from "../src/agents/developerAgent.js";
import { AdminAgent } from "../src/agents/adminAgent.js";
import { MockProvider } from "../src/providers/mockProvider.js";
import { ProviderRegistry } from "../src/core/providerRegistry.js";
import { ModelRouter } from "../src/core/modelRouter.js";
import { LLMService } from "../src/core/llmService.js";
import { InMemoryUsageStore } from "../src/core/usageStore.js";
import { BudgetGuard } from "../src/core/budgetGuard.js";
import { BaseAgent } from "../src/agents/baseAgent.js";
import type { AgentExecutionContext, AgentResult } from "../src/models/types.js";

function buildLLMService(logger: ReturnType<typeof createLogger>) {
  // Register mock providers under the real "anthropic"/"openai" names so
  // this exercises the actual agentModelPreferences config end-to-end,
  // with zero network access and zero API keys.
  const providerRegistry = new ProviderRegistry();
  providerRegistry.register(new MockProvider({ name: "anthropic" }));
  providerRegistry.register(new MockProvider({ name: "openai" }));
  const modelRouter = new ModelRouter(providerRegistry, logger);
  const usageStore = new InMemoryUsageStore();
  const budgetGuard = new BudgetGuard(usageStore, null, null, logger);
  return new LLMService(modelRouter, usageStore, budgetGuard, logger);
}

function buildLinda() {
  const logger = createLogger("error");
  const taskManager = new TaskManager(new InMemoryTaskStore(), logger);
  const router = new AgentRouter();
  const registry = new AgentRegistry();
  const permissions = new PermissionsManager(permissionPolicy, logger);
  const toolRegistry = new ToolRegistry(permissions, logger);
  toolRegistry.register(new WebSearchTool());

  const llmService = buildLLMService(logger);
  registry.register(new ResearchAgent(llmService));
  registry.register(new DeveloperAgent(llmService));
  registry.register(new AdminAgent(llmService));

  const linda = new LindaOrchestrator(taskManager, router, registry, toolRegistry, logger);
  return { linda, taskManager, registry };
}

describe("LindaOrchestrator — example requests", () => {
  it("routes a research request to the Research Agent and completes the task", async () => {
    const { linda, taskManager } = buildLinda();
    const response = await linda.handleRequest(
      "Research the latest developments in AI agent frameworks.",
      "user-1"
    );
    expect(response.status).toBe("completed");
    const task = taskManager.get(response.taskId);
    expect(task?.taskType).toBe("research");
    expect(task?.assignedAgentId).toBe("research");
  });

  it("routes a development request to the Developer Agent", async () => {
    const { linda, taskManager } = buildLinda();
    const response = await linda.handleRequest(
      "Inspect this TypeScript project and explain why the API server crashes.",
      "user-1"
    );
    expect(response.status).toBe("completed");
    const task = taskManager.get(response.taskId);
    expect(task?.taskType).toBe("development");
    expect(task?.assignedAgentId).toBe("developer");
  });

  it("routes an administrative request to the Admin Agent", async () => {
    const { linda, taskManager } = buildLinda();
    const response = await linda.handleRequest("Help me organize my priorities for tomorrow.", "user-1");
    expect(response.status).toBe("completed");
    const task = taskManager.get(response.taskId);
    expect(task?.taskType).toBe("administration");
    expect(task?.assignedAgentId).toBe("admin");
  });
});

describe("LindaOrchestrator — failure handling", () => {
  it("fails gracefully with a useful message when no agent can handle the category", async () => {
    const { linda, taskManager } = buildLinda();
    const response = await linda.handleRequest("purple elephants dance sideways", "user-1");
    expect(response.status).toBe("failed");
    expect(response.message).toMatch(/couldn't figure out|rephrase/i);
    const task = taskManager.get(response.taskId);
    expect(task?.status).toBe("failed");
  });

  it("marks the task failed and returns a useful message when an agent crashes", async () => {
    const logger = createLogger("error");
    const taskManager = new TaskManager(new InMemoryTaskStore(), logger);
    const router = new AgentRouter();
    const registry = new AgentRegistry();
    const permissions = new PermissionsManager(permissionPolicy, logger);
    const toolRegistry = new ToolRegistry(permissions, logger);

    class CrashingAgent extends BaseAgent {
      async execute(_context: AgentExecutionContext): Promise<AgentResult> {
        throw new Error("simulated crash");
      }
    }
    registry.register(
      new CrashingAgent({
        id: "research",
        name: "Research Agent",
        description: "",
        capabilities: ["research"],
        allowedTools: [],
      })
    );

    const linda = new LindaOrchestrator(taskManager, router, registry, toolRegistry, logger);
    const response = await linda.handleRequest("Research something", "user-1");

    expect(response.status).toBe("failed");
    expect(response.message).toMatch(/crashed/i);
    expect(taskManager.get(response.taskId)?.error).toMatch(/simulated crash/);
  });

  it("never reports success when the agent itself reports failure", async () => {
    const logger = createLogger("error");
    const taskManager = new TaskManager(new InMemoryTaskStore(), logger);
    const router = new AgentRouter();
    const registry = new AgentRegistry();
    const permissions = new PermissionsManager(permissionPolicy, logger);
    const toolRegistry = new ToolRegistry(permissions, logger);

    class FailingAgent extends BaseAgent {
      async execute(_context: AgentExecutionContext): Promise<AgentResult> {
        return { success: false, output: "", toolCalls: [], error: "could not complete" };
      }
    }
    registry.register(
      new FailingAgent({
        id: "admin",
        name: "Admin Agent",
        description: "",
        capabilities: ["administration"],
        allowedTools: [],
      })
    );

    const linda = new LindaOrchestrator(taskManager, router, registry, toolRegistry, logger);
    const response = await linda.handleRequest("Help me organize my day", "user-1");

    expect(response.status).toBe("failed");
    expect(taskManager.get(response.taskId)?.error).toBe("could not complete");
  });
});
