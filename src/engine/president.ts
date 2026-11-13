/**
 * The presidency: approval, performance, what the term is remembered for,
 * national stability, and who the next president is.
 *
 * Sheet columns AG-AR.
 */
import { CANDIDATES, P } from './data';
import type { Context, Term } from './types';
import { clamp } from './util';

/** Elections where the sheet makes a dramatic term five times as likely. */
const CRISIS_ELECTIONS: ReadonlySet<number> = new Set([
  1796, 1800, 1804, 1808, 1812, 1816, 1852, 1856, 1860, 1864, 1868, 1928, 1932, 1936, 1940, 1964, 1968,
  1972, 1988, 1992, 2020,
]);

/** The president's ideology is their party's score from the previous term. */
export function presidentIdeology(party: number, prev: Pick<Term, 'center' | 'ideology'>): number {
  return party === P.THIRD ? prev.center : prev.ideology[party]!;
}

/** A president starts higher after a decisive win, or with a dominant Congress. */
export function dayOneApproval(
  prev: Pick<Term, 'support'>,
  prev2: Pick<Term, 'congress'> | undefined,
): number {
  const topSupport = Math.max(...prev.support);
  if (topSupport > 0.5) return (topSupport + 0.05 + 1) / 3;
  const topCongress = prev2 ? Math.max(...prev2.congress) : 0;
  return (topCongress - 0.1 + 1) / 3;
}

export function performance(
  election: number,
  ideology: number,
  expanded: boolean,
  prev: Term,
  ctx: Context,
): number {
  const { rng } = ctx;
  const collapse = prev.stability < 0.15 && rng.next() > 0.5 ? -0.5 : 0;
  const expansion = expanded ? 0.3 : 0;
  const jitter = (rng.next() - 0.5) / 50;
  const momentum = (rng.next() - 0.5) * prev.performance;

  let event: number;
  if (prev.descriptor === 'DICTATORSHIP') {
    event = [0.5, -0.5, 0.1, 0.1, 0.1][rng.between(1, 5) - 1]!;
  } else {
    event = (rng.next() - 0.5) / 50 + (rng.next() - 0.5) * prev.performance;
    if (Math.abs(ideology) > 8 && Math.abs(prev.potusIdeology) > 8) {
      // Two extremists in a row: a coin flip between triumph and disaster.
      event += rng.between(1, 2) === 1 ? 0.4 : -0.4;
    } else {
      const chance = Math.min(1, (CRISIS_ELECTIONS.has(election) ? 0.25 : 0.05) * (1 + Math.abs(ideology) * 0.1));
      if (rng.next() < chance) event += rng.between(-40, 40) / 100;
    }
  }
  if (prev.descriptor === 'Civil War') event *= 2.5;

  return collapse + expansion + jitter + momentum + event;
}

export function descriptor(
  perf: number,
  ideology: number,
  party: number,
  prev: Term,
  ctx: Context,
): string {
  const { rng } = ctx;
  if (perf > 0.39 && Math.abs(prev.performance) > 0.5) return 'DICTATORSHIP';
  if (perf > 0.39 && Math.abs(ideology) > 7) return 'DICTATORSHIP';
  if (perf > -0.35 && prev.descriptor === 'DICTATORSHIP' && party === prev.potusParty) return 'DICTATORSHIP';
  if (perf > 0.39) return 'Solved Crisis';
  if (perf >= 0.15) return 'Major War Win';
  if (perf > 0.005) return ['Economic Boom', 'War Win', 'Good Feelings'][rng.between(1, 3) - 1]!;
  if (perf === 0) return '';
  if (perf < -0.005 && perf >= -0.25) return rng.between(0, 1) === 0 ? 'Recession' : 'Scandal';
  if (perf < -0.25 && perf >= -0.35) return ['Depression', 'Lost War', 'Riots'][rng.between(1, 3) - 1]!;
  if (perf < -0.35 && prev.stability < 0.2) return rng.between(1, 2) === 1 ? 'Civil War' : 'Chaos';
  if (perf < -0.35) return 'Major War Loss';
  return '';
}

/**
 * Stability carries over, rises fourfold with good terms, falls with bad
 * ones and with expansions, and sags during three historical eras.
 * `history` is every earlier term, oldest first.
 */
export function stability(
  perf: number,
  ideology: number,
  expanded: boolean,
  history: readonly Pick<Term, 'stability' | 'termBegan' | 'potusIdeology'>[],
): number {
  const prev = history[history.length - 1]!;
  // The sheet's rebound needs four earlier terms; before that its lookback
  // lands on a header cell and never triggers.
  const lastFour = history.slice(-4);
  const rebound = lastFour.length === 4 && lastFour.every((t) => t.stability < 0.12) ? 0.2 : 0;
  const began = prev.termBegan;
  const era =
    (began > 1810 && began < 1900) || (began > 1955 && began < 1975) || (began > 2010 && began < 2030)
      ? -0.05
      : 0.02;
  return clamp(
    prev.stability +
      (prev.stability === 1 ? -0.05 : 0) +
      rebound +
      0.5 * (perf > 0 ? 4 * perf : perf) -
      (expanded ? 0.5 : 0) +
      era -
      Math.abs(ideology - prev.potusIdeology) / 200,
    0.1,
    1,
  );
}

export function electionDayApproval(
  dayOne: number,
  perf: number,
  label: string,
  ideology: number,
  congressIdeology: number,
  party: number,
  prev: Pick<Term, 'result' | 'congressLeader'>,
  ctx: Context,
): number {
  return clamp(
    (label === 'DICTATORSHIP' ? 0.3 : 0) +
      (dayOne + 0.5) / 2 +
      (ctx.rng.next() * 0.15 - 0.075) -
      0.04 +
      0.75 * perf +
      (prev.result === 'WIN' ? -0.05 : 0) -
      Math.abs(ideology - congressIdeology) / 75 +
      (party === prev.congressLeader ? 0.005 : -0.005),
    0.05,
    0.9,
  );
}

/**
 * Who wins: the sitting president when their party holds the White House and
 * they run again (70% for a second term, 20% after that, 70% for a dictator),
 * otherwise the candidate the sheet lists for this year and ideology.
 */
export function winnerName(
  election: number,
  incumbent: string,
  previousIncumbent: string,
  partyHeld: boolean,
  label: string,
  nextIdeology: number,
  ctx: Context,
): string {
  const { rng } = ctx;
  const mayRun = partyHeld && incumbent !== 'George Washington';
  if (rng.next() <= 0.2 && mayRun && previousIncumbent === incumbent) return incumbent;
  if (rng.next() <= 0.7 && mayRun && previousIncumbent !== incumbent) return incumbent;
  if (rng.next() <= 0.7 && mayRun && label === 'DICTATORSHIP') return incumbent;

  const band = Math.min(9, Math.max(0, Math.floor((nextIdeology + 10) / 2)));
  return CANDIDATES[election]?.[band] ?? '';
}
