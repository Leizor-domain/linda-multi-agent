# CLAUDE.md — Rules for coding agents working on Linda

This file is for any AI coding agent (or human) modifying this repository.
It documents the architectural boundaries established in Milestone 1.
Violating these rules will break the modularity the architecture depends on.

## Non-negotiable rules

1. **Linda (`core/orchestrator.ts`) is the orchestrator only.** It creates
   tasks, routes them, asks the registry for a capable agent, and
   coordinates execution/failure handling. It must never contain
   specialist reasoning, prompt text, or tool-calling logic for a specific
   domain. That belongs in `agents/*.ts`.

2. **Specialist logic belongs inside agents.** If you're adding reasoning
   about code, research, or planning, it goes in an `agents/*.ts` file
   extending `BaseAgent`, not in the orchestrator, the router, or the Slack
   layer.

3. **External capabilities belong inside tools.** Anything that touches the
   filesystem, shell, network, or a third-party API is a `Tool` in
   `tools/*.ts`, registered with `ToolRegistry`. Agents never call `fs`,
   `child_process`, `fetch`, etc. directly.

4. **Slack is only an interface.** `app/slackApp.ts` normalizes a Slack
   event into `(text, userId)` and calls
   `LindaOrchestrator.handleRequest()`. It must contain no routing logic,
   no agent logic, and no tool execution logic. If you add another
   interface (CLI, HTTP, etc.), it should look just as thin — a normalizer
   that calls the same orchestrator method.

5. **All tools require permission checks.** Every tool invocation must go
   through `ToolRegistry.invoke()`. Never call a `Tool.run()` method
   directly, and never add a code path that lets an agent reach a tool
   without passing through the agent's own `allowedTools` check and
   `PermissionsManager.check()`. If a specific operation within an already-
   permitted tool is risky, throw `ApprovalRequiredError` from inside that
   tool's `run()` — do not silently allow it and do not silently no-op it.

6. **Do not bypass the Agent Registry.** The orchestrator must discover
   agents via `AgentRegistry.findForTask()` / `findByCapability()`. Never
   hard-code `new ResearchAgent(...)` or an agent id inside
   `orchestrator.ts` or `slackApp.ts`.

7. **Do not bypass the Task Manager.** All task state changes go through
   `TaskManager` (`createTask`, `setTaskType`, `assign`, `start`,
   `complete`, `fail`). Never mutate a `Task` object's `status` field
   directly, and never write to `TaskStore` except from within
   `TaskManager`. The valid transition graph is: `pending → assigned →
   running → completed`, with `failed` reachable from any non-terminal
   state. Do not add new transitions without updating
   `VALID_TRANSITIONS` in `taskManager.ts` deliberately, not incidentally.

8. **Agents must remain provider-independent.** Agents depend only on
   `LLMService` (`core/llmService.ts`), injected via constructor. Never
   `import Anthropic from "@anthropic-ai/sdk"` or `import OpenAI from
   "openai"` inside an agent file, never pick a model string inside an
   agent, and never call a provider's `generate()` directly. If you find
   yourself doing any of that, the fix is to call
   `llmService.execute({ agentId, taskId, prompt, system? })` instead.

9. **Never expose secrets.** Never `console.log` or otherwise print
   `process.env` values directly. Use `Logger` (`app/logger.ts`), which
   redacts any field whose key matches `token|key|secret|password|
   authorization`. Never commit a real `.env` file — only `.env.example`
   with placeholders.

10. **Maintain test coverage.** Every new router category, permission rule,
    task transition, agent, or tool needs a corresponding test in
    `tests/*.test.ts`. Slack-layer changes must remain testable with the
    mocked `@slack/bolt` pattern in `tests/slack.test.ts` — no test should
    require live Slack, live Anthropic, live OpenAI, or network access.
    `MockProvider` (`providers/mockProvider.ts`) is test-only — it is never
    registered at runtime in `src/index.ts`.

11. **Model selection belongs in ModelRouter, not in agents or LLMService
    call sites.** `ModelRouter` (`core/modelRouter.ts`) is the only place
    that maps `(agentId, tier)` to a ranked list of `(provider, model)`
    candidates, reading `config/agentModelPreferences.config.ts` and
    `config/models.config.ts`. Do not hard-code a model string or a
    provider name anywhere else — including inside `LLMService`, which
    only orchestrates calling whatever `ModelRouter` hands it.

12. **Provider SDK access belongs only in provider adapters.** Only files
    directly under `src/providers/` (`anthropicProvider.ts`,
    `openaiProvider.ts`, and any future provider) may import a provider's
    SDK. `core/llmService.ts`, `core/modelRouter.ts`, and
    `core/providerRegistry.ts` all depend only on the `LLMProvider`
    interface (`providers/llmProvider.ts`), never on a concrete SDK type.

13. **Never bypass the Provider Registry.** Exactly like the Agent
    Registry, nothing outside `ProviderRegistry` (`core/providerRegistry.ts`)
    and the composition root (`src/index.ts`) should ever `new` up a
    concrete provider or hold a reference to one directly. `ModelRouter`
    and `LLMService` only ever go through `ProviderRegistry.get()` /
    `isAvailable()` / `listAvailable()`.

