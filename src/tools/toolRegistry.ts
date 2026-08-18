import type {
  PermissionDecision,
  ToolInvocationResult,
  ToolName,
} from "../models/types.js";
import type { PermissionsManager } from "../core/permissions.js";
import type { Logger } from "../app/logger.js";

export interface Tool<TInput = unknown, TOutput = unknown> {
  name: ToolName;
  description: string;
  /** Actual side-effecting logic. Called only after permission is granted. */
  run(input: TInput, agentId: string): Promise<TOutput>;
}

/**
 * Thrown by a tool implementation when the coarse-grained policy allowed
 * reaching the tool, but the specific operation is risky enough to need
 * human approval (e.g. a filesystem write outside a safe path, or a
 * dangerous shell command). The registry translates this into a
 * REQUIRES_APPROVAL result instead of a hard failure.
 */
export class ApprovalRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApprovalRequiredError";
  }
}

/**
 * ToolRegistry is the only way an agent can reach an external capability.
 * Every invocation goes through:
 *   1. identify requesting agent
 *   2. identify requested tool
 *   3. check permission
 *   4. permit or reject
 *   5. log the decision
 * Tools are never globally accessible — an agent must be passed a bound
 * invoke function that already knows its own agentId and allowlist
 * (see core/orchestrator.ts buildExecutionContext).
 */
export class ToolRegistry {
  private readonly tools = new Map<ToolName, Tool>();

  constructor(
    private readonly permissions: PermissionsManager,
    private readonly logger: Logger
  ) {}

  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  has(name: ToolName): boolean {
    return this.tools.has(name);
  }

  async invoke<TInput, TOutput>(
    agentId: string,
    agentAllowedTools: ToolName[],
    toolName: ToolName,
    input: TInput
  ): Promise<ToolInvocationResult<TOutput>> {
    this.logger.info({ event: "tool_request", agentId, toolName });

    if (!agentAllowedTools.includes(toolName)) {
      const decision: PermissionDecision = "DENY";
      this.logger.info({ event: "permission_decision", agentId, toolName, decision, reason: "not_in_agent_allowlist" });
      return { decision, success: false, error: `Agent '${agentId}' is not permitted to use tool '${toolName}'.` };
    }

    const decision = this.permissions.check(agentId, toolName);

    if (decision === "DENY") {
      return { decision, success: false, error: `Permission denied for tool '${toolName}'.` };
    }

    if (decision === "REQUIRES_APPROVAL") {
      // Milestone 1: we surface this back to the caller rather than executing.
      // A future milestone wires this into an actual approval workflow.
      return { decision, success: false, error: `Tool '${toolName}' requires human approval before it can run.` };
    }

    const tool = this.tools.get(toolName);
    if (!tool) {
      return { decision, success: false, error: `Tool '${toolName}' is not registered.` };
    }

    try {
      const output = await tool.run(input, agentId);
      return { decision, success: true, output: output as TOutput };
    } catch (err) {
      if (err instanceof ApprovalRequiredError) {
        this.logger.info({ event: "permission_decision", agentId, toolName, decision: "REQUIRES_APPROVAL", reason: err.message });
        return { decision: "REQUIRES_APPROVAL", success: false, error: err.message };
      }
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error({ event: "tool_execution_failed", agentId, toolName, error: message });
      return { decision, success: false, error: message };
    }
  }
}
