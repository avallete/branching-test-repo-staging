// Request middleware
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
