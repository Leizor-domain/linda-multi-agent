# Linda — Milestone 1

Linda is a personal multi-agent AI orchestration platform. Milestone 1 delivers the
core foundation: a Slack bot that receives a request, routes it to one of three
specialist agents, executes it under an explicit permission model, and persists the
task history — with an architecture designed so future agents, tools, and providers
can be added without touching the orchestrator or the Slack interface.

## Architecture overview

```
Slack event
  → app/slackApp.ts        (interface only — normalizes event to {text, userId})
  → core/orchestrator.ts    (Linda — creates task, routes, assigns, coordinates)
      → core/router.ts          (classifies request into a TaskCategory — "which AGENT?")
      → core/agentRegistry.ts   (finds a capable agent — Linda never hard-codes one)
      → core/taskManager.ts     (task lifecycle: pending → assigned → running → completed/failed)
      → agents/*.ts             (specialist logic — Research / Developer / Admin)
          → core/llmService.ts      (the ONLY thing agents call for model access)
              → core/modelRouter.ts     (picks provider/model per call — "which MODEL?")
              → core/providerRegistry.ts (available LLM providers — mirrors agentRegistry)
              → providers/*.ts           (Anthropic / OpenAI / Mock — same LLMProvider contract)
              → core/budgetGuard.ts      (rejects execution if a configured budget is exhausted)
              → core/usageStore.ts       (records provider/model/tokens/cost/latency per call)
          → tools/toolRegistry.ts   (every tool call is permission-checked and logged)
              → core/permissions.ts     (ALLOW / DENY / REQUIRES_APPROVAL policy)
              → tools/*.ts              (web search, filesystem, shell — sandboxed)
  → memory/sqliteTaskStore.ts  (persistent task history, behind the TaskStore interface)
  → memory/sqliteUsageStore.ts (persistent LLM usage/cost telemetry, separate table)
```

Key design decisions:

- **Linda contains no specialist logic.** It only creates tasks, routes them, asks the
  registry for a capable agent, and coordinates execution. All domain reasoning lives
  in `agents/*.ts`.
- **Slack is only an interface.** `app/slackApp.ts` normalizes an event into
  `(text, userId)` and calls `LindaOrchestrator.handleRequest()`. It contains no
  routing, agent, or tool logic, and no other interface (CLI, HTTP, etc.) would need
  to duplicate any of that.
- **Every tool call is permission-gated.** `ToolRegistry.invoke()` is the *only* way an
  agent can reach a tool. It checks the agent's own tool allowlist, then the central
  `PermissionsManager` policy, before ever calling the tool. Denied and
  approval-required calls never execute and are logged either way.
- **Agents are provider-independent.** Agents call `LLMService.execute()` and never
  touch a provider SDK or pick a model themselves. See **Multi-Provider Brain** below
  for the full routing/fallback/escalation/cost story.
- **Storage is abstracted.** Agents and the orchestrator depend on the `TaskStore`
  interface. `SQLiteTaskStore` is the Milestone 1 implementation; swapping to Postgres
  later means writing one new class, not touching the orchestrator. LLM usage has its
  own parallel `UsageStore` interface for the same reason.

## Requirements

- Node.js 20+
- npm
- A Slack workspace where you can create/install an app (Socket Mode)
- An Anthropic and/or OpenAI API key (both optional — Linda starts fine with zero, one,
  or both configured; see Multi-Provider Brain below for what happens with none)

## Installation

```bash
git clone <this-repo>
cd linda
npm install
cp .env.example .env
```

`better-sqlite3` is a native module and compiles from source on install. On most
systems `npm install` handles this automatically; see Troubleshooting if it fails.

## Environment variables

Set these in `.env` (see `.env.example`):

