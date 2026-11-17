import { describe, expect, it } from 'vitest';
import { ELECTIONS } from '../src/engine/data';
import { CORRECTED_SETTINGS, DEFAULT_SETTINGS, simulate } from '../src/engine/simulate';
import { describeMatch, hasConditions, matches, NO_CONDITIONS, TERRITORIES, workerSeeds, type FinderConditions } from '../src/app/timelineFinder';

describe('timeline finder', () => {
  it('accepts everything with no conditions', () => {
    expect(hasConditions(NO_CONDITIONS)).toBe(false);
    for (let seed = 1; seed <= 20; seed++) expect(matches(simulate(seed, CORRECTED_SETTINGS), NO_CONDITIONS)).toBe(true);
  });

  it('agrees with the timeline for every condition', () => {
    const cases: FinderConditions[] = [
      { ...NO_CONDITIONS, civilWars: 1 },
      { ...NO_CONDITIONS, dictatorships: 2 },
      { ...NO_CONDITIONS, minWeirdness: 12 },
      { ...NO_CONDITIONS, territories: ['canada', 'mexico'] },
      { ...NO_CONDITIONS, winner: { party: 3, year: 1860 } },
      { civilWars: 1, dictatorships: 1, minWeirdness: 10, territories: ['texas'], winner: { party: 0, year: 2024 } },
    ];
    for (const settings of [DEFAULT_SETTINGS, CORRECTED_SETTINGS]) {
      for (let seed = 1; seed <= 60; seed++) {
        const timeline = simulate(seed, settings);
        const { summary, finalExpansions, terms } = timeline;
        for (const c of cases) {
          const expected = summary.civilWars >= c.civilWars && summary.dictatorships >= c.dictatorships &&
            summary.weirdness >= c.minWeirdness && c.territories.every((t) => finalExpansions[t]) &&
            (!c.winner || terms[ELECTIONS.indexOf(c.winner.year)]!.winnerParty === c.winner.party);
          expect(matches(timeline, c)).toBe(expected);
        }
        const match = describeMatch(timeline);
        expect(match.seed).toBe(seed);
        expect(match.territories).toEqual(TERRITORIES.filter((t) => finalExpansions[t]));
      }
    }
  });

  it('finds real matches for a common condition', () => {
    const found = Array.from({ length: 100 }, (_, i) => simulate(i + 1, CORRECTED_SETTINGS))
      .filter((timeline) => matches(timeline, { ...NO_CONDITIONS, civilWars: 1 }));
    expect(found.length).toBeGreaterThan(10);
    expect(found.every((timeline) => timeline.summary.civilWars >= 1)).toBe(true);
  });

  it('shares seeds between workers without gaps or repeats', () => {
    const all = [0, 1, 2, 3].flatMap((index) => workerSeeds(100, 10, index, 4)).sort((a, b) => a - b);
    expect(all).toEqual([100, 101, 102, 103, 104, 105, 106, 107, 108, 109]);
    expect(workerSeeds(0xfffffffe, 4, 0, 1)).toEqual([0xfffffffe, 0xffffffff, 0, 1]);
  });
});
