/**
 * Congress and the presidential election result.
 *
 * Sheet columns DZ-EN (raw Congress), CG-CU (final Congress), CD-CF
 * (Congress ideology and leader), CX-DL (closeness), AS (the winner).
 */
import { NAMED_PARTY_COUNT, P, PARTY_COUNT } from './data';
import type { Context, StateGrid, Term } from './types';
import { argMax, safeDiv, sum } from './util';

export interface CongressResult {
  raw: number[];
  shares: number[];
  leader: number;
  ideology: number;
  closeness: number[];
}

/**
 * Congress blends the last Congress (wiped by a civil war), national support
 * and the share of states each party carried.
 */
export function electCongress(
  prev: Pick<Term, 'congressRaw' | 'congress' | 'shownIdeology'>,
  descriptor: string,
  support: readonly number[],
  shownIdeology: readonly number[],
  grid: StateGrid,
  ctx: Context,
): CongressResult {
  const { rng } = ctx;
  const carryOver = descriptor === 'Civil War' ? 0 : 1;

  const raw: number[] = [];
  for (let p = 0; p < NAMED_PARTY_COUNT; p++) {
    const statesWon = grid.winners.filter((w) => w === p).length;
    const fresh = 0.5 * (support[p]! + safeDiv(statesWon, grid.votingStates));
    raw.push(Math.max(0, 0.5 * (prev.congressRaw[p]! * carryOver + fresh) - rng.next() / 20));
  }
  const thirdRaw = Math.max(0, -0.1 + support[P.THIRD]! * 0.8);
  raw.push(thirdRaw);

  return congressFromRaw(raw, prev, shownIdeology, ctx.corrections);
}

/** Columns CG-CU, CE, CF and CX-DL depend only on the raw seats and ideologies. */
export function congressFromRaw(
  raw: number[],
  prev: Pick<Term, 'congress' | 'shownIdeology'>,
  shownIdeology: readonly number[],
  corrections?: Context['corrections'],
): CongressResult {
  const denominator = sum(raw) + 0.5 * raw[P.THIRD]!;
  const shares = raw.slice(0, NAMED_PARTY_COUNT).map((r) => Math.max(0, safeDiv(r, denominator)));
  // QUIRK: the sheet uses the remainder. A positive rounding residue can
  // give Third Party a closeness score even when the raw seats are zero.
  const thirdShare = corrections?.has('congress-rounding') && denominator > 0
    ? 1.5 * raw[P.THIRD]! / denominator
    : Math.max(0, 1 - sum(shares));
  shares.push(thirdShare);

  // Congress's ideology averages this Congress and the last one.
  const weigh = (seats: readonly number[], ideo: readonly number[]): number =>
    seats.reduce((acc, seat, p) => acc + seat * ideo[p]!, 0);
  const ideology = 0.5 * weigh(prev.congress, prev.shownIdeology) + 0.5 * weigh(shares, shownIdeology);

  const closeness = shares.map((seat, p) => 100 - (seat === 0 ? 100 : Math.abs(shownIdeology[p]! - ideology)));

  return { raw, shares, leader: argMax(shares), ideology, closeness };
}

/**
 * The presidency goes to whoever holds more than half the Electoral College.
 * Otherwise Congress chooses among the top three: the largest party in the
 * outgoing Congress if one holds over 45%, else the party closest to it.
 */
export function electPresident(
  electoral: readonly number[],
  prev: Pick<Term, 'congress' | 'closeness'>,
  corrections?: Context['corrections'],
): number {
  const largest = Math.max(...electoral);
  if (largest > 0.5) return argMax(electoral);

  // Rank 1 is the largest share; ties share a rank, as in the sheet's RANK().
  const rank = electoral.map((share) => 1 + electoral.filter((other) => other > share).length);
  const basis = Math.max(...prev.congress) > 0.45 ? prev.congress : prev.closeness;
  // Ignore floating-point residue when deciding whether a party has electoral votes.
  const minimumShare = 1e-12;
  const requireVotes = corrections?.has('contingent-eligibility') && largest > minimumShare;
  const eligible: number[] = [];
  for (let p = 0; p < PARTY_COUNT; p++) {
    const hasVotes = electoral[p]! > minimumShare;
    eligible.push(rank[p]! <= 3 && (!requireVotes || hasVotes) ? basis[p]! : -1);
  }
  return argMax(eligible);
}

export interface MidtermCongress extends CongressResult {
  /** The year of the midterm election. */
  election: number;
  /** National support behind the vote: the last election's, swung for or against the president's party. */
  support: number[];
  /** How far the president's party's support was scaled: below 1 is a loss. */
  swing: number;
}

/** Scales one party's share by `factor` and spreads the difference over the rest, keeping the total. */
function swingShares(shares: readonly number[], party: number, factor: number): number[] {
  const total = sum(shares);
  const others = total - shares[party]!;
  if (total <= 0 || others <= 0) return [...shares];
  const target = Math.min(total, shares[party]! * factor);
  const scaleOthers = (total - target) / others;
  return shares.map((share, p) => (p === party ? target : share * scaleOthers));
}

/**
 * Midterm elections, an addition the spreadsheet does not have (off by
 * default). Two years into a term the whole Congress is elected again. There
 * is no state-by-state vote at a midterm, so, like a normal Congress, it
 * blends the sitting Congress with national support and the share of states
 * each party carried at the last election, both swung for or against the
 * president's party. The swing follows the term so far: day-one approval and
 * how the term is going, less a steady midterm penalty, as presidents' parties
 * usually lose ground at midterms.
 */
export function electMidterm(
  prev: Pick<Term, 'congressRaw' | 'congress' | 'shownIdeology' | 'support' | 'grid'>,
  potusParty: number,
  dayOneApproval: number,
  performance: number,
  election: number,
  ctx: Context,
): MidtermCongress {
  const { rng } = ctx;
  const mood = Math.max(-0.5, Math.min(0.5, dayOneApproval - 0.5 + performance));
  const swing = Math.max(0.4, 1 - MIDTERM_PENALTY + mood);
  const support = swingShares(prev.support, potusParty, swing);
  const statesWon = Array.from({ length: PARTY_COUNT }, (_, p) => safeDiv(prev.grid.winners.filter((w) => w === p).length, prev.grid.votingStates));
  const states = swingShares(statesWon, potusParty, swing);

  const raw: number[] = [];
  for (let p = 0; p < NAMED_PARTY_COUNT; p++) {
    const fresh = 0.5 * (support[p]! + states[p]!);
    raw.push(Math.max(0, 0.5 * (prev.congressRaw[p]! + fresh) - rng.next() / 20));
  }
  raw.push(Math.max(0, -0.1 + support[P.THIRD]! * 0.8));

  return { ...congressFromRaw(raw, prev, prev.shownIdeology, ctx.corrections), election, support, swing };
}

/** The steady loss a president's party takes at a midterm before approval is counted. */
const MIDTERM_PENALTY = 0.3;