14. **Fallback and escalation are centralized in LLMService — never
    duplicate that logic per agent.** If a provider call fails,
    `LLMService.execute()` is the only place that decides to try the next
    provider (fallback) or the next tier (escalation,
    `config/escalation.config.ts`). Agents must not implement their own
    retry loops around `llmService.execute()`. The
    `maxAttemptsPerRequest` cap is a hard, deliberately conservative
    ceiling — raise it explicitly in config, never work around it with a
    wrapper that calls `execute()` multiple times.

15. **Usage must be recorded centrally, for every real attempt.**
    `LLMService` is the only caller of `UsageStore.insert()`
    (`core/usageStore.ts`). Every actual provider call — success or
    failure — gets exactly one usage record, including failed attempts
    that were superseded by fallback/escalation. Do not add a second
    usage-recording path (e.g. inside a provider adapter or an agent).

16. **Pricing must not be embedded inside agents, providers, or
    LLMService.** Cost is computed only by `core/costCalculator.ts`
    against `config/pricing.config.ts`. When token counts or a pricing
    entry are unavailable, the cost is `null` — never a guessed number.
    If you add a model, add its pricing to `pricing.config.ts` in the
    same change, or cost tracking silently degrades to `null` for it.

## Storage and provider abstractions

- `TaskStore` (`core/taskStore.ts`) is the persistence interface.
  `SQLiteTaskStore` is the Milestone 1 implementation. If you swap to
  Postgres or another backend later, write a new class implementing
  `TaskStore` — do not change the interface shape casually, since
  `TaskManager` depends on it.
- `UsageStore` (`core/usageStore.ts`) is the parallel persistence interface
  for LLM usage/cost telemetry. `SQLiteUsageStore` is the implementation,
  in its own `llm_usage` table (may share the same `.db` file as tasks —
  "separate" means a separate store/table, not necessarily a separate
  file). `LLMService` is the only writer.
- `LLMProvider` (`providers/llmProvider.ts`) is the model interface.
  `AnthropicProvider`, `OpenAIProvider`, and `MockProvider` all implement
  it identically: constructed from just credentials, `isAvailable()`
  reflects whether they're present (never throw at construction time), and
  `generate(prompt, model, options)` returns text plus token usage. A
  future `LocalModelProvider` or similar should do the same and be
  registered with `ProviderRegistry` at the composition root
  (`src/index.ts`) only.
- `ModelRouter` (`core/modelRouter.ts`) and `LLMService`
  (`core/llmService.ts`) are the two new layers underneath agent
  execution — see the "Multi-Provider Brain" section of `README.md` for
  the full routing/fallback/escalation/cost story. In short: `AgentRouter`
  picks the agent, `ModelRouter` picks the provider/model for that agent's
  execution — two separate concerns that must stay separate classes.

## Explicitly out of scope for Milestone 1

Do not add any of the following without an explicit new milestone
directive — they were deliberately excluded:

- Gmail / Google Calendar integration
- Phone app, SMS, WhatsApp, Telegram, voice assistant
- Financial agent, trading, autonomous purchasing
- Browser automation
- An elaborate dashboard/UI
- Kubernetes or cloud deployment
- A vector database or RAG pipeline
- Additional agents beyond Research / Developer / Admin
- Multi-machine distributed execution
- A real approval-workflow UI for `REQUIRES_APPROVAL` (Milestone 1 only
  surfaces the requirement and blocks execution — it does not implement an
  approval flow)
- Any Slack command, dashboard, or query surface built on top of usage
  data (e.g. "how much did I spend today") — the usage foundation exists;
  the reporting surface does not, on purpose
- Complicated billing infrastructure, invoicing, or a third provider
  beyond Anthropic/OpenAI — the architecture supports adding one, but
  don't add one speculatively

If a task genuinely requires one of these, stop and flag it rather than
implementing it inline.

## Where things live (quick index)

| Concern | File |
|---|---|
| Orchestration | `src/core/orchestrator.ts` |
| Task routing (which agent?) | `src/core/router.ts` |
| Task lifecycle | `src/core/taskManager.ts`, `src/core/taskStore.ts` |
| Agent discovery | `src/core/agentRegistry.ts` |
| Permissions | `src/core/permissions.ts`, `src/config/permissions.config.ts` |
| Agents | `src/agents/*.ts` |
| Tools | `src/tools/*.ts` |
| LLM provider abstraction | `src/providers/*.ts` |
| Model routing (which provider/model?) | `src/core/modelRouter.ts`, `src/config/models.config.ts`, `src/config/agentModelPreferences.config.ts` |
| LLM call orchestration (fallback/escalation) | `src/core/llmService.ts`, `src/config/escalation.config.ts` |
| Provider discovery | `src/core/providerRegistry.ts` |
| Cost estimation | `src/core/costCalculator.ts`, `src/config/pricing.config.ts` |
| Budget guardrails | `src/core/budgetGuard.ts` |
| Task persistence | `src/memory/sqliteTaskStore.ts` |
| Usage/cost persistence | `src/memory/sqliteUsageStore.ts` |
| Slack interface | `src/app/slackApp.ts` |
| Logging | `src/app/logger.ts` |
| Composition root (wiring) | `src/index.ts` |

When in doubt: the composition root (`src/index.ts`) is the only place that
should `new` up concrete implementations (agents, tools, providers, task
and usage stores) and wire them together. Every other file should depend
on interfaces/abstractions passed in via constructor.
