// Core domain types shared across Linda. Keep this file dependency-free so
// every layer (core, agents, tools, providers) can import it without
// creating import cycles.

export type TaskStatus =
  | "pending"
  | "assigned"
  | "running"
  | "completed"
  | "failed";

export type TaskCategory =
  | "research"
  | "development"
  | "administration"
  | "unknown";

export interface Task {
  id: string;
  originalRequest: string;
  taskType: TaskCategory;
  assignedAgentId: string | null;
  status: TaskStatus;
  result: string | null;
  error: string | null;
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
  requesterId: string; // Slack user id or "test-user" etc.
}

export interface ToolCallRecord {
  toolName: string;
  input: unknown;
  decision: PermissionDecision;
  success: boolean;
  output?: unknown;
  error?: string;
}

export interface AgentResult {
  success: boolean;
  output: string;
  metadata?: Record<string, unknown>;
  toolCalls: ToolCallRecord[];
  error?: string;
}

export type PermissionDecision = "ALLOW" | "DENY" | "REQUIRES_APPROVAL";

export type ToolName = "web_search" | "filesystem" | "shell";

/** Per-agent, per-tool permission policy. A missing entry means DENY. */
export type PermissionPolicy = Record<string, Partial<Record<ToolName, PermissionDecision>>>;

export interface AgentCapabilityDescriptor {
  id: string;
  name: string;
  description: string;
  capabilities: TaskCategory[];
  allowedTools: ToolName[];
}

/** Context passed into an agent when it executes a task. */
export interface AgentExecutionContext {
  task: Task;
  requestTool: <TInput, TOutput>(
    toolName: ToolName,
    input: TInput
  ) => Promise<ToolInvocationResult<TOutput>>;
}

export interface ToolInvocationResult<T = unknown> {
  decision: PermissionDecision;
  success: boolean;
  output?: T;
  error?: string;
}

// --- Multi-provider brain types -------------------------------------------
// Added for the multi-provider architecture. Pure additions — nothing above
// this line changed.

/** Known LLM providers. "mock" exists so tests can exercise the full
 * ProviderRegistry -> ModelRouter -> LLMService pipeline without any paid
 * API access. */
export type ProviderName = "anthropic" | "openai" | "mock";

/** Cost/capability tier used by ModelRouter to pick a model, independent of
 * which agent or which provider is involved. */
export type CostTier = "low" | "standard" | "premium";

/** One row of LLM usage/cost telemetry, persisted separately from task
 * history via UsageStore. estimatedCostUsd is null whenever token usage or
 * pricing data isn't reliably known — never fabricated. */
export interface LLMUsageRecord {
  id: string;
  provider: ProviderName;
  model: string;
  tier: CostTier;
  inputTokens: number | null;
  outputTokens: number | null;
  estimatedCostUsd: number | null;
  latencyMs: number;
  success: boolean;
  error: string | null;
  taskId: string;
  agentId: string;
  createdAt: string; // ISO timestamp
}
