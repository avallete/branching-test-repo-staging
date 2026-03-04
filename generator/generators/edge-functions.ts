import fs from "fs";
import path from "path";
import type { GeneratorConfig } from "../config.js";
import { initRandom, getFaker, pick, pickN, randInt, snakeId } from "../utils/random.js";

// --- Shared Module Layers ---

interface SharedModule {
  name: string;
  filename: string;
  layer: number;
  imports: string[];
  content: string;
}

const DENO_STD_IMPORTS = [
  'import { serve } from "https://deno.land/std@0.208.0/http/server.ts";',
  'import { Status } from "https://deno.land/std@0.208.0/http/http_status.ts";',
  'import { encode as base64Encode } from "https://deno.land/std@0.208.0/encoding/base64.ts";',
  'import { crypto } from "https://deno.land/std@0.208.0/crypto/mod.ts";',
  'import { format as formatDate } from "https://deno.land/std@0.208.0/datetime/format.ts";',
];

const ESM_IMPORTS = [
  'import { createClient } from "https://esm.sh/@supabase/supabase-js@2";',
  'import { z } from "https://esm.sh/zod@3.22.4";',
  'import { nanoid } from "https://esm.sh/nanoid@5.0.4";',
];

function generateLayer0Modules(): SharedModule[] {
  return [
    {
      name: "crypto-utils",
      filename: "crypto-utils.ts",
      layer: 0,
      imports: [],
      content: `// Crypto utility functions
${DENO_STD_IMPORTS[3]}
${DENO_STD_IMPORTS[2]}

export async function hashSHA256(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const buffer = await crypto.subtle.digest("SHA-256", encoder.encode(data));
  return base64Encode(buffer);
}

export function generateToken(length: number = 32): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hmacSign(key: string, data: string): Promise<string> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(data));
  return base64Encode(sig);
}
`,
    },
    {
      name: "date-helpers",
      filename: "date-helpers.ts",
      layer: 0,
      imports: [],
      content: `// Date helper functions

export function toISO(date: Date): string {
  return date.toISOString();
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

export function daysBetween(a: Date, b: Date): number {
  const msPerDay = 86400000;
  return Math.round(Math.abs(a.getTime() - b.getTime()) / msPerDay);
}

export function isExpired(date: Date, ttlMs: number): boolean {
  return Date.now() - date.getTime() > ttlMs;
}
`,
    },
    {
      name: "string-utils",
      filename: "string-utils.ts",
      layer: 0,
      imports: [],
      content: `// String utility functions

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + "...";
}

export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, (m) => "_" + m.toLowerCase());
}

export function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
`,
    },
    {
      name: "env-config",
      filename: "env-config.ts",
      layer: 0,
      imports: [],
      content: `// Environment configuration

export function getEnvOrThrow(key: string): string {
  const value = Deno.env.get(key);
  if (!value) throw new Error(\`Missing required env var: \${key}\`);
  return value;
}

export function getEnvOrDefault(key: string, defaultValue: string): string {
  return Deno.env.get(key) ?? defaultValue;
}

export const SUPABASE_URL = getEnvOrThrow("SUPABASE_URL");
export const SUPABASE_ANON_KEY = getEnvOrThrow("SUPABASE_ANON_KEY");
export const SUPABASE_SERVICE_KEY = getEnvOrDefault("SUPABASE_SERVICE_ROLE_KEY", "");
`,
    },
    {
      name: "constants",
      filename: "constants.ts",
      layer: 0,
      imports: [],
      content: `// Shared constants

export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
export const ALLOWED_MIME_TYPES = [
  "image/jpeg", "image/png", "image/gif", "image/webp",
  "application/pdf", "text/plain", "text/csv",
  "application/json", "application/xml",
];
export const RATE_LIMIT_WINDOW = 60_000;
export const RATE_LIMIT_MAX = 100;
export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, x-client-info",
};
`,
    },
  ];
}

