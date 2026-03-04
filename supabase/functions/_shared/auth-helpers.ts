// Authentication helpers
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
    throw new ForbiddenError(`Requires role: ${roles.join(" or ")}`);
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
