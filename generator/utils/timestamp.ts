/**
 * Sequential migration timestamp generator.
 * Starts after the last existing migration (20240910083213).
 */

const START_DATE = new Date("2024-09-10T09:00:00Z");
const INTERVAL_MINUTES = 30; // space between migrations

let counter = 0;

export function resetTimestamp(): void {
  counter = 0;
}

/** Generate the next sequential timestamp in YYYYMMDDHHMMSS format */
export function nextTimestamp(): string {
  const date = new Date(START_DATE.getTime() + counter * INTERVAL_MINUTES * 60_000);
  counter++;

  const y = date.getUTCFullYear().toString();
  const mo = (date.getUTCMonth() + 1).toString().padStart(2, "0");
  const d = date.getUTCDate().toString().padStart(2, "0");
  const h = date.getUTCHours().toString().padStart(2, "0");
  const mi = date.getUTCMinutes().toString().padStart(2, "0");
  const s = date.getUTCSeconds().toString().padStart(2, "0");

  return `${y}${mo}${d}${h}${mi}${s}`;
}

/** Get a Date object corresponding to the Nth migration timestamp */
export function timestampToDate(index: number): Date {
  return new Date(START_DATE.getTime() + index * INTERVAL_MINUTES * 60_000);
}
