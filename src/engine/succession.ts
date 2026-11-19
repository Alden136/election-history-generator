/**
 * Running mates and succession, an addition the spreadsheet does not have (off
 * unless settings.runningMates and settings.candidateTraits are both true).
 *
 * Every nominee picks a running mate before the vote, and the winner's becomes
 * vice president. Each term there is a small chance the president dies, is
 * assassinated or resigns; the vice president then serves out the term and is
 * the sitting president at the next election. The cause moves election-day
 * approval: sympathy after a death, a hit after a resignation. The term's
 * events stay as they were rolled.
 */
import { bandOf, nomineeFor, pickName, type Nominee } from './candidates';
import type { Primary } from './primaries';
import type { Context } from './types';

export type Departure = 'death' | 'assassination' | 'resignation';

export interface Succession {
  /** The year the president left office. */
  year: number;
  cause: Departure;
  /** Who left, and the vice president who took over. */
  president: string;
  successor: string;
  party: number;
}

/** A running mate's home state leans this much toward the ticket: half the nominee's pull. */
export const RUNNING_MATE_HOME_BONUS = 1;
/** Chance a contested primary's loser joins the winner's ticket. */
export const UNITY_TICKET_CHANCE = 0.5;
/** Chances per term. */
export const DEATH_CHANCE = 0.05;
export const VETERAN_DEATH_CHANCE = 0.02;
export const ASSASSINATION_CHANCE = 0.02;
export const CHAOS_ASSASSINATION_FACTOR = 3;
const CHAOS_EVENTS: ReadonlySet<string> = new Set(['Chaos', 'Riots', 'Civil War']);
const RESIGNATION_CHANCE: Readonly<Record<string, number>> = {
  Scandal: 0.15, Depression: 0.1, 'Lost War': 0.1, 'Major War Loss': 0.1,
};
/** Election-day approval after each way of leaving office. */
export const SUCCESSION_MOOD: Record<Departure, number> = { death: 0.04, assassination: 0.08, resignation: -0.06 };

/**
 * Each nominee's running mate: the loser of a contested primary half the time
 * (a unity ticket), otherwise the nearest free name on the party's list band,
 * preferring someone from another state to balance the ticket.
 */
export function chooseRunningMates(
  nominees: readonly Nominee[],
  primaries: readonly Primary[] | null,
  lists: readonly (readonly string[])[],
  ideologyOf: (party: number) => number,
  taken: Set<string>,
  ctx: Context,
): Nominee[] {
  const seed = ctx.seed ?? 0;
  // Everyone already on the ballot, and every primary loser, is spoken for: a loser
  // can only join their own party's ticket.
  for (const nominee of nominees) taken.add(nominee.name);
  for (const primary of primaries ?? []) for (const contender of primary.contenders) taken.add(contender.name);
  return nominees.map((nominee) => {
    const primary = primaries?.find((p) => p.party === nominee.party);
    const loser = primary && primary.contenders.length > 1 ? primary.contenders[1 - primary.winner]! : null;
    if (loser && ctx.rng.next() < UNITY_TICKET_CHANCE) return nomineeFor(nominee.party, loser.name, false, seed);
    // Look past the first free name when it shares the nominee's home state.
    const band = bandOf(ideologyOf(nominee.party));
    const first = pickName(lists, band, taken);
    let name = first;
    if (nominee.home && nomineeFor(nominee.party, first, false, seed).home === nominee.home) {
      const other = pickName(lists, band, taken);
      if (other && nomineeFor(nominee.party, other, false, seed).home !== nominee.home) { taken.delete(first); name = other; }
      else if (other !== first) taken.delete(other);
    }
    return nomineeFor(nominee.party, name, false, seed);
  });
}

/** For each state, the parties whose running mate calls it home. */
export function runningMateHomes(mates: readonly Nominee[], stateCodes: readonly string[]): number[][] {
  return stateCodes.map((code) => mates.filter((mate) => mate.home === code).map((mate) => mate.party));
}

export interface SuccessionInput {
  termBegan: number;
  president: string;
  party: number;
  /** The president's experience when they won (2 for a veteran). */
  experience: number;
  vicePresident: string;
  /** What the term is remembered for. */
  descriptor: string;
}

/** Whether the president leaves office early this term, and how. */
export function rollSuccession(input: SuccessionInput, ctx: Context): Succession | null {
  const { rng } = ctx;
  const death = DEATH_CHANCE + (input.experience >= 2 ? VETERAN_DEATH_CHANCE : 0);
  const assassination = ASSASSINATION_CHANCE * (CHAOS_EVENTS.has(input.descriptor) ? CHAOS_ASSASSINATION_FACTOR : 1);
  const resignation = RESIGNATION_CHANCE[input.descriptor] ?? 0;
  const roll = rng.next();
  const cause: Departure | null = roll < death ? 'death'
    : roll < death + assassination ? 'assassination'
    : roll < death + assassination + resignation ? 'resignation' : null;
  if (!cause) return null;
  return {
    // In the term's second, third or fourth year, so both presidents serve at least a year of it.
    year: input.termBegan + 1 + Math.min(2, Math.floor(rng.next() * 3)),
    cause, president: input.president, successor: input.vicePresident, party: input.party,
  };
}
