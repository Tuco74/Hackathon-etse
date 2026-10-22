/**
 * Structured JSON logs, one line per event. Never pass lot values, seeds or
 * reconnect tokens here: `trueValue` / `trueTotal` must not appear in stdout.
 */
export interface Logger {
  info(event: string, fields?: Record<string, unknown>): void;
  warn(event: string, fields?: Record<string, unknown>): void;
  error(event: string, fields?: Record<string, unknown>): void;
}

type Level = "info" | "warn" | "error";

function emit(level: Level, scope: string, event: string, fields?: Record<string, unknown>): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    scope,
    event,
    ...fields,
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export function createLogger(scope: string): Logger {
  return {
    info: (event, fields) => emit("info", scope, event, fields),
    warn: (event, fields) => emit("warn", scope, event, fields),
    error: (event, fields) => emit("error", scope, event, fields),
  };
}
