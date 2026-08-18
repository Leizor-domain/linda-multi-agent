import type { PermissionPolicy } from "../models/types.js";

/**
 * Single source of truth for what each agent is allowed to do.
 * Edit this file to change permissions — do not scatter permission
 * decisions elsewhere in the codebase.
 */
export const permissionPolicy: PermissionPolicy = {
  research: {
    web_search: "ALLOW",
    filesystem: "DENY",
    shell: "DENY",
  },
  developer: {
    // Coarse-grained gate: the Developer Agent may reach these tools at all.
    // Fine-grained risk (write vs read, dangerous vs safe commands) is
    // decided *inside* the tool implementation, which returns its own
    // REQUIRES_APPROVAL result for the specific risky operation.
    web_search: "ALLOW",
    filesystem: "ALLOW",
    shell: "ALLOW",
  },
  admin: {
    web_search: "ALLOW",
    filesystem: "DENY",
    shell: "DENY",
  },
};
