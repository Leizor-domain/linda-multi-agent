import "dotenv/config";
import { createLogger } from "./app/logger.js";
import { buildSlackApp } from "./app/slackApp.js";
import { TaskManager } from "./core/taskManager.js";
import { AgentRouter } from "./core/router.js";
import { AgentRegistry } from "./core/agentRegistry.js";
import { PermissionsManager } from "./core/permissions.js";
import { LindaOrchestrator } from "./core/orchestrator.js";
import { ToolRegistry } from "./tools/toolRegistry.js";
import { WebSearchTool } from "./tools/webSearchTool.js";
import { FilesystemTool } from "./tools/filesystemTool.js";
import { ShellTool } from "./tools/shellTool.js";
import { SQLiteTaskStore } from "./memory/sqliteTaskStore.js";
import { SQLiteUsageStore } from "./memory/sqliteUsageStore.js";
import { ResearchAgent } from "./agents/researchAgent.js";
import { DeveloperAgent } from "./agents/developerAgent.js";
import { AdminAgent } from "./agents/adminAgent.js";
import { permissionPolicy } from "./config/permissions.config.js";
import { AnthropicProvider } from "./providers/anthropicProvider.js";
import { OpenAIProvider } from "./providers/openaiProvider.js";
import { ProviderRegistry } from "./core/providerRegistry.js";
import { ModelRouter } from "./core/modelRouter.js";
import { BudgetGuard } from "./core/budgetGuard.js";
import { LLMService } from "./core/llmService.js";

function parseBudgetEnv(value: string | undefined): number | null {
  if (value === undefined || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function main() {
  const logger = createLogger(process.env.LOG_LEVEL);

  const requiredSlackVars = ["SLACK_BOT_TOKEN", "SLACK_APP_TOKEN"];
  const missing = requiredSlackVars.filter((v) => !process.env[v]);
  if (missing.length > 0) {
    logger.error({ event: "startup_failed", reason: "missing_env_vars", missing });
    console.error(
      `Missing required environment variables: ${missing.join(", ")}. Copy .env.example to .env and fill it in.`
    );
    process.exit(1);
  }

  // --- Multi-provider brain ---------------------------------------------
  // Linda must be able to start with zero, one, or both LLM providers
  // configured. Each provider adapter reports its own availability rather
  // than throwing at construction, so a missing key here never crashes
  // startup — it only means that provider is skipped by ModelRouter, and
  // LLMService returns a clear "no provider available" error only if an
  // agent actually tries to generate with nothing configured.
  const providerRegistry = new ProviderRegistry();
  providerRegistry.register(new AnthropicProvider(process.env.ANTHROPIC_API_KEY));
  providerRegistry.register(new OpenAIProvider(process.env.OPENAI_API_KEY));

  if (providerRegistry.listAvailable().length === 0) {
    logger.warn({
      event: "no_llm_provider_configured",
      reason: "neither ANTHROPIC_API_KEY nor OPENAI_API_KEY is set; LLM-dependent tasks will fail gracefully",
    });
  }

  const modelRouter = new ModelRouter(providerRegistry, logger);
  const usageStore = new SQLiteUsageStore(process.env.DATABASE_PATH ?? "./data/linda.db");
  const budgetGuard = new BudgetGuard(
    usageStore,
    parseBudgetEnv(process.env.LLM_DAILY_BUDGET_USD),
    parseBudgetEnv(process.env.LLM_MONTHLY_BUDGET_USD),
    logger
  );
  const llmService = new LLMService(modelRouter, usageStore, budgetGuard, logger);

  // --- Task orchestration --------------------------------------------------
  const taskStore = new SQLiteTaskStore(process.env.DATABASE_PATH ?? "./data/linda.db");
  const taskManager = new TaskManager(taskStore, logger);
  const router = new AgentRouter();
  const registry = new AgentRegistry();
  const permissions = new PermissionsManager(permissionPolicy, logger);
  const toolRegistry = new ToolRegistry(permissions, logger);

  toolRegistry.register(new WebSearchTool());
  toolRegistry.register(new FilesystemTool(process.env.FS_SANDBOX_ROOT ?? "./workspace"));
  toolRegistry.register(new ShellTool(process.env.FS_SANDBOX_ROOT ?? "./workspace"));

  registry.register(new ResearchAgent(llmService));
  registry.register(new DeveloperAgent(llmService));
  registry.register(new AdminAgent(llmService));

  const linda = new LindaOrchestrator(taskManager, router, registry, toolRegistry, logger);

  const slackApp = buildSlackApp(
    { botToken: process.env.SLACK_BOT_TOKEN!, appToken: process.env.SLACK_APP_TOKEN! },
    linda,
    logger
  );

  await slackApp.start();
  logger.info({ event: "linda_started" });
  console.log("⚡️ Linda is running (Socket Mode).");
}

main().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
