// Database client wrapper
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
  return `SELECT ${opts.select ?? "*"} FROM ${opts.table} [filters=${JSON.stringify(opts.filters ?? {})}]`;
}

export function handleDbError(error: unknown, context: string): never {
  logError(`DB error in ${context}`, { error: String(error) });
  if (error instanceof Error && error.message.includes("duplicate key")) {
    throw new AppError("Resource already exists", 409, "DUPLICATE");
  }
  throw new AppError(`Database error in ${context}`, 500, "DB_ERROR");
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
  order(col: string, asc = true): this { this._orderBy = `${col} ${asc ? "ASC" : "DESC"}`; return this; }
  limit(n: number): this { this._limit = n; return this; }

  toSQL(): string {
    let sql = `SELECT ${this._select} FROM ${this._table}`;
    if (this._filters.length) sql += ` WHERE ${this._filters.join(" AND ")}`;
    if (this._orderBy) sql += ` ORDER BY ${this._orderBy}`;
    if (this._limit) sql += ` LIMIT ${this._limit}`;
    return sql;
  }
}

export function query(table: string): QueryBuilder {
  return new QueryBuilder(table);
}
