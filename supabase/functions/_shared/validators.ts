// Validation utilities
import { slugify, truncate } from "./string-utils.ts";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateEmail(email: string): ValidationResult {
  const errors: string[] = [];
  if (!email.includes("@")) errors.push("Missing @ symbol");
  if (email.length > 254) errors.push("Email too long");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push("Invalid format");
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
