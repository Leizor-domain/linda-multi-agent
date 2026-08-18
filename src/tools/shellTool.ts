import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Tool } from "./toolRegistry.js";
import { ApprovalRequiredError } from "./toolRegistry.js";

const execFileAsync = promisify(execFile);

export interface ShellInput {
  command: string;
  args?: string[];
  cwd?: string;
}

export interface ShellOutput {
  stdout: string;
  stderr: string;
}

// Deliberately small allowlist of read-only, non-destructive commands.
// Anything not on this list is treated as dangerous and requires approval —
// it is never executed automatically.
const SAFE_COMMANDS = new Set(["ls", "pwd", "cat", "echo", "node", "git"]);
const SAFE_GIT_SUBCOMMANDS = new Set(["status", "log", "diff", "branch"]);

export class ShellTool implements Tool<ShellInput, ShellOutput> {
  name = "shell" as const;
  description = "Run a shell command from a small safe allowlist. Dangerous commands require approval and are never auto-executed.";

  constructor(private readonly sandboxCwd: string) {}

  private assertSafe(input: ShellInput): void {
    if (!SAFE_COMMANDS.has(input.command)) {
      throw new ApprovalRequiredError(
        `Command '${input.command}' is not in the safe allowlist and requires human approval before it can run.`
      );
    }
    if (input.command === "git") {
      const sub = input.args?.[0];
      if (!sub || !SAFE_GIT_SUBCOMMANDS.has(sub)) {
        throw new ApprovalRequiredError(
          `'git ${sub ?? ""}' is not a read-only git subcommand and requires human approval.`
        );
      }
    }
  }

  async run(input: ShellInput): Promise<ShellOutput> {
    this.assertSafe(input);
    const { stdout, stderr } = await execFileAsync(input.command, input.args ?? [], {
      cwd: input.cwd ?? this.sandboxCwd,
      timeout: 10_000,
    });
    return { stdout, stderr };
  }
}