function generateLayer1Modules(layer0: SharedModule[]): SharedModule[] {
  return [
    {
      name: "validators",
      filename: "validators.ts",
      layer: 1,
      imports: ["string-utils"],
      content: `// Validation utilities
import { slugify, truncate } from "./string-utils.ts";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateEmail(email: string): ValidationResult {
  const errors: string[] = [];
  if (!email.includes("@")) errors.push("Missing @ symbol");
  if (email.length > 254) errors.push("Email too long");
  if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) errors.push("Invalid format");
  return { valid: errors.length === 0, errors };
}

export function validateSlug(input: string): { valid: boolean; slug: string } {
  const slug = slugify(input);
  return { valid: slug.length > 0 && slug.length <= 100, slug };
}

export function validatePagination(page?: number, pageSize?: number): { page: number; pageSize: number } {
  return {
    page: Math.max(1, page ?? 1),
    pageSize: Math.min(100, Math.max(1, pageSize ?? 20)),
  };
}

export function sanitizeInput(input: string, maxLength: number = 1000): string {
  return truncate(input.trim(), maxLength);
}
`,
    },
    {
      name: "formatters",
      filename: "formatters.ts",
      layer: 1,
      imports: ["date-helpers", "string-utils"],
      content: `// Response formatting utilities
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
  return \`\${bytes.toFixed(1)} \${units[i]}\`;
}
`,
    },
    {
      name: "logger",
      filename: "logger.ts",
      layer: 1,
      imports: ["date-helpers"],
      content: `// Structured logger
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
`,
    },
    {
      name: "errors",
      filename: "errors.ts",
      layer: 1,
      imports: ["string-utils"],
      content: `// Custom error types
import { capitalize } from "./string-utils.ts";

export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code: string = "INTERNAL_ERROR"
  ) {
    super(capitalize(message));
    this.name = "AppError";
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super(\`\${resource}\${id ? \` \${id}\` : ""} not found\`, 404, "NOT_FOUND");
  }
}

export class ValidationError extends AppError {
  constructor(message: string, public fields: Record<string, string> = {}) {
    super(message, 400, "VALIDATION_ERROR");
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = "Unauthorized") {
    super(message, 401, "UNAUTHORIZED");
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = "Forbidden") {
    super(message, 403, "FORBIDDEN");
  }
}

export class RateLimitError extends AppError {
  constructor(retryAfter: number) {
    super(\`Rate limit exceeded. Retry after \${retryAfter}s\`, 429, "RATE_LIMITED");
  }
}
`,
    },
    {
      name: "rate-limiter",
      filename: "rate-limiter.ts",
      layer: 1,
      imports: ["constants"],
      content: `// In-memory rate limiter
import { RATE_LIMIT_WINDOW, RATE_LIMIT_MAX } from "./constants.ts";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

export function checkRateLimit(key: string, maxRequests = RATE_LIMIT_MAX, windowMs = RATE_LIMIT_WINDOW): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  let entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + windowMs };
    store.set(key, entry);
  }

  entry.count++;

  return {
    allowed: entry.count <= maxRequests,
    remaining: Math.max(0, maxRequests - entry.count),
    resetAt: entry.resetAt,
  };
}

export function clearExpired(): void {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.resetAt) store.delete(key);
  }
}
`,
    },
  ];
}

