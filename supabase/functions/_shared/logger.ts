// Structured logger
import { toISO } from "./date-helpers.ts";

type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const MIN_LEVEL: LogLevel = (Deno.env.get("LOG_LEVEL") as LogLevel) ?? "info";

export function log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[MIN_LEVEL]) return;
  const entry = {
    timestamp: toISO(new Date()),
    level,
    message,
    ...meta,
  };
  console[level === "error" ? "error" : "log"](JSON.stringify(entry));
}

export const debug = (msg: string, meta?: Record<string, unknown>) => log("debug", msg, meta);
export const info = (msg: string, meta?: Record<string, unknown>) => log("info", msg, meta);
export const warn = (msg: string, meta?: Record<string, unknown>) => log("warn", msg, meta);
export const logError = (msg: string, meta?: Record<string, unknown>) => log("error", msg, meta);
