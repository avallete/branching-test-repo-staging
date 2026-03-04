import { faker } from "@faker-js/faker";

let globalSeed = 42;

/** Initialize faker with a seed for reproducibility */
export function initRandom(seed: number): void {
  globalSeed = seed;
  faker.seed(seed);
}

/** Get the seeded faker instance */
export function getFaker() {
  return faker;
}

/** Pick a random item from an array */
export function pick<T>(arr: T[]): T {
  return arr[faker.number.int({ min: 0, max: arr.length - 1 })];
}

/** Pick N unique random items from an array */
export function pickN<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => faker.number.float() - 0.5);
  return shuffled.slice(0, Math.min(n, arr.length));
}

/** Generate a random integer in range [min, max] */
export function randInt(min: number, max: number): number {
  return faker.number.int({ min, max });
}

/** Weighted random selection: returns index based on weights */
export function weightedPick(weights: number[]): number {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = faker.number.float({ min: 0, max: total });
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return weights.length - 1;
}

/** Generate a snake_case identifier */
export function snakeId(wordCount: number = 2): string {
  return faker.lorem
    .words(wordCount)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, "_");
}

/** Generate random bytes as a Buffer */
export function randomBytes(size: number): Buffer {
  const buf = Buffer.alloc(size);
  for (let i = 0; i < size; i++) {
    buf[i] = faker.number.int({ min: 0, max: 255 });
  }
  return buf;
}