function generateLayer2Modules(layer1: SharedModule[]): SharedModule[] {
  return [
    {
      name: "middleware",
      filename: "middleware.ts",
      layer: 2,
      imports: ["validators", "formatters", "logger", "errors", "rate-limiter", "constants"],
      content: `// Request middleware
import { validateEmail, validatePagination } from "./validators.ts";
import { error, jsonResponse } from "./formatters.ts";
import { info, logError } from "./logger.ts";
import { AppError, UnauthorizedError } from "./errors.ts";
import { checkRateLimit } from "./rate-limiter.ts";
import { CORS_HEADERS } from "./constants.ts";

export type Handler = (req: Request, ctx: RequestContext) => Promise<Response>;

export interface RequestContext {
  requestId: string;
  userId?: string;
  startTime: number;
}

export function withCors(handler: Handler): Handler {
  return async (req, ctx) => {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    const response = await handler(req, ctx);
    for (const [k, v] of Object.entries(CORS_HEADERS)) {
      response.headers.set(k, v);
    }
    return response;
  };
}

export function withAuth(handler: Handler): Handler {
  return async (req, ctx) => {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      throw new UnauthorizedError("Missing bearer token");
    }
    ctx.userId = "authenticated-user";
    return handler(req, ctx);
  };
}

export function withRateLimit(handler: Handler, max: number = 100): Handler {
  return async (req, ctx) => {
    const key = ctx.userId ?? req.headers.get("x-forwarded-for") ?? "anonymous";
    const result = checkRateLimit(key, max);
    if (!result.allowed) {
      return jsonResponse(error("Rate limit exceeded", ctx.requestId), 429);
    }
    const response = await handler(req, ctx);
    response.headers.set("X-RateLimit-Remaining", result.remaining.toString());
    return response;
  };
}

export function withErrorHandler(handler: Handler): Handler {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      if (err instanceof AppError) {
        logError(err.message, { code: err.code, statusCode: err.statusCode });
        return jsonResponse(error(err.message, ctx.requestId), err.statusCode);
      }
      logError("Unhandled error", { error: String(err) });
      return jsonResponse(error("Internal server error", ctx.requestId), 500);
    }
  };
}

export function createContext(): RequestContext {
  return {
    requestId: crypto.randomUUID(),
    startTime: Date.now(),
  };
}
`,
    },
    {
      name: "auth-helpers",
      filename: "auth-helpers.ts",
      layer: 2,
      imports: ["validators", "errors", "logger"],
      content: `// Authentication helpers
import { validateEmail } from "./validators.ts";
import { UnauthorizedError, ForbiddenError } from "./errors.ts";
import { info, warn } from "./logger.ts";

export interface UserClaims {
  sub: string;
  email: string;
  role: string;
  exp: number;
}

export function parseJwtPayload(token: string): UserClaims {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) throw new Error("Invalid JWT format");
    const payload = JSON.parse(atob(parts[1]));
    return payload as UserClaims;
  } catch {
    throw new UnauthorizedError("Invalid token");
  }
}

export function requireRole(claims: UserClaims, ...roles: string[]): void {
  if (!roles.includes(claims.role)) {
    warn("Forbidden role access attempt", { userId: claims.sub, role: claims.role, required: roles });
    throw new ForbiddenError(\`Requires role: \${roles.join(" or ")}\`);
  }
}

export function isTokenExpired(claims: UserClaims): boolean {
  return Date.now() >= claims.exp * 1000;
}

export function extractBearerToken(req: Request): string {
  const header = req.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) {
    throw new UnauthorizedError("Missing bearer token");
  }
  return header.slice(7);
}

export async function validateAuthRequest(req: Request): Promise<UserClaims> {
  const token = extractBearerToken(req);
  const claims = parseJwtPayload(token);
  if (isTokenExpired(claims)) {
    throw new UnauthorizedError("Token expired");
  }
  info("Auth validated", { userId: claims.sub });
  return claims;
}
`,
    },
    {
      name: "db-client",
      filename: "db-client.ts",
      layer: 2,
      imports: ["logger", "errors"],
      content: `// Database client wrapper
import { info, logError } from "./logger.ts";
import { AppError } from "./errors.ts";

// Re-export for convenience
export { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface QueryOptions {
  table: string;
  select?: string;
  filters?: Record<string, unknown>;
  orderBy?: string;
  ascending?: boolean;
  limit?: number;
  offset?: number;
}

export function buildQueryLog(opts: QueryOptions): string {
  return \`SELECT \${opts.select ?? "*"} FROM \${opts.table} [filters=\${JSON.stringify(opts.filters ?? {})}]\`;
}

export function handleDbError(error: unknown, context: string): never {
  logError(\`DB error in \${context}\`, { error: String(error) });
  if (error instanceof Error && error.message.includes("duplicate key")) {
    throw new AppError("Resource already exists", 409, "DUPLICATE");
  }
  throw new AppError(\`Database error in \${context}\`, 500, "DB_ERROR");
}

export class QueryBuilder {
  private _table: string;
  private _select: string = "*";
  private _filters: string[] = [];
  private _orderBy?: string;
  private _limit?: number;

  constructor(table: string) {
    this._table = table;
  }

  select(cols: string): this { this._select = cols; return this; }
  where(condition: string): this { this._filters.push(condition); return this; }
  order(col: string, asc = true): this { this._orderBy = \`\${col} \${asc ? "ASC" : "DESC"}\`; return this; }
  limit(n: number): this { this._limit = n; return this; }

  toSQL(): string {
    let sql = \`SELECT \${this._select} FROM \${this._table}\`;
    if (this._filters.length) sql += \` WHERE \${this._filters.join(" AND ")}\`;
    if (this._orderBy) sql += \` ORDER BY \${this._orderBy}\`;
    if (this._limit) sql += \` LIMIT \${this._limit}\`;
    return sql;
  }
}

export function query(table: string): QueryBuilder {
  return new QueryBuilder(table);
}
`,
    },
    {
      name: "storage-helpers",
      filename: "storage-helpers.ts",
      layer: 2,
      imports: ["validators", "formatters", "logger", "constants"],
      content: `// Storage operation helpers
import { sanitizeInput } from "./validators.ts";
import { formatBytes } from "./formatters.ts";
import { info, warn } from "./logger.ts";
import { MAX_FILE_SIZE, ALLOWED_MIME_TYPES } from "./constants.ts";

export interface UploadResult {
  path: string;
  size: number;
  mimeType: string;
}

export function validateUpload(file: File): { valid: boolean; error?: string } {
  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: \`File too large: \${formatBytes(file.size)} (max \${formatBytes(MAX_FILE_SIZE)})\` };
  }
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return { valid: false, error: \`Unsupported type: \${file.type}\` };
  }
  return { valid: true };
}

export function generateStoragePath(bucket: string, userId: string, filename: string): string {
  const safe = sanitizeInput(filename, 200).replace(/[^a-zA-Z0-9._-]/g, "_");
  const ts = Date.now();
  return \`\${bucket}/\${userId}/\${ts}_\${safe}\`;
}

export function getPublicUrl(bucket: string, path: string, baseUrl: string): string {
  return \`\${baseUrl}/storage/v1/object/public/\${bucket}/\${path}\`;
}

export function parseContentDisposition(header: string | null): string | undefined {
  if (!header) return undefined;
  const match = header.match(/filename="?([^"]+)"?/);
  return match?.[1];
}
`,
    },
    {
      name: "cache",
      filename: "cache.ts",
      layer: 2,
      imports: ["logger"],
      content: `// Simple in-memory cache with TTL
import { info } from "./logger.ts";

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class Cache<T> {
  private store = new Map<string, CacheEntry<T>>();
  private defaultTTL: number;

  constructor(defaultTTLMs: number = 60_000) {
    this.defaultTTL = defaultTTLMs;
  }

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T, ttlMs?: number): void {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + (ttlMs ?? this.defaultTTL),
    });
  }

  delete(key: string): boolean {
    return this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }

  prune(): number {
    const now = Date.now();
    let removed = 0;
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
        removed++;
      }
    }
    return removed;
  }
}
`,
    },
  ];
}

