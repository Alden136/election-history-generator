import { describe, expect, it } from 'vitest';
import { P, STATES } from '../src/engine/data';
import { CORRECTED_SETTINGS, DEFAULT_SETTINGS, simulate } from '../src/engine/simulate';
import { SECEDED } from '../src/engine/types';
import { apportion, chambers } from '../src/app/chambers';

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
const DC = STATES.findIndex((s) => s.code === 'DC');

describe('House and Senate', () => {
  it('starts from the sheet\'s 1792 Congress', () => {
    const { house, senate } = chambers(simulate(1).terms[0]!);
    expect(house.size).toBe(105);
    expect(house.seats[P.FEDERALIST]).toBe(51);
    expect(house.seats[P.J_REPUBLICAN]).toBe(54);
    expect(senate.size).toBe(30);
    expect(senate.seats[P.FEDERALIST]).toBe(18);
    expect(senate.seats[P.J_REPUBLICAN]).toBe(12);
  });

  it('sizes each chamber from the states that vote', () => {
    for (const settings of [DEFAULT_SETTINGS, CORRECTED_SETTINGS]) {
      for (let seed = 1; seed <= 40; seed++) {
        for (const term of simulate(seed, settings).terms.slice(1)) {
          const seated = term.grid.votes
            .map((votes, i) => ({ votes, i }))
            .filter(({ votes, i }) => votes > 0 && i !== DC && term.grid.winners[i] !== SECEDED);
          const { house, senate } = chambers(term);
          expect(senate.size).toBe(2 * seated.length);
          expect(house.size).toBe(sum(seated.map(({ votes }) => votes - 2)));
          expect(sum(house.seats)).toBe(house.size);
          expect(sum(senate.seats)).toBe(senate.size);
          // No seats for a party with none in the simulated Congress.
          term.congress.forEach((share, p) => {
            if (share === 0) {
              expect(house.seats[p]).toBe(0);
              expect(senate.seats[p]).toBe(0);
            }
          });
        }
      }
    }
  });

  it('averages back to the simulated Congress', () => {
    const term = simulate(42, CORRECTED_SETTINGS).terms.find((t) => t.election === 2024)!;
    const { house, senate } = chambers(term);
    term.congress.forEach((share, p) => {
      const average = (house.seats[p]! / house.size + senate.seats[p]! / senate.size) / 2;
      expect(Math.abs(average - share), `party ${p}`).toBeLessThan(0.02);
    });
  });

  it('gives a real-sized Congress when the map matches history', () => {
    const term = simulate(42, CORRECTED_SETTINGS).terms.find((t) => t.election === 2024)!;
    // Replace this timeline's electoral votes with the real 2024 ones.
    const votes = STATES.map((s, i) => (i <= DC ? s.realElectoralVotes['2024'] ?? 0 : 0));
    const winners = term.grid.winners.map((w, i) => (i <= DC ? Math.max(w, 0) : w));
    const { house, senate } = chambers({ ...term, grid: { ...term.grid, votes, winners } });
    expect(house.size).toBe(435);
    expect(senate.size).toBe(100);
  });

  it('apportions seats by largest remainder', () => {
    expect(apportion([0.5, 0.3, 0.2], 10)).toEqual([5, 3, 2]);
    expect(apportion([1, 1, 1], 10)).toEqual([4, 3, 3]);
    expect(apportion([0, 0], 5)).toEqual([0, 0]);
  });
});
