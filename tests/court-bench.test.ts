import { describe, expect, it } from 'vitest';
import { CORRECTED_SETTINGS, DEFAULT_SETTINGS, simulate } from '../src/engine/simulate';
import { bench, ideologyColor } from '../src/app/court';

describe('court bench', () => {
  it('orders a court by hand', () => {
    const result = bench([2, null, -3, 0.5, null, -1]);
    expect(result.justices).toEqual([
      { seat: 3, ideology: -3 }, { seat: 6, ideology: -1 }, { seat: 4, ideology: 0.5 }, { seat: 1, ideology: 2 },
    ]);
    expect(result).toMatchObject({ size: 6, empty: 2, average: -0.375, median: -0.25, left: 2, right: 2 });
    expect(bench([4, 1, -2]).median).toBe(1);
    expect(bench([null, null])).toMatchObject({ justices: [], empty: 2, average: 0, median: 0, left: 0, right: 0 });
  });

  it('colors left blue, right red and the centre pale', () => {
    expect(ideologyColor(0)).toBe('#ece8df');
    expect(ideologyColor(-6)).toBe('#2f6fd6');
    expect(ideologyColor(-40)).toBe('#2f6fd6');
    expect(ideologyColor(6)).toBe('#d64541');
  });

  it('matches the court average in every term', () => {
    for (const settings of [DEFAULT_SETTINGS, CORRECTED_SETTINGS]) {
      for (let seed = 1; seed <= 25; seed++) {
        for (const term of simulate(seed, settings).terms) {
          const result = bench(term.court);
          expect(result.average).toBeCloseTo(term.courtAverage, 10);
          expect(result.justices.length + result.empty).toBe(term.court.length);
          expect(result.left + result.right).toBeLessThanOrEqual(result.justices.length);
          expect(result.justices.every((justice, i, all) => i === 0 || all[i - 1]!.ideology <= justice.ideology)).toBe(true);
        }
      }
    }
  });
});
