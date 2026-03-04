// Date helper functions

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
