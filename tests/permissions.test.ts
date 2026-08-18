import { describe, it, expect, beforeEach } from "vitest";
import { PermissionsManager } from "../src/core/permissions.js";
import { ToolRegistry } from "../src/tools/toolRegistry.js";
import { WebSearchTool } from "../src/tools/webSearchTool.js";
import { FilesystemTool } from "../src/tools/filesystemTool.js";
import { ShellTool } from "../src/tools/shellTool.js";
import { createLogger } from "../src/app/logger.js";
import { permissionPolicy } from "../src/config/permissions.config.js";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

describe("PermissionsManager", () => {
  const logger = createLogger("error");
  const perms = new PermissionsManager(permissionPolicy, logger);

  it("denies Research Agent shell access", () => {
    expect(perms.check("research", "shell")).toBe("DENY");
  });

  it("denies Research Agent filesystem access", () => {
    expect(perms.check("research", "filesystem")).toBe("DENY");
  });

  it("allows Research Agent web access", () => {
    expect(perms.check("research", "web_search")).toBe("ALLOW");
  });

  it("allows Developer Agent to reach filesystem and shell (fine-grained risk is enforced by the tool)", () => {
    expect(perms.check("developer", "filesystem")).toBe("ALLOW");
    expect(perms.check("developer", "shell")).toBe("ALLOW");
  });

  it("denies Admin Agent filesystem and shell", () => {
    expect(perms.check("admin", "filesystem")).toBe("DENY");
    expect(perms.check("admin", "shell")).toBe("DENY");
  });

  it("defaults unknown agent/tool combinations to DENY (fail closed)", () => {
    expect(perms.check("nonexistent-agent", "shell")).toBe("DENY");
  });
});

describe("ToolRegistry permission gating", () => {
  const logger = createLogger("error");
  const perms = new PermissionsManager(permissionPolicy, logger);
  let registry: ToolRegistry;
  let sandbox: string;

  beforeEach(async () => {
    registry = new ToolRegistry(perms, logger);
    sandbox = await fs.mkdtemp(path.join(os.tmpdir(), "linda-fs-"));
    await fs.writeFile(path.join(sandbox, "sample.txt"), "hello world");
    registry.register(new WebSearchTool());
    registry.register(new FilesystemTool(sandbox));
    registry.register(new ShellTool(sandbox));
  });

  it("denies a tool not in the agent's own allowlist, before even checking policy", async () => {
    const result = await registry.invoke("research", ["web_search"], "shell", { command: "ls" });
    expect(result.decision).toBe("DENY");
    expect(result.success).toBe(false);
  });

  it("Research Agent can execute web_search", async () => {
    const result = await registry.invoke("research", ["web_search"], "web_search", { query: "test" });
    expect(result.success).toBe(true);
  });

  it("Developer Agent can read a file inside the sandbox", async () => {
    const result = await registry.invoke(
      "developer",
      ["web_search", "filesystem", "shell"],
      "filesystem",
      { operation: "read", filePath: "sample.txt" }
    );
    expect(result.success).toBe(true);
  });

  it("Developer Agent filesystem writes require approval and do not execute", async () => {
    const result = await registry.invoke(
      "developer",
      ["web_search", "filesystem", "shell"],
      "filesystem",
      { operation: "write", filePath: "new.txt", content: "x" }
    );
    expect(result.decision).toBe("REQUIRES_APPROVAL");
    expect(result.success).toBe(false);
    await expect(fs.access(path.join(sandbox, "new.txt"))).rejects.toBeDefined();
  });

  it("Developer Agent safe shell commands execute", async () => {
    // Use 'node' rather than a POSIX-only binary like 'pwd': node is already
    // on the safe allowlist, and unlike 'pwd'/'ls'/'cat'/'echo' it is
    // guaranteed to be a real, directly spawnable executable on Windows,
    // Linux, and macOS alike (it's the runtime running this very test).
    const result = await registry.invoke(
      "developer",
      ["web_search", "filesystem", "shell"],
      "shell",
      { command: "node", args: ["--version"] }
    );
    expect(result.success).toBe(true);
    expect((result.output as { stdout: string }).stdout.trim()).toMatch(/^v\d+\.\d+\.\d+$/);
  });

  it("Developer Agent dangerous shell commands require approval and do not execute", async () => {
    const result = await registry.invoke(
      "developer",
      ["web_search", "filesystem", "shell"],
      "shell",
      { command: "rm", args: ["-rf", "somefile"] }
    );
    expect(result.decision).toBe("REQUIRES_APPROVAL");
    expect(result.success).toBe(false);
  });

  it("filesystem tool blocks sandbox path traversal", async () => {
    const result = await registry.invoke(
      "developer",
      ["web_search", "filesystem", "shell"],
      "filesystem",
      { operation: "read", filePath: "../../etc/passwd" }
    );
    expect(result.success).toBe(false);
  });

  it("denied tool requests never reach the underlying tool implementation", async () => {
    const result = await registry.invoke("admin", ["web_search"], "shell", { command: "ls" });
    expect(result.success).toBe(false);
  });
});
