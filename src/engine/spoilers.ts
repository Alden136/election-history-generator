/**
 * Spoiler candidates, an addition the spreadsheet does not have (off unless
 * settings.spoilers, settings.primaries and settings.candidateTraits are all
 * true). Deliberately rare.
 *
 * After a bitter primary in a major party whose wings stand far apart, the
 * losing wing's candidate may bolt and run anyway, as Theodore Roosevelt did
 * in 1912. For that one election they are the Third Party's candidate: they
 * run on their own position, and part of their old party's support follows
 * them. At most one spoiler runs in an election.
 */
import { P } from './data';
import { nomineeFor, type Nominee } from './candidates';
import type { Primary } from './primaries';
import type { Context } from './types';

export interface Spoiler {
  /** The party they bolted from. */
  party: number;
  name: string;
  /** The position they run on, −10 to 10. */
  position: number;
  /** The share of their old party's support that followed them, before rescaling. */
  share: number;
  /** True when they were the sitting president, denied renomination. */
  wasIncumbent: boolean;
}

/** A spoiler can only come out of a party with at least this much national support. */
export const SPOILER_MIN_SUPPORT = 0.15;
/** ...and wings at least this far apart. */
export const SPOILER_MIN_DISTANCE = 3;
/** The chance the loser of such a bitter primary bolts. */
export const SPOILER_CHANCE = 0.2;
/** The share of the old party's support that follows them: between these. */
export const SPOILER_SHARE_MIN = 0.25;
export const SPOILER_SHARE_MAX = 0.45;

/** Whether a loser of this election's primaries bolts, biggest party first. */
export function findSpoiler(primaries: readonly Primary[], support: readonly number[], ctx: Context): Spoiler | null {
  const eligible = primaries
    .filter((p) => p.fight === 'bitter' && p.contenders.length === 2 && (support[p.party] ?? 0) >= SPOILER_MIN_SUPPORT &&
      Math.abs(p.contenders[0]!.position - p.contenders[1]!.position) >= SPOILER_MIN_DISTANCE)
    .sort((a, b) => support[b.party]! - support[a.party]! || a.party - b.party);
  for (const primary of eligible) {
    if (ctx.rng.next() >= SPOILER_CHANCE) continue;
    const loser = primary.contenders[1 - primary.winner]!;
    const share = SPOILER_SHARE_MIN + ctx.rng.next() * (SPOILER_SHARE_MAX - SPOILER_SHARE_MIN);
    return { party: primary.party, name: loser.name, position: loser.position, share, wasIncumbent: loser.incumbent };
  }
  return null;
}

/** National support with the spoiler's followers moved from their old party to the Third Party; the total is unchanged. */
export function supportWithSpoiler(support: readonly number[], spoiler: Spoiler): number[] {
  const moved = support[spoiler.party]! * spoiler.share;
  return support.map((share, party) =>
    party === spoiler.party ? share - moved : party === P.THIRD ? share + moved : share);
}

/** The nominees with the spoiler as the Third Party's candidate in place of whoever it had. */
export function nomineesWithSpoiler(nominees: readonly Nominee[], spoiler: Spoiler, seed: number): Nominee[] {
  const candidate = { ...nomineeFor(P.THIRD, spoiler.name, false, seed) };
  return [...nominees.filter((n) => n.party !== P.THIRD), candidate].sort((a, b) => a.party - b.party);
}
