// Minimal structured logger. No external dependency so it's easy to test
// and swap out later. Redacts anything that looks like a secret.

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const SECRET_KEY_PATTERN = /token|key|secret|password|authorization/i;

function redact(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(redact);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEY_PATTERN.test(k) ? "[REDACTED]" : redact(v);
    }
    return out;
  }
  return value;
}

export interface LogEvent {
  event: string;
  [key: string]: unknown;
}

export class Logger {
  constructor(private readonly minLevel: LogLevel = "info") {}

  private log(level: LogLevel, evt: LogEvent) {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.minLevel]) return;
    const record = {
      ts: new Date().toISOString(),
      level,
      ...redact(evt) as Record<string, unknown>,
    };
    const line = JSON.stringify(record);
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);
  }

  debug(evt: LogEvent) { this.log("debug", evt); }
  info(evt: LogEvent) { this.log("info", evt); }
  warn(evt: LogEvent) { this.log("warn", evt); }
  error(evt: LogEvent) { this.log("error", evt); }
}

export function createLogger(minLevel?: string): Logger {
  const lvl = (minLevel ?? "info").toLowerCase();
  const valid: LogLevel[] = ["debug", "info", "warn", "error"];
  return new Logger(valid.includes(lvl as LogLevel) ? (lvl as LogLevel) : "info");
}
