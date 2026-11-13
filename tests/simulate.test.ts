import { describe, expect, it } from 'vitest';
import { PARTY_COUNT, STATE_COUNT, P } from '../src/engine/data';
import { simulate } from '../src/engine/simulate';
import { NO_VOTE, SECEDED } from '../src/engine/types';

const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);

describe('simulate', () => {
  it('gives the same timeline for the same seed', () => {
    expect(simulate(1792)).toEqual(simulate(1792));
  });

  it('gives different timelines for different seeds', () => {
    const a = simulate(1).terms.map((t) => t.winnerName).join('|');
    const b = simulate(2).terms.map((t) => t.winnerName).join('|');
    expect(a).not.toBe(b);
  });

  it('runs 69 elections from 1792 to 2064', () => {
    const { terms, finalPresident } = simulate(7);
    expect(terms).toHaveLength(69);
    expect(terms[0]?.election).toBe(1792);
    expect(terms.at(-1)?.election).toBe(2064);
    expect(finalPresident.termBegan).toBe(2065);
  });

  it('always starts from the sheet\'s 1792', () => {
    for (const seed of [1, 2, 3]) {
      const first = simulate(seed).terms[0]!;
      expect(first.president).toBe('George Washington');
      expect(first.winnerParty).toBe(P.FEDERALIST);
      expect(first.support[P.FEDERALIST]).toBeCloseTo(77 / 132, 12);
      expect(first.congress[P.FEDERALIST]).toBeCloseTo(0.5 * (51 / 105 + 18 / 30), 12);
      expect(first.grid.winners.filter((w) => w !== NO_VOTE)).toHaveLength(15);
    }
  });

  it('starts 1796 with 16 states and 138 electoral votes, and never re-elects Washington', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const second = simulate(seed).terms[1]!;
      expect(second.grid.totalVotes).toBe(138);
      expect(second.grid.votes.filter((v) => v > 0)).toHaveLength(16);
      expect(second.president).toBe('George Washington');
      expect(second.winnerName).not.toBe('George Washington');
    }
  });

  it('keeps every term valid across 300 seeds', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const timeline = simulate(seed);
      for (const t of timeline.terms) {
        const where = `seed ${seed}, ${t.election}`;
        expect(t.electoral, where).toHaveLength(PARTY_COUNT);
        expect(t.grid.winners, where).toHaveLength(STATE_COUNT);

        for (const list of [t.electoral, t.support, t.congress, t.strength, t.ideology, t.grid.lean]) {
          expect(list.every(Number.isFinite), where).toBe(true);
        }
        expect(Math.min(...t.electoral, ...t.support, ...t.congress, ...t.strength), where).toBeGreaterThanOrEqual(0);
        expect(Math.max(...t.strength), where).toBeLessThanOrEqual(1);
        expect(Math.max(...t.ideology.map(Math.abs)), where).toBeLessThanOrEqual(10);
        expect(Math.max(...t.grid.lean.map(Math.abs)), where).toBeLessThanOrEqual(8);
        expect(sum(t.blocShares), where).toBeCloseTo(1, 9);
        expect(t.stability, where).toBeGreaterThanOrEqual(0.1);
        expect(t.stability, where).toBeLessThanOrEqual(1);

        if (t.index === 0) continue;
        expect(sum(t.support), where).toBeCloseTo(1, 9);
        expect(t.electionDayApproval, where).toBeGreaterThanOrEqual(0.05);
        expect(t.electionDayApproval, where).toBeLessThanOrEqual(0.9);
        expect(t.winnerName.length, where).toBeGreaterThan(0);
        expect(t.result, where).toBe(t.potusParty === t.winnerParty ? 'WIN' : 'LOSS');

        // The next president is this election's winner.
        const next = timeline.terms[t.index + 1];
        if (next) {
          expect(next.president, where).toBe(t.winnerName);
          expect(next.potusParty, where).toBe(t.winnerParty);
        }

        t.grid.winners.forEach((winner, i) => {
          // A state with no electoral votes can only be absent or seceded.
          if (t.grid.votes[i] === 0 && winner >= 0) {
            // Loyal states keep their party for the term they lose their votes.
            expect(t.grid.winners[i], where).toBe(timeline.terms[t.index - 1]!.grid.winners[i]);
          }
          expect(winner === NO_VOTE || winner === SECEDED || (winner >= 0 && winner < PARTY_COUNT), where).toBe(true);
        });
      }
    }
  });

  it('never loses territory once it has joined', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const { terms } = simulate(seed);
      for (let i = 1; i < terms.length; i++) {
        const before = terms[i - 1]!.grid.expansions;
        const after = terms[i]!.grid.expansions;
        for (const key of Object.keys(before) as (keyof typeof before)[]) {
          if (before[key]) expect(after[key], `seed ${seed} ${key}`).toBe(true);
        }
      }
    }
  });

  it('produces a summary consistent with its terms', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const { terms, summary, finalPresident } = simulate(seed);
      const labels = [...terms.map((t) => t.descriptor), finalPresident.descriptor];
      expect(summary.dictatorships).toBe(labels.filter((d) => d === 'DICTATORSHIP').length);
      expect(summary.civilWars).toBe(labels.filter((d) => d === 'Civil War').length);
      expect(summary.weirdness).toBe(
        summary.expansions + summary.governingParties + 0.5 * summary.dictatorships + summary.civilWars,
      );
      expect(summary.current.termStart).toBeLessThanOrEqual(2025);
      expect(summary.best.name.length).toBeGreaterThan(0);
    }
  });
});
