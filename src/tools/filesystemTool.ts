import { promises as fs } from "node:fs";
import path from "node:path";
import type { Tool } from "./toolRegistry.js";
import { ApprovalRequiredError } from "./toolRegistry.js";

export interface FilesystemInput {
  operation: "read" | "write" | "list";
  filePath: string;
  content?: string;
}

export type FilesystemOutput =
  | { operation: "read"; content: string }
  | { operation: "write"; bytesWritten: number }
  | { operation: "list"; entries: string[] };

/**
 * Sandboxed filesystem access, scoped to `sandboxRoot`. Reads are allowed
 * automatically (per the Developer Agent policy). Writes always require
 * approval in Milestone 1 — there is no approval workflow implemented yet,
 * so writes are consistently surfaced as REQUIRES_APPROVAL rather than
 * silently allowed or silently dropped.
 */
export class FilesystemTool implements Tool<FilesystemInput, FilesystemOutput> {
  name = "filesystem" as const;
  description = "Read, list, or write files inside a sandboxed workspace directory.";

  constructor(private readonly sandboxRoot: string) {}

  private resolveSafe(filePath: string): string {
    const resolved = path.resolve(this.sandboxRoot, filePath);
    const rootResolved = path.resolve(this.sandboxRoot);
    if (!resolved.startsWith(rootResolved)) {
      throw new Error(`Path '${filePath}' escapes the filesystem sandbox.`);
    }
    return resolved;
  }

  async run(input: FilesystemInput): Promise<FilesystemOutput> {
    const target = this.resolveSafe(input.filePath);

    if (input.operation === "read") {
      const content = await fs.readFile(target, "utf-8");
      return { operation: "read", content };
    }

    if (input.operation === "list") {
      const entries = await fs.readdir(target);
      return { operation: "list", entries };
    }

    if (input.operation === "write") {
      // Milestone 1: all writes require approval. This keeps the door open
      // for a future approval workflow without ever silently mutating disk.
      throw new ApprovalRequiredError(
        `Write to '${input.filePath}' requires human approval (no approval workflow implemented yet).`
      );
    }

    throw new Error(`Unknown filesystem operation: ${(input as FilesystemInput).operation}`);
  }
}
