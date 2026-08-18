import { describe, it, expect, beforeEach } from "vitest";
import { TaskManager } from "../src/core/taskManager.js";
import { InMemoryTaskStore } from "../src/core/taskStore.js";
import { createLogger } from "../src/app/logger.js";

describe("TaskManager", () => {
  let tm: TaskManager;

  beforeEach(() => {
    tm = new TaskManager(new InMemoryTaskStore(), createLogger("error"));
  });

  it("creates a task in pending status", () => {
    const task = tm.createTask("do the thing", "user-1");
    expect(task.status).toBe("pending");
    expect(task.taskType).toBe("unknown");
    expect(task.id).toBeTruthy();
  });

  it("walks the full success lifecycle: pending -> assigned -> running -> completed", () => {
    const task = tm.createTask("do the thing", "user-1");
    tm.setTaskType(task.id, "research");
    const assigned = tm.assign(task.id, "research");
    expect(assigned.status).toBe("assigned");
    const running = tm.start(task.id);
    expect(running.status).toBe("running");
    const completed = tm.complete(task.id, "the result");
    expect(completed.status).toBe("completed");
    expect(completed.result).toBe("the result");
  });

  it("walks the failure lifecycle: running -> failed", () => {
    const task = tm.createTask("do the thing", "user-1");
    tm.setTaskType(task.id, "development");
    tm.assign(task.id, "developer");
    tm.start(task.id);
    const failed = tm.fail(task.id, "it broke");
    expect(failed.status).toBe("failed");
    expect(failed.error).toBe("it broke");
  });

  it("rejects invalid transitions", () => {
    const task = tm.createTask("do the thing", "user-1");
    // Cannot go straight from pending to running without assignment.
    expect(() => tm.start(task.id)).toThrow();
  });

  it("rejects transitions out of terminal states", () => {
    const task = tm.createTask("do the thing", "user-1");
    tm.setTaskType(task.id, "research");
    tm.assign(task.id, "research");
    tm.start(task.id);
    tm.complete(task.id, "done");
    expect(() => tm.fail(task.id, "too late")).toThrow();
  });

  it("persists and retrieves task history", () => {
    const t1 = tm.createTask("task one", "user-1");
    const t2 = tm.createTask("task two", "user-1");
    const all = tm.list();
    expect(all.map((t) => t.id).sort()).toEqual([t1.id, t2.id].sort());
    expect(tm.get(t1.id)?.originalRequest).toBe("task one");
  });
});
