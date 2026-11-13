/**
 * The Supreme Court: 15 seats, six filled in 1792. Sheet columns TV-UM.
 */
import type { Context } from './types';
import { safeDiv, sum } from './util';

/**
 * Each sitting justice drifts at random and has a 20% chance per term of
 * being replaced by someone near the president (weighted double) and
 * Congress. An empty seat has a 10% chance of being filled, but only once
 * the seat before it is filled.
 */
export function updateCourt(
  prev: readonly (number | null)[],
  potusIdeology: number,
  congressIdeology: number,
  ctx: Context,
): (number | null)[] {
  const { rng } = ctx;
  const appointee = (): number => rng.next() - 0.5 + (2 * potusIdeology + congressIdeology) / 3;
  const next: (number | null)[] = [];
  prev.forEach((seat, j) => {
    if (seat === null) {
      const previousSeatEmpty = j > 0 && next[j - 1] === null;
      if (previousSeatEmpty) next.push(null);
      else next.push(rng.next() < 0.1 ? appointee() : null);
    } else {
      next.push(rng.next() < 0.2 ? appointee() : seat + rng.next() - 0.5);
    }
  });
  return next;
}

export function courtAverage(court: readonly (number | null)[]): number {
  const sitting = court.filter((seat): seat is number => seat !== null);
  return safeDiv(sum(sitting), sitting.length);
}
