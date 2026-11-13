/**
 * Party organisational strength: how each party rises with a popular
 * president of its own, falls with an unpopular one, is born when the sheet's
 * hand-written trigger fires, and collapses after dominating.
 *
 * Sheet columns GC-GQ. Each of the 14 formulas is different; they are ported
 * one by one, in the order the sheet's dependencies require.
 *
 * Comments marked QUIRK keep behaviour that looks unintended in the sheet.
 */
import { NAMED_PARTY_COUNT, P } from './data';
import type { Context, Term } from './types';
import { clamp01, sum } from './util';

export interface StrengthInput {
  election: number;
  potusParty: number;
  performance: number;
  electionDayApproval: number;
  prev: Term;
  /** The term before `prev`, when there is one. */
  prev2: Term | undefined;
}

export function updateStrengths(input: StrengthInput, ctx: Context): number[] {
  const { rng, corrections } = ctx;
  const { election, potusParty, performance, electionDayApproval, prev, prev2 } = input;
  const sup = prev.support;
  const g1 = prev.strength;
  const g2 = prev2?.strength;
  const nv = prev.nonvoters;
  const maxNv = Math.max(...nv);
  const prevFailed = prev.performance < -0.3;
  const prevPotus = prev.potusParty;

  const pct = (low: number, high: number): number => rng.between(low, high) / 100;
  const collapse = (): number => pct(35, 55);

  /** A party gains under a popular president of its own and loses under a rival's. */
  const drift = (p: number): number => {
    const swing = 0.5 * (electionDayApproval - 0.5);
    return clamp01(potusParty === p ? g1[p]! + swing : g1[p]! - swing);
  };
  /** The party that won the last election absorbs half of Third Party's strength. */
  const bonus = (p: number): number => (prev.winnerParty === p ? prev.strengthThird / 2 : 0);
  /** Penalty for the incumbent party when its president fails. */
  const failed = (p: number): boolean => performance < -0.3 && prev.winnerParty === p;
  const uniformPenalty = corrections?.has('failed-president-penalty');
  const penalty = (p: number, slope: number, offset: number): number => {
    if (!failed(p)) return 0;
    const draw = rng.next();
    return uniformPenalty ? -draw * 0.14 : draw * slope + offset;
  };
  const wipeOut = (p: number): number => penalty(p, 0.14, -100);
  const dent = (p: number): number => penalty(p, 0.14, -0.1);
  const nick = (p: number): number => penalty(p, -0.14, 0);

  /** True when exactly one named party has any strength in a term. */
  const oneParty = (t: Term | undefined): boolean =>
    t !== undefined && t.strength.filter((g) => g !== 0).length === 1;
  const oneParty2 = oneParty(prev) && oneParty(prev2);

  const s: number[] = new Array<number>(NAMED_PARTY_COUNT).fill(0);

  // Federalist: a party above 80% support drops to nothing.
  s[P.FEDERALIST] = clamp01(
    (sup[P.FEDERALIST]! < 0.02 || sup[P.FEDERALIST]! > 0.8 ? 0 : drift(P.FEDERALIST)) +
      bonus(P.FEDERALIST) +
      wipeOut(P.FEDERALIST),
  );

  // J. Republican.
  s[P.J_REPUBLICAN] = clamp01(
    (sup[P.J_REPUBLICAN]! > 0.8 || sup[P.J_REPUBLICAN]! < 0.02 ? 0 : drift(P.J_REPUBLICAN)) +
      bonus(P.J_REPUBLICAN) +
      wipeOut(P.J_REPUBLICAN),
  );

  // Democrat: born when a founding party dominates or a J. Republican or
  // American president fails.
  {
    const p = P.DEMOCRAT;
    let base: number;
    if (sup[p]! < 0.02) {
      const born =
        sup[P.FEDERALIST]! > 0.8 ||
        sup[P.J_REPUBLICAN]! > 0.8 ||
        (prevPotus === P.J_REPUBLICAN && prevFailed) ||
        (prevPotus === P.AMERICAN && prevFailed && g1[P.J_REPUBLICAN]! > 0);
      base = born ? clamp01(1 - pct(50, 65)) : 0;
    } else {
      base = sup[p]! > 0.8 ? collapse() : drift(p);
    }
    s[p] = clamp01(base + bonus(p) + dent(p));
  }

  // American: born after 1841 when the Federalists dominated two terms ago or
  // a Federalist president fails.
  {
    const p = P.AMERICAN;
    let base: number;
    if (sup[p]! < 0.02) {
      // QUIRK: BLUR never matches. The correction treats it as a Whig
      // administration, a rival party active around the 1847 gate.
      const born =
        (election > 1841 && (g2?.[P.FEDERALIST] ?? 0) > 0.8) ||
        (corrections?.has('american-party-trigger') && election > 1847 && potusParty === P.WHIG && prevFailed) ||
        (prevPotus === P.FEDERALIST && prevFailed && election > 1841 && g1[P.J_REPUBLICAN]! > 0);
      base = born
        ? Math.max(0, Math.min(1 - s[P.J_REPUBLICAN]! - s[P.FEDERALIST]! - s[P.DEMOCRAT]!, 1 - pct(50, 65)))
        : 0;
    } else {
      base = sup[p]! > 0.8 ? collapse() : drift(p);
    }
    s[p] = clamp01(base + bonus(p) + wipeOut(p));
  }

  // Whig: only before 1841, when a party dominates or a Federalist or
  // American president fails.
  {
    const p = P.WHIG;
    let base: number;
    if (sup[p]! < 0.02) {
      const born =
        election <= 1841 &&
        (sup[P.DEMOCRAT]! > 0.8 ||
          sup[P.J_REPUBLICAN]! > 0.8 ||
          sup[P.FEDERALIST]! > 0.8 ||
          (prevPotus === P.FEDERALIST && prevFailed) ||
          (prevPotus === P.AMERICAN && prevFailed));
      base = born
        ? Math.max(
            0,
            Math.min(1 - s[P.J_REPUBLICAN]! - s[P.FEDERALIST]! - s[P.AMERICAN]! - s[P.DEMOCRAT]!, 1 - pct(50, 65)),
          )
        : 0;
    } else {
      base = sup[p]! > 0.8 ? collapse() : drift(p);
    }
    s[p] = clamp01(base + bonus(p) + wipeOut(p));
  }

  // L. Republican: from 1841, once the J. Republicans are gone.
  {
    const p = P.L_REPUBLICAN;
    let base: number;
    if (sup[p]! < 0.02) {
      const eligible = election >= 1841 && g1[P.J_REPUBLICAN] === 0;
      const born =
        eligible &&
        ((g2?.[P.WHIG] ?? 0) > 0.8 ||
          (g2?.[P.J_REPUBLICAN] ?? 0) > 0.8 ||
          (potusParty === P.POPULIST && prevFailed) ||
          (prevPotus === P.WHIG && prevFailed) ||
          (prevPotus === P.FEDERALIST && prevFailed && prev.election > 1841 && g1[P.J_REPUBLICAN] === 0) ||
          (prevPotus === P.AMERICAN && prevFailed) ||
          (g2?.[P.DEMOCRAT] ?? 0) > 0.8 ||
          (g2?.[P.AMERICAN] ?? 0) > 0.8);
      base = born
        ? Math.max(
            0,
            Math.min(1 - s[P.FEDERALIST]! - s[P.J_REPUBLICAN]! - s[P.WHIG]! - s[P.AMERICAN]!, 1 - pct(50, 65)),
          )
        : 0;
    } else {
      base = g1[p]! > 0.8 ? collapse() : drift(p);
    }
    s[p] = clamp01(base + bonus(p) + dent(p));
  }

  // Populist: when the L. Republicans dominate or their president is failing.
  {
    const p = P.POPULIST;
    let base: number;
    if (sup[p]! < 0.02) {
      const born = g1[P.L_REPUBLICAN]! > 0.8 || (potusParty === P.L_REPUBLICAN && performance <= -0.3);
      const room =
        1 - s[P.FEDERALIST]! - s[P.J_REPUBLICAN]! - s[P.AMERICAN]! - s[P.DEMOCRAT]! - s[P.WHIG]! - s[P.L_REPUBLICAN]!;
      base = born ? Math.max(0, Math.min(room, 1 - pct(40, 60))) : 0;
    } else {
      base = g1[p]! > 0.8 ? collapse() : drift(p);
    }
    s[p] = clamp01(base + bonus(p) + wipeOut(p));
  }

  // National: when the Populists dominate or a Whig president is failing.
  {
    const p = P.NATIONAL;
    let base: number;
    if (sup[p]! < 0.02) {
      const born = g1[P.POPULIST]! > 0.8 || (potusParty === P.WHIG && performance <= -0.3 && s[P.J_REPUBLICAN]! > 0);
      base = born
        ? Math.max(0, Math.min(1 - s[P.L_REPUBLICAN]! - s[P.POPULIST]! - s[P.WHIG]!, 1 - pct(50, 65)))
        : 0;
    } else {
      base = g1[p]! > 0.8 ? collapse() : drift(p);
    }
    s[p] = clamp01(base + bonus(p) + wipeOut(p));
  }

  /**
   * The six later parties share one shape: born when enough of a given bloc
   * (or blocs) stays home, or when one party has ruled alone for two terms
   * and that bloc is the largest group of non-voters.
   */
  const lateParty = (
    p: number,
    blocs: readonly number[],
    yearOk: boolean,
    threshold: number,
    birthRange: readonly [number, number],
    extraTrigger: boolean,
    room: number,
    bonusValue: number,
    penalty: () => number,
  ): void => {
    let base: number;
    if (sup[p]! < 0.02) {
      const born =
        extraTrigger ||
        (yearOk && oneParty2 && blocs.some((b) => nv[b] === maxNv)) ||
        (yearOk && blocs.some((b) => nv[b]! > threshold));
      base = born ? Math.max(0, Math.min(room, 1 - pct(birthRange[0], birthRange[1]))) : 0;
    } else {
      base = g1[p]! > 0.8 ? collapse() : drift(p);
    }
    s[p] = clamp01(base + bonusValue + penalty());
  };

  const thirdWasEverything = prev.strengthThird === 1;

  lateParty(P.PROGRESSIVE, [1], election > 1890, 0.1, [70, 90], false, 1 - s[P.NATIONAL]!,
    bonus(P.PROGRESSIVE), () => wipeOut(P.PROGRESSIVE));

  const roomAfterNP = 1 - s[P.NATIONAL]! - s[P.PROGRESSIVE]!;

  lateParty(P.AGRARIAN, [0, 1, 2], election < 1900, 0.13, [70, 90], false, roomAfterNP,
    bonus(P.AGRARIAN), () => wipeOut(P.AGRARIAN));
  lateParty(P.UNION, [3], true, 0.13, [40, 60], false, roomAfterNP,
    bonus(P.UNION), () => wipeOut(P.UNION));
  lateParty(P.SOCIALIST, [0], election > 1900, 0.13, [70, 90], false, roomAfterNP,
    bonus(P.SOCIALIST), () => wipeOut(P.SOCIALIST));
  // QUIRK: the Liberal bonus is keyed to the strongest party organisation,
  // where every other party's is keyed to the last election's winner.
  lateParty(P.LIBERAL, [2], election > 1900, 0.13, [40, 60], thirdWasEverything, roomAfterNP,
    corrections?.has('liberal-winner-bonus') ? bonus(P.LIBERAL) :
      prev.strengthLeader === P.LIBERAL ? prev.strengthThird / 2 : 0, () => nick(P.LIBERAL));
  lateParty(P.PATRIOT, [4, 5, 6], election > 1700, 0.13, [70, 90], thirdWasEverything, roomAfterNP,
    bonus(P.PATRIOT), () => nick(P.PATRIOT));

  return s;
}

/** Third Party's strength: a third of whatever the named parties leave. */
export function thirdPartyStrength(strength: readonly number[]): number {
  return 0.33 * (1 - sum(strength));
}
