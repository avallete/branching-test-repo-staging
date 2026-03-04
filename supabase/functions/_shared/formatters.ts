// Response formatting utilities
import { toISO } from "./date-helpers.ts";
import { capitalize } from "./string-utils.ts";

export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
  meta: { timestamp: string; requestId: string };
}

export function success<T>(data: T, requestId: string): ApiResponse<T> {
  return {
    data,
    error: null,
    meta: { timestamp: toISO(new Date()), requestId },
  };
}

export function error(message: string, requestId: string): ApiResponse<never> {
  return {
    data: null,
    error: capitalize(message),
    meta: { timestamp: toISO(new Date()), requestId },
  };
}

export function jsonResponse<T>(body: ApiResponse<T>, status: number = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  while (bytes >= 1024 && i < units.length - 1) { bytes /= 1024; i++; }
  return `${bytes.toFixed(1)} ${units[i]}`;
}