| Variable | Required | Description |
|---|---|---|
| `SLACK_BOT_TOKEN` | Yes, to run the Slack bot | Bot token (`xoxb-...`) from your Slack app |
| `SLACK_APP_TOKEN` | Yes, to run the Slack bot | App-level token (`xapp-...`) with `connections:write`, used for Socket Mode |
| `ANTHROPIC_API_KEY` | No | If unset, the Anthropic provider is simply unavailable — not a startup error |
| `OPENAI_API_KEY` | No | If unset, the OpenAI provider is simply unavailable — not a startup error |
| `LLM_DAILY_BUDGET_USD` | No | Hard daily spend cap. Unset/blank means no limit, not $0 — see Multi-Provider Brain |
| `LLM_MONTHLY_BUDGET_USD` | No | Hard monthly spend cap. Same semantics as above |
| `LOG_LEVEL` | No | `debug` \| `info` \| `warn` \| `error` (default `info`) |
| `DATABASE_PATH` | No | SQLite file path (default `./data/linda.db`) — holds both task history and LLM usage telemetry, in separate tables |
| `FS_SANDBOX_ROOT` | No | Root directory the Developer Agent's filesystem/shell tools are confined to (default `./workspace`) |

Model IDs themselves are **not** environment variables — they live in
`src/config/models.config.ts` so they can be changed in one place. See
Multi-Provider Brain below.

Secrets are never logged — `app/logger.ts` redacts any field whose key matches
`token|key|secret|password|authorization`.

## Slack Socket Mode setup

1. Go to https://api.slack.com/apps → **Create New App** → From scratch.
2. Under **Socket Mode**, enable it and generate an app-level token with the
   `connections:write` scope. This is your `SLACK_APP_TOKEN` (`xapp-...`).
3. Under **OAuth & Permissions**, add these bot token scopes:
   - `app_mentions:read`
   - `chat:write`
   - `im:history`
   - `im:read`
   - `im:write`
4. Under **Event Subscriptions**, enable events and subscribe to:
   - `app_mention`
   - `message.im`
5. Install the app to your workspace. Copy the **Bot User OAuth Token**
   (`xoxb-...`) into `SLACK_BOT_TOKEN`.
6. Invite the bot to a channel, or open a DM with it directly.

## Running locally

```bash
npm run dev
```

This runs `src/index.ts` directly via `tsx` (no build step needed for local
development). You should see:

```
⚡️ Linda is running (Socket Mode).
```

Then in Slack: DM the bot, or `@Linda` mention it in a channel, e.g.

- `Research the latest developments in AI agent frameworks.` → Research Agent
- `Inspect this TypeScript project and explain why the API server crashes.` → Developer Agent
- `Help me organize my priorities for tomorrow.` → Admin Agent

For a compiled/production run instead:

```bash
npm run build
npm start
```

Task history persists in the SQLite file at `DATABASE_PATH` — restarting Linda does
not erase it.

## Running tests

```bash
npm test
```

Tests use Vitest with an in-memory `TaskStore`/`UsageStore`, `MockProvider` instances
(no live API calls — sometimes registered under the real `"anthropic"`/`"openai"`
names so tests exercise the actual routing config), and a fully mocked `@slack/bolt`
(no live Slack connection) — nothing in the suite requires network access or real
credentials. See `tests/*.test.ts`, including `providerRegistry.test.ts`,
`modelRouter.test.ts`, `llmService.test.ts`, and `budget.test.ts` for the
multi-provider brain specifically.

## Adding a new agent

1. Add a descriptor to `src/config/agents.config.ts` (`id`, `name`, `description`,
   `capabilities`, `allowedTools`).
2. Create `src/agents/yourAgent.ts` extending `BaseAgent`, implementing `execute()`.
3. Add a permission entry for it in `src/config/permissions.config.ts`.
4. Register it in `src/index.ts`: `registry.register(new YourAgent(llmService));` — agents
   take an `LLMService`, never a raw provider (see Multi-Provider Brain below).

You do **not** need to touch `orchestrator.ts`, `router.ts`, or `slackApp.ts`. If your
agent should handle a brand-new `TaskCategory`, add that category to
`TaskCategory` in `src/models/types.ts` and teach `KeywordRouteClassifier` (in
`core/router.ts`) to recognize it.

## Adding a new tool

1. Create `src/tools/yourTool.ts` implementing the `Tool` interface
   (`name`, `description`, `run(input, agentId)`).
2. Register it in `src/index.ts`: `toolRegistry.register(new YourTool());`.
3. Add the tool name to the `allowedTools` of any agent descriptor that should use it
   (`src/config/agents.config.ts`).
4. Add a policy entry in `src/config/permissions.config.ts` for each agent that may
   use it (`ALLOW` / `DENY` / `REQUIRES_APPROVAL`).

