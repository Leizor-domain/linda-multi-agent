import type { PermissionDecision, PermissionPolicy, ToolName } from "../models/types.js";
import type { Logger } from "../app/logger.js";

/**
 * PermissionsManager is the single source of truth for whether an agent may
 * invoke a given tool. Nothing else in the system should make that decision.
 *
 * Missing policy entries default to DENY (fail closed).
 */
export class PermissionsManager {
  constructor(
    private readonly policy: PermissionPolicy,
    private readonly logger: Logger
  ) {}

  check(agentId: string, tool: ToolName): PermissionDecision {
    const decision = this.policy[agentId]?.[tool] ?? "DENY";
    this.logger.info({
      event: "permission_decision",
      agentId,
      tool,
      decision,
    });
    return decision;
  }
}
