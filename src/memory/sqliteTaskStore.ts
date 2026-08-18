import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import type { Task } from "../models/types.js";
import type { TaskStore } from "../core/taskStore.js";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  original_request TEXT NOT NULL,
  task_type TEXT NOT NULL,
  assigned_agent_id TEXT,
  status TEXT NOT NULL,
  result TEXT,
  error TEXT,
  requester_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

function rowToTask(row: any): Task {
  return {
    id: row.id,
    originalRequest: row.original_request,
    taskType: row.task_type,
    assignedAgentId: row.assigned_agent_id,
    status: row.status,
    result: row.result,
    error: row.error,
    requesterId: row.requester_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class SQLiteTaskStore implements TaskStore {
  private readonly db: Database.Database;

  constructor(databasePath: string) {
    const dir = path.dirname(databasePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    this.db = new Database(databasePath);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(SCHEMA);
  }

  insert(task: Task): void {
    this.db
      .prepare(
        `INSERT INTO tasks (id, original_request, task_type, assigned_agent_id, status, result, error, requester_id, created_at, updated_at)
         VALUES (@id, @originalRequest, @taskType, @assignedAgentId, @status, @result, @error, @requesterId, @createdAt, @updatedAt)`
      )
      .run(task);
  }

  update(task: Task): void {
    this.db
      .prepare(
        `UPDATE tasks SET
           task_type = @taskType,
           assigned_agent_id = @assignedAgentId,
           status = @status,
           result = @result,
           error = @error,
           updated_at = @updatedAt
         WHERE id = @id`
      )
      .run(task);
  }

  get(taskId: string): Task | undefined {
    const row = this.db.prepare(`SELECT * FROM tasks WHERE id = ?`).get(taskId);
    return row ? rowToTask(row) : undefined;
  }

  list(): Task[] {
    const rows = this.db.prepare(`SELECT * FROM tasks ORDER BY created_at DESC`).all();
    return rows.map(rowToTask);
  }

  close(): void {
    this.db.close();
  }
}
