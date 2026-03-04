// Environment configuration

export function getEnvOrThrow(key: string): string {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`Missing required env var: ${key}`);
  return value;
}

export function getEnvOrDefault(key: string, defaultValue: string): string {
  return Deno.env.get(key) ?? defaultValue;
}

export const SUPABASE_URL = getEnvOrThrow("SUPABASE_URL");
export const SUPABASE_ANON_KEY = getEnvOrThrow("SUPABASE_ANON_KEY");
export const SUPABASE_SERVICE_KEY = getEnvOrDefault("SUPABASE_SERVICE_ROLE_KEY", "");
