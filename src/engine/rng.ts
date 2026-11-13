/**
 * Seeded random number generator (mulberry32).
 *
 * Replaces every RAND() and RANDBETWEEN() in the spreadsheet so that the same
 * seed always produces the same timeline.
 */
export interface Rng {
  /** Uniform float in [0, 1), like the sheet's RAND(). */
  next(): number;
  /** Uniform integer in [low, high] inclusive, like the sheet's RANDBETWEEN(). */
  between(low: number, high: number): number;
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const between = (low: number, high: number): number =>
    low + Math.floor(next() * (high - low + 1));

  return { next, between };
}