// --- Edge Function Generator ---

function generateLocalHelper(funcName: string, index: number): { filename: string; content: string } {
  const f = getFaker();
  const helperNames = ["utils", "types", "helpers", "transform", "validate", "format", "process"];
  const filename = `${pick(helperNames)}_${index}.ts`;

  const exportCount = randInt(2, 5);
  const exports: string[] = [];

  for (let i = 0; i < exportCount; i++) {
    const fnName = `${snakeId(2)}Helper`;
    exports.push(`
export function ${fnName}(input: unknown): unknown {
  // Helper for ${funcName}
  const data = typeof input === "string" ? input : JSON.stringify(input);
  return { processed: data, timestamp: Date.now() };
}`);
  }

  const typeCount = randInt(1, 3);
  const types: string[] = [];
  for (let i = 0; i < typeCount; i++) {
    const typeName = `${snakeId(2).split("_").map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join("")}Type`;
    types.push(`
export interface ${typeName} {
  id: string;
  name: string;
  value: ${pick(["string", "number", "boolean", "Record<string, unknown>"])};
  createdAt: Date;
}`);
  }

  return {
    filename,
    content: `// Local helper module for ${funcName}\n${types.join("\n")}\n${exports.join("\n")}\n`,
  };
}

function generateStaticAsset(funcName: string, index: number): { filename: string; content: string } {
  const f = getFaker();
  const assetType = weightedPickLocal([0.4, 0.3, 0.3]);
  const targetSize = randInt(100, 50000);

  switch (assetType) {
    case 0: {
      // JSON config
      const config: Record<string, unknown> = {};
      while (JSON.stringify(config).length < targetSize) {
        config[snakeId(2)] = {
          enabled: f.datatype.boolean(),
          value: f.lorem.sentence(),
          priority: f.number.int(10),
          tags: Array.from({ length: randInt(2, 5) }, () => f.lorem.word()),
        };
      }
      return { filename: `config_${index}.json`, content: JSON.stringify(config, null, 2) };
    }
    case 1: {
      // Mock data
      const items = [];
      while (JSON.stringify(items).length < targetSize) {
        items.push({
          id: f.string.uuid(),
          name: f.person.fullName(),
          email: f.internet.email(),
          score: f.number.float({ min: 0, max: 100, fractionDigits: 2 }),
          active: f.datatype.boolean(),
        });
      }
      return { filename: `mock_data_${index}.json`, content: JSON.stringify(items, null, 2) };
    }
    default: {
      // Text template
      let content = `# Template ${index} for ${funcName}\n\n`;
      while (content.length < targetSize) {
        content += f.lorem.paragraphs(3) + "\n\n";
      }
      return { filename: `template_${index}.txt`, content };
    }
  }
}

