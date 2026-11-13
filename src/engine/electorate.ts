/**
 * The electorate and the parties: ideology blocs, party ideology, how many
 * people each party can win, and the resulting national support.
 *
 * Sheet columns: SS-SZ (bloc sizes), SF-SM (shares), HY-SD (the 14 party
 * blocks), GV-HB (non-voters), FJ-FY and BM-CA (support), ER-FF (ideology shown).
 *
 * Comments marked QUIRK keep behaviour that looks unintended in the sheet.
 */
import { BLOC_COUNT, BLOC_POSITIONS, NAMED_PARTY_COUNT, P } from './data';
import type { Rule } from './rules';
import type { Context, Term } from './types';
import { clamp, ideologyLabel, safeDiv, sum } from './util';

// ------------------------------------------------------------------ blocs

/**
 * Bloc sizes move with how the president's approval changed over the term.
 * When approval fell, the president's own bloc shrinks and the others grow.
 */
export function updateBlocSizes(
  prev: Pick<Term, 'blocSizes' | 'leanShift'>,
  potusIdeology: number,
  dayOne: number,
  electionDay: number,
  ctx: Context,
): number[] {
  const label = ideologyLabel(potusIdeology);
  // QUIRK: the sheet's labels for Liberal and Authoritarian carry a trailing
  // space, so the approval swing is skipped. State lean and the Moderate
  // floor can still change bloc sizes.
  const frozen = !ctx.corrections?.has('presidential-bloc-shift') && (label === 'Liberal' || label === 'Authoritarian');
  const floorAfterShift = ctx.corrections?.has('bloc-size-floor');
  const swing = (dayOne - electionDay) * ctx.dials.blocSizeMultiplier;
  const shift = prev.leanShift;
  const sideFactor = [1 - 0.5 * shift, 1 - 0.1 * shift, 1 - 0.1 * shift, 1, 1 + 0.1 * shift, 1 + 0.1 * shift, 1 + 0.1 * shift];
  const names = ['Revolutionary', 'Progressive', 'Liberal', 'Moderate', 'Conservative', 'Nationalist', 'Authoritarian'];

  return prev.blocSizes.map((size, b) => {
    const weight = frozen ? 0 : names[b] === label ? -2 : 1;
    const moved = size + swing * weight;
    if (b === 3) {
      // Moderates never fall below the average of their two neighbours.
      return Math.max(floorAfterShift ? 1 : -Infinity, 0.5 * (prev.blocSizes[2]! + prev.blocSizes[4]!), moved);
    }
    // QUIRK: the sheet applies the lean factor after the floor. A sharp
    // enough shift can make a bloc's size negative.
    const shifted = Math.max(1, moved) * sideFactor[b]!;
    return floorAfterShift ? Math.max(1, shifted) : shifted;
  });
}

export function blocShares(sizes: readonly number[]): number[] {
  const total = sum(sizes);
  return sizes.map((s) => s / total);
}

/** Weighted centre of the electorate, -3 (all Revolutionary) to 3 (all Authoritarian). */
export function electorateCenter(shares: readonly number[]): number {
  return [-3, -2, -1, 0, 1, 2, 3].reduce((acc, w, b) => acc + w * shares[b]!, 0);
}

// -------------------------------------------------------- party ideology

/** Ideology a party resets to while it has no voters. Four parties have none. */
const DORMANT_IDEOLOGY: Record<number, number> = {
  [P.AMERICAN]: 7,
  [P.L_REPUBLICAN]: -7,
  [P.POPULIST]: -7,
  [P.NATIONAL]: 7,
  [P.PROGRESSIVE]: -7,
  [P.AGRARIAN]: -5,
  [P.UNION]: 0,
  [P.SOCIALIST]: -10,
  [P.LIBERAL]: -3,
  [P.PATRIOT]: 10,
};

/** A constant leftward push the sheet adds to two parties every term. */
const IDEOLOGY_PUSH: Record<number, number> = { [P.PROGRESSIVE]: -1, [P.SOCIALIST]: -2 };

/**
 * QUIRK: for these parties the sheet's "largest bloc" test includes the
 * party's total column, so the pull applies only when every vote comes from
 * a single bloc (or the party has no votes at all).
 */
const PULL_INCLUDES_TOTAL: ReadonlySet<number> = new Set([P.WHIG, P.AGRARIAN, P.UNION, P.SOCIALIST, P.LIBERAL]);

/** Position of the first bloc whose value equals the maximum, else 0. */
function pullToward(values: readonly number[], max: number): number {
  for (let b = 0; b < BLOC_COUNT; b++) if (values[b] === max) return BLOC_POSITIONS[b]!;
  return 0;
}

/**
 * Each party drifts toward its own largest voter bloc and the largest bloc of
 * non-voters, is knocked about at random (more after a failed presidency),
 * and, unless it holds the White House, is pushed away from the president.
 */
