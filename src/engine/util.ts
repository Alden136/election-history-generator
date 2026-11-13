export const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);

export const clamp = (x: number, low: number, high: number): number =>
  Math.max(low, Math.min(high, x));

export const clamp01 = (x: number): number => clamp(x, 0, 1);

/** Index of the first largest value, like the sheet's MATCH(MAX(range), range, 0). */
export function argMax(xs: readonly number[]): number {
  let best = 0;
  for (let i = 1; i < xs.length; i++) if (xs[i]! > xs[best]!) best = i;
  return best;
}

/** Index of the first smallest value. */
export function argMin(xs: readonly number[]): number {
  let best = 0;
  for (let i = 1; i < xs.length; i++) if (xs[i]! < xs[best]!) best = i;
  return best;
}

/** a / b, or 0 when b is 0. The sheet shows #DIV/0! here; the engine carries on. */
export const safeDiv = (a: number, b: number): number => (b === 0 ? 0 : a / b);

/** The sheet's nine ideology labels (it has three ranges that all read "Moderate"). */
export function ideologyLabel(score: number): string {
  if (score < -8) return 'Revolutionary';
  if (score < -5) return 'Progressive';
  if (score < -2) return 'Liberal';
  if (score < 2) return 'Moderate';
  if (score < 5) return 'Conservative';
  if (score < 8) return 'Nationalist';
  return 'Authoritarian';
}
