import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import type { LLMUsageRecord } from "../models/types.js";
import type { UsageStore } from "../core/usageStore.js";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS llm_usage (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  tier TEXT NOT NULL,
  input_tokens INTEGER,
  output_tokens INTEGER,
  estimated_cost_usd REAL,
  latency_ms INTEGER NOT NULL,
  success INTEGER NOT NULL,
  error TEXT,
  task_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_llm_usage_created_at ON llm_usage (created_at);
`;

function rowToRecord(row: any): LLMUsageRecord {
  return {
    id: row.id,
    provider: row.provider,
    model: row.model,
    tier: row.tier,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    estimatedCostUsd: row.estimated_cost_usd,
    latencyMs: row.latency_ms,
    success: row.success === 1,
    error: row.error,
    taskId: row.task_id,
    agentId: row.agent_id,
    createdAt: row.created_at,
  };
}

/** Separate table from `tasks` (see SQLiteTaskStore), and — deliberately —
 * this implementation may share the same underlying .db file; "persist
 * separately from task history" is satisfied by the distinct table/store
 * abstraction, not by requiring a second physical file. */
export class SQLiteUsageStore implements UsageStore {
  private readonly db: Database.Database;

  constructor(databasePath: string) {
    const dir = path.dirname(databasePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    this.db = new Database(databasePath);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(SCHEMA);
  }

  insert(record: LLMUsageRecord): void {
    this.db
      .prepare(
        `INSERT INTO llm_usage (id, provider, model, tier, input_tokens, output_tokens, estimated_cost_usd, latency_ms, success, error, task_id, agent_id, created_at)
         VALUES (@id, @provider, @model, @tier, @inputTokens, @outputTokens, @estimatedCostUsd, @latencyMs, @success, @error, @taskId, @agentId, @createdAt)`
      )
      .run({ ...record, success: record.success ? 1 : 0 });
  }

  list(): LLMUsageRecord[] {
    const rows = this.db.prepare(`SELECT * FROM llm_usage ORDER BY created_at DESC`).all();
    return rows.map(rowToRecord);
  }

  sumCostSince(sinceIso: string): number {
    const row = this.db
      .prepare(
        `SELECT COALESCE(SUM(estimated_cost_usd), 0) AS total FROM llm_usage
         WHERE created_at >= ? AND estimated_cost_usd IS NOT NULL`
      )
      .get(sinceIso) as { total: number };
    return row.total;
  }

  close(): void {
    this.db.close();
  }
}