function weightedPickLocal(weights: number[]): number {
  const f = getFaker();
  const total = weights.reduce((a, b) => a + b, 0);
  let r = f.number.float({ min: 0, max: total });
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return weights.length - 1;
}

function generateFunctionIndex(
  funcName: string,
  sharedModules: SharedModule[],
  localHelpers: { filename: string }[]
): string {
  const f = getFaker();

  // Pick 2-5 shared imports
  const sharedImports = pickN(sharedModules, randInt(2, Math.min(5, sharedModules.length)));
  const importLines = sharedImports.map(
    (m) => `import { /* ${m.name} */ } from "../_shared/${m.filename}";`
  );

  // Import local helpers
  const localImportLines = localHelpers.map(
    (h) => `import { /* helpers */ } from "./${h.filename}";`
  );

  const handlerVariant = weightedPickLocal([0.3, 0.3, 0.2, 0.2]);

  let handlerBody: string;
  switch (handlerVariant) {
    case 0:
      handlerBody = `
  const url = new URL(req.url);
  const params = Object.fromEntries(url.searchParams);

  // Process the request
  const result = {
    function: "${funcName}",
    method: req.method,
    params,
    timestamp: new Date().toISOString(),
    data: Array.from({ length: 10 }, (_, i) => ({
      id: i,
      value: \`item_\${i}\`,
    })),
  };

  return new Response(JSON.stringify(result), {
    headers: { "Content-Type": "application/json" },
  });`;
      break;
    case 1:
      handlerBody = `
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body = await req.json();

  // Validate and process
  const processed = {
    ...body,
    processedAt: new Date().toISOString(),
    function: "${funcName}",
  };

  return new Response(JSON.stringify({ data: processed }), {
    headers: { "Content-Type": "application/json" },
  });`;
      break;
    case 2:
      handlerBody = `
  const url = new URL(req.url);
  const pathParts = url.pathname.split("/").filter(Boolean);

  switch (req.method) {
    case "GET":
      return new Response(JSON.stringify({ items: [], total: 0 }), {
        headers: { "Content-Type": "application/json" },
      });
    case "POST": {
      const body = await req.json();
      return new Response(JSON.stringify({ created: body, id: crypto.randomUUID() }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    }
    case "DELETE":
      return new Response(null, { status: 204 });
    default:
      return new Response(JSON.stringify({ error: "Not supported" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
  }`;
      break;
    default:
      handlerBody = `
  // Stream response
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (let i = 0; i < 5; i++) {
        controller.enqueue(encoder.encode(\`data: {"chunk": \${i}, "function": "${funcName}"}\\n\\n\`));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });`;
  }

  return `// Edge function: ${funcName}
// Generated by stress-generator
${importLines.join("\n")}
${localImportLines.join("\n")}

Deno.serve(async (req: Request) => {
  try {${handlerBody}
  } catch (error) {
    console.error(\`Error in ${funcName}:\`, error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
`;
}