If an operation within your tool is risky (e.g. a destructive action), don't gate it
at the coarse policy level — throw `ApprovalRequiredError` from inside `run()` for
that specific case, the way `FilesystemTool` does for writes and `ShellTool` does for
non-allowlisted commands. The registry turns that into a `REQUIRES_APPROVAL` result
and never executes the risky path.

## Permission model

`ToolRegistry.invoke()` is the only path from an agent to a tool, and it always runs,
in order:

1. Is `toolName` in the requesting agent's own `allowedTools`? If not → `DENY`.
2. What does `PermissionsManager` (backed by `permissionPolicy` in
   `config/permissions.config.ts`) say for this `(agentId, toolName)` pair?
   - `DENY` → rejected, tool never runs.
   - `REQUIRES_APPROVAL` → rejected, tool never runs (no approval workflow exists yet
     in Milestone 1 — this is intentionally a hard stop, not a silent allow).
   - `ALLOW` → proceed to step 3.
3. The tool's `run()` executes. If it throws `ApprovalRequiredError` for a
   specific risky operation (a filesystem write, a non-allowlisted shell command),
   the registry converts that into a `REQUIRES_APPROVAL` result too — the operation
   never runs.

Every decision is logged via `permission_decision` / `tool_request` /
`tool_execution_failed` log events. Current policy:

| Agent | web_search | filesystem | shell |
|---|---|---|---|
| Research | ALLOW | DENY | DENY |
| Developer | ALLOW | ALLOW (reads run; writes always require approval) | ALLOW (safe allowlist only; anything else requires approval) |
| Admin | ALLOW | DENY | DENY |

Shell's safe allowlist is `ls, pwd, cat, echo, node, git` (and for `git`, only
read-only subcommands `status, log, diff, branch`). Everything else requires
approval and does not run.

## Multi-Provider Brain

Linda supports Anthropic and OpenAI behind one abstraction, so no agent is ever
hard-bound to a single provider, and adding a third provider later doesn't touch
agent code.

**Two different routers, two different questions.** These are deliberately separate
classes:

- `core/router.ts` (`AgentRouter`) answers *"which **agent** should perform this
  task?"* — it looks at task text and returns a `TaskCategory`.
- `core/modelRouter.ts` (`ModelRouter`) answers *"which **provider/model** should this
  agent use for this execution?"* — it looks at agent id + cost tier and returns
  ranked `(provider, model)` candidates. It never looks at task text.

**The call chain an agent goes through:**

```
Agent.execute()
  → LLMService.execute({ agentId, taskId, prompt, system, tier? })
      → BudgetGuard.check()               (reject before spending anything, if over budget)
      → ModelRouter.candidatesForTier()   (ranked provider/model options for this tier)
      → provider.generate() for each candidate, in order, until one succeeds
      → on exhausted failure at this tier → escalate to the next tier, repeat
      → UsageStore.insert() for every real attempt, success or failure
  ← { success, text, provider, model, tier, error? }
```

Agents only ever see `LLMService`. They never import a provider SDK, never pick a
model string, and never implement their own retry/fallback logic.

**Providers — `AnthropicProvider` and `OpenAIProvider`** (`src/providers/`) both
implement the same `LLMProvider` interface (`isAvailable()`, `generate(prompt, model,
options)`), constructed with just an API key. Neither throws at construction time if
the key is missing — `isAvailable()` returns `false` instead, so `ProviderRegistry`
and `ModelRouter` simply skip it. This is what lets Linda start with zero, one, or
both providers configured (see Definition of Done in `CLAUDE.md`).

**`ProviderRegistry`** (`src/core/providerRegistry.ts`) holds every registered
provider, mirroring `AgentRegistry`'s philosophy exactly: register once at the
composition root (`src/index.ts`), look up by name everywhere else, never `new` up a
provider outside that one place.

**Cost tiers.** Three tiers — `low`, `standard`, `premium` — configured per agent in
`src/config/agentModelPreferences.config.ts`:

| Agent | Preferred providers (in order) | Default tier |
|---|---|---|
| Admin | openai, anthropic | low |
| Research | openai, anthropic | standard |
| Developer | anthropic, openai | standard |

These are *preferences*, not bindings — if the first provider is unavailable or
fails, `ModelRouter`/`LLMService` try the next one. Actual model IDs per
provider/tier live in `src/config/models.config.ts`, the one place they're allowed to
appear — verify them against each provider's current lineup before enabling paid
usage.