export function updatePartyIdeology(prev: Term, ctx: Context): number[] {
  const { rng, dials, corrections } = ctx;
  const nonvoterPull = pullToward(prev.nonvoters, Math.max(...prev.nonvoters));
  const noiseSize = prev.performance < 0 ? dials.crisisBacklash * Math.abs(prev.performance) : 0.8;

  const next: number[] = [];
  for (let p = 0; p < NAMED_PARTY_COUNT; p++) {
    const dormant = DORMANT_IDEOLOGY[p];
    if (dormant !== undefined && prev.voteTotals[p] === 0) {
      next.push(dormant);
      continue;
    }
    const own = prev.votes[p]!;
    const includeTotal = !corrections?.has('largest-voter-bloc') && PULL_INCLUDES_TOTAL.has(p);
    const ownMax = includeTotal ? Math.max(...own, prev.voteTotals[p]!) : Math.max(...own);
    const inPower = prev.potusParty === p;
    const value =
      (6 * prev.ideology[p]! + pullToward(own, ownMax) + nonvoterPull) / 8 +
      (rng.next() * 2 - 1) * noiseSize * (inPower ? 0.5 : 1.5) +
      (IDEOLOGY_PUSH[p] ?? 0) +
      (inPower ? 0 : dials.potusBacklash * -prev.potusIdeology);
    next.push(clamp(value, -10, 10));
  }
  return next;
}

// ------------------------------------------------------------ party votes

export interface PartyVotes {
  votes: number[][];
  totals: number[];
  nonvoters: number[];
}

/**
 * How much of each bloc each party wins: more with strength, less with
 * ideological distance, never more than the bloc holds.
 */
export function partyVotes(
  strength: readonly number[],
  ideology: readonly number[],
  shares: readonly number[],
  corrections?: ReadonlySet<Rule>,
): PartyVotes {
  const votes: number[][] = [];
  for (let p = 0; p < NAMED_PARTY_COUNT; p++) {
    const row: number[] = [];
    for (let b = 0; b < BLOC_COUNT; b++) {
      let cap = shares[b]!;
      let scale = shares[b]!;
      // QUIRK: Populist Authoritarian votes use the Nationalist bloc's size.
      if (p === P.POPULIST && b === 6 && !corrections?.has('populist-authoritarian')) cap = scale = shares[5]!;
      // QUIRK: Agrarian Liberal votes are scaled by the Moderate bloc's size.
      if (p === P.AGRARIAN && b === 2 && !corrections?.has('agrarian-liberal')) scale = shares[3]!;
      const appeal = 1.2 * strength[p]! - Math.abs(BLOC_POSITIONS[b]! - ideology[p]!) / 25;
      row.push(Math.max(0, Math.min(cap, appeal * scale)));
    }
    votes.push(row);
  }
  const totals = votes.map(sum);
  // Can go negative: the sheet lets parties claim more than a whole bloc.
  const nonvoters = shares.map((share, b) => share - sum(votes.map((row) => row[b]!)));
  return { votes, totals, nonvoters };
}

// ---------------------------------------------------------------- support

export interface Support {
  /** National support, 15 entries summing to 1. */
  support: number[];
  /** Ideology voters see: 0 for a party with no support (15 entries). */
  shownIdeology: number[];
}

/**
 * A party's support is the lower of its organisational strength and the votes
 * its ideology can actually reach. Third Party picks up what is left.
 */
export function nationalSupport(
  election: number,
  strength: readonly number[],
  strengthThird: number,
  totals: readonly number[],
  ideology: readonly number[],
  ctx: Context,
): Support {
  const { rng } = ctx;
  const nonNegative = sum(strength) + Math.max(0, strengthThird);
  const effective = strength.map((g, p) => safeDiv(Math.min(g, totals[p]!), nonNegative));
  const leftover = 1 - sum(effective);
  const positive = sum(strength.filter((g) => g > 0)) + Math.max(0, strengthThird);
  const third = Math.max(
    0,
    0.05 * rng.next() ** 2 +
      Math.max(0, strengthThird + (strengthThird > 0 ? safeDiv(strengthThird, positive) : 0) + leftover / 40) +
      (election < 1820 ? -0.1 : 0.02),
  );

  const total = sum(effective) + third;
  const support = [...effective.map((e) => safeDiv(e, total)), safeDiv(third, total)];

  const shownIdeology = ideology.map((score, p) => (support[p]! > 0 ? score : 0));
  // Third Party sits between the two founding parties, plus noise.
  shownIdeology.push(
    (support[P.THIRD]! > 0 ? (ideology[P.J_REPUBLICAN]! + ideology[P.FEDERALIST]!) / 2 : 0) + 3 * (rng.next() - 0.5),
  );
  return { support, shownIdeology };
}