// --- Main ---

export async function generateEdgeFunctions(config: GeneratorConfig): Promise<number> {
  initRandom(config.seed + 1000); // Different seed offset for variety

  const functionsDir = path.join(config.projectRoot, "supabase", "functions");
  const sharedDir = path.join(functionsDir, "_shared");
  fs.mkdirSync(sharedDir, { recursive: true });

  // Generate shared modules
  const layer0 = generateLayer0Modules();
  const layer1 = generateLayer1Modules(layer0);
  const layer2 = generateLayer2Modules(layer1);
  const allShared = [...layer0, ...layer1, ...layer2];

  for (const mod of allShared) {
    fs.writeFileSync(path.join(sharedDir, mod.filename), mod.content);
  }

  // Generate individual functions
  const functionNames = [
    "user-profile", "auth-callback", "send-email", "upload-file", "process-webhook",
    "generate-report", "sync-data", "search-index", "notify-users", "export-csv",
    "import-data", "validate-payment", "resize-image", "send-notification", "update-stats",
    "cleanup-expired", "aggregate-metrics", "transform-data", "check-health", "run-migration",
  ];

  let generated = 0;

  for (let i = 0; i < config.edgeFunctionCount; i++) {
    const baseName = i < functionNames.length
      ? functionNames[i]
      : `${snakeId(2)}-handler`;
    const funcName = `func-${String(i + 1).padStart(3, "0")}-${baseName}`;
    const funcDir = path.join(functionsDir, funcName);
    fs.mkdirSync(funcDir, { recursive: true });

    // Local helpers
    const helperCount = randInt(config.localModulesPerFunction.min, config.localModulesPerFunction.max);
    const helpers: { filename: string }[] = [];
    for (let h = 0; h < helperCount; h++) {
      const helper = generateLocalHelper(funcName, h);
      helpers.push({ filename: helper.filename });
      fs.writeFileSync(path.join(funcDir, helper.filename), helper.content);
    }

    // Static assets
    const assetCount = randInt(config.assetsPerFunction.min, config.assetsPerFunction.max);
    for (let a = 0; a < assetCount; a++) {
      const asset = generateStaticAsset(funcName, a);
      fs.writeFileSync(path.join(funcDir, asset.filename), asset.content);
    }

    // Main index.ts
    const indexContent = generateFunctionIndex(funcName, allShared, helpers);
    fs.writeFileSync(path.join(funcDir, "index.ts"), indexContent);

    generated++;
    if (i % 10 === 0) {
      process.stdout.write(`  functions: ${i}/${config.edgeFunctionCount}\r`);
    }
  }

  console.log(`  functions: ${config.edgeFunctionCount}/${config.edgeFunctionCount} done`);
  return generated;
}