**Fallback vs. escalation** are distinct and logged separately:

- *Fallback*: within one tier, if the first preferred provider fails, try the next
  preferred provider at the *same* tier. Logged as `provider_failure`.
- *Escalation*: if every provider fails at a tier, move up the tier ladder
  (`low → standard → premium`, configured in `src/config/escalation.config.ts`) and
  try again. Logged as `escalation`. Escalation never moves down, and can be disabled
  entirely (`escalationConfig.enabled = false`) to only ever try the starting tier.

Both are bounded by a single hard cap, `escalationConfig.maxAttemptsPerRequest`
(default `4`), counted across *every* real provider call in one `LLMService.execute()`
— every tier and every provider fallback combined. Once hit, `LLMService` stops and
returns failure rather than continuing to spend. This is intentionally conservative;
raise it deliberately, not by accident.

**Usage tracking.** Every real provider attempt — success or failure — is recorded via
`UsageStore` (`src/core/usageStore.ts`, `SQLiteUsageStore` at runtime) with provider,
model, tier, token counts, estimated cost, latency, success/error, `taskId`, `agentId`,
and a timestamp — in a separate `llm_usage` table from task history. Estimated cost
comes from `core/costCalculator.ts` against `config/pricing.config.ts`; when token
counts or a pricing entry aren't available, cost is stored as `null`, never guessed.
No Slack command or query surface is built on top of this yet — it's the data
foundation for future "how much did I spend today" type questions, on purpose (see
`CLAUDE.md` — Milestone 1 stops here deliberately).

**Budgets.** `BudgetGuard` (`src/core/budgetGuard.ts`) sums today's/this month's
recorded cost via `UsageStore.sumCostSince()` and rejects a request *before* any
provider is called if a configured `LLM_DAILY_BUDGET_USD` / `LLM_MONTHLY_BUDGET_USD`
has already been reached. Leaving both unset means no limit — this is a simple hard
guard, not a billing system.

**Adding another provider later:** implement `LLMProvider` in
`src/providers/yourProvider.ts` (constructor takes just credentials;
`isAvailable()` reflects whether they're present), add its model IDs to
`config/models.config.ts` and pricing to `config/pricing.config.ts`, register an
instance in `src/index.ts`, and optionally add it to an agent's
`preferredProviders` in `config/agentModelPreferences.config.ts`. Nothing in
`ModelRouter`, `LLMService`, or any agent needs to change.

## Troubleshooting

- **`better-sqlite3` fails to build during `npm install`**: it needs a C++ toolchain.
  On Debian/Ubuntu: `sudo apt-get install -y build-essential python3`. On macOS,
  install Xcode Command Line Tools: `xcode-select --install`.
- **Slack app doesn't respond**: confirm Socket Mode is enabled and
  `SLACK_APP_TOKEN` has `connections:write`; confirm the bot is invited to the
  channel/DM; confirm `app_mention` and `message.im` events are subscribed.
- **Linda replies that no agent is available**: the router classified the request as
  `unknown`. Rephrase, or extend `KeywordRouteClassifier` in `core/router.ts`.
- **Neither `ANTHROPIC_API_KEY` nor `OPENAI_API_KEY` is set**: Linda still starts —
  `ProviderRegistry` just has nothing available. Agent tasks that need generation fail
  gracefully with `"No configured LLM provider is currently available."` rather than an
  obscure SDK auth error or a crash. Tests never hit this path for real — they use
  `MockProvider`, which is documented as test-only and is never registered at runtime.
- **A reply unexpectedly fails with a budget message**: `LLM_DAILY_BUDGET_USD` /
  `LLM_MONTHLY_BUDGET_USD` are hard caps checked *before* any provider call — once
  reached, every request fails closed until the window rolls over. Unset/blank means
  no limit, not `$0`; double-check you didn't set either to `0`.
- **A filesystem write or shell command "does nothing"**: this is expected in
  Milestone 1 — those operations return `REQUIRES_APPROVAL` and are never executed,
  since no approval workflow exists yet.
- **Startup exits immediately with a missing-env-var error**: `SLACK_BOT_TOKEN` and
  `SLACK_APP_TOKEN` are required to start the Slack app; copy `.env.example` to `.env`
  and fill them in.
