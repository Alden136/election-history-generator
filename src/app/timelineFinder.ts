/**
 * The timeline finder: conditions a timeline must meet, the test for them,
 * and the short record kept for each match. Display only; the simulation
 * itself is unchanged.
 */
import { ELECTIONS } from '../engine/data';
import type { Timeline } from '../engine/simulate';
import type { Expansions } from '../engine/types';

export const TERRITORY_NAMES: Record<keyof Expansions, string> = {
  texas: 'Texas', west: 'Western states', mexico: 'Northern Mexico', canada: 'Canada',
  quebec: 'Quebec', puertoRico: 'Puerto Rico', cuba: 'Cuba', westVirginia: 'West Virginia',
};
export const TERRITORIES = Object.keys(TERRITORY_NAMES) as (keyof Expansions)[];

export interface FinderConditions {
  /** At least this many; 0 means no requirement. */
  civilWars: number;
  dictatorships: number;
  minWeirdness: number;
  /** Territories that must be part of the country by 2065. */
  territories: (keyof Expansions)[];
  /** A party that must win the presidency in a given election. */
  winner: { party: number; year: number } | null;
}

export const NO_CONDITIONS: FinderConditions = { civilWars: 0, dictatorships: 0, minWeirdness: 0, territories: [], winner: null };

export function hasConditions(c: FinderConditions): boolean {
  return c.civilWars > 0 || c.dictatorships > 0 || c.minWeirdness > 0 || c.territories.length > 0 || c.winner !== null;
}

type MatchTimeline = Pick<Timeline, 'summary' | 'finalExpansions'> & { terms: readonly { election: number; winnerParty: number }[] };

export function matches(timeline: MatchTimeline, c: FinderConditions): boolean {
  const { summary, finalExpansions, terms } = timeline;
  if (summary.civilWars < c.civilWars || summary.dictatorships < c.dictatorships || summary.weirdness < c.minWeirdness) return false;
  if (!c.territories.every((territory) => finalExpansions[territory])) return false;
  if (c.winner) {
    const term = terms[ELECTIONS.indexOf(c.winner.year)];
    if (!term || term.winnerParty !== c.winner.party) return false;
  }
  return true;
}

/** What the results list shows for one matching seed. */
export interface FinderMatch {
  seed: number;
  weirdness: number;
  weirdnessLabel: string;
  civilWars: number;
  dictatorships: number;
  territories: (keyof Expansions)[];
  /** The party that won in 2024, as a quick way to tell results apart. */
  winner2024: number;
}

export function describeMatch(timeline: MatchTimeline & Pick<Timeline, 'seed'>): FinderMatch {
  const { seed, summary, finalExpansions, terms } = timeline;
  return {
    seed,
    weirdness: summary.weirdness,
    weirdnessLabel: summary.weirdnessLabel,
    civilWars: summary.civilWars,
    dictatorships: summary.dictatorships,
    territories: TERRITORIES.filter((territory) => finalExpansions[territory]),
    winner2024: terms[ELECTIONS.indexOf(2024)]!.winnerParty,
  };
}

/**
 * The seeds worker `index` of `workers` checks: every workers-th seed from
 * start + index, wrapping at 2^32, `count` seeds in all between the workers.
 */
export function workerSeeds(start: number, count: number, index: number, workers: number): number[] {
  const seeds: number[] = [];
  for (let i = index; i < count; i += workers) seeds.push((start + i) >>> 0);
  return seeds;
}
