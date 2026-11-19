/**
 * Other ways to choose electors, an addition the spreadsheet does not have.
 * They need the state popular vote, since every method but winner-take-all
 * reads each state's vote shares.
 *
 * - Winner-take-all: the state's winner takes all its electors (the default,
 *   and the only method the spreadsheet knows).
 * - By district: the state's winner takes two (its senators' electors) and the
 *   rest are split by vote share with a bonus for the leader, standing in for
 *   congressional districts, which the simulation does not have.
 * - Proportional: every elector split by vote share.
 * - National popular vote: the party with the most votes nationwide wins.
 *
 * The same functions work out who would have won under each method, for the
 * "Under other rules" box, without changing anything.
 */
import { electPresident } from './congress';
import { PARTY_COUNT } from './data';
import { nationalVote } from './popularVote';
import type { Context, StateWinner, Term } from './types';
import { argMax } from './util';

export type ElectorRule = 'winner-take-all' | 'district' | 'proportional' | 'national';
export const ELECTOR_RULES: readonly ElectorRule[] = ['winner-take-all', 'district', 'proportional', 'national'];

/** Split whole electors by weight, largest remainders first; ties go to the bigger weight, then the lower party number. */
export function largestRemainder(electors: number, weights: readonly number[]): number[] {
  const total = weights.reduce((a, b) => a + b, 0);
  if (electors <= 0 || total <= 0) return weights.map(() => 0);
  const exact = weights.map((w) => (w / total) * electors);
  const seats = exact.map(Math.floor);
  let left = electors - seats.reduce((a, b) => a + b, 0);
  const order = exact.map((e, party) => ({ party, rest: e - Math.floor(e), weight: weights[party]! }))
    .sort((a, b) => b.rest - a.rest || b.weight - a.weight || a.party - b.party);
  for (const { party } of order) { if (left-- <= 0) break; seats[party]!++; }
  return seats;
}

/** The electors each party wins in one state under a district or proportional method. */
export function stateElectors(rule: ElectorRule, winner: number, shares: readonly number[], electors: number): number[] {
  const out = new Array<number>(PARTY_COUNT).fill(0);
  if (winner < 0 || electors <= 0) return out;
  if (rule === 'winner-take-all' || rule === 'national' || !shares.length) { out[winner] = electors; return out; }
  if (rule === 'proportional') {
    const split = largestRemainder(electors, shares);
    return out.map((_, party) => split[party] ?? 0);
  }
  // By district: two at large to the winner, the rest by share squared (a district map rewards the leader).
  out[winner] = Math.min(2, electors);
  const rest = largestRemainder(electors - out[winner]!, shares.map((s) => s * s));
  return out.map((n, party) => n + (rest[party] ?? 0));
}

/** Electoral College shares under a method, from the states' winners and vote shares. National: the popular vote itself. */
export function electoralUnder(rule: ElectorRule, winners: readonly StateWinner[], shares: readonly (readonly number[])[], votes: readonly number[]): number[] {
  if (rule === 'national') return nationalVote(shares, votes);
  const won = new Array<number>(PARTY_COUNT).fill(0);
  let live = 0;
  winners.forEach((winner, i) => {
    if (winner < 0) return;
    live += votes[i]!;
    stateElectors(rule, winner, shares[i] ?? [], votes[i]!).forEach((n, party) => { won[party]! += n; });
  });
  return live > 0 ? won.map((w) => w / live) : won;
}

/** Who wins under a method: a majority of electors, otherwise Congress; the national vote goes to the plurality. */
export function winnerUnder(
  rule: ElectorRule,
  electoral: readonly number[],
  sitting: Pick<Term, 'congress' | 'closeness'>,
  corrections: Context['corrections'],
): { party: number; byCongress: boolean } {
  if (rule === 'national') return { party: argMax(electoral), byCongress: false };
  return { party: electPresident(electoral, sitting, corrections), byCongress: Math.max(...electoral) <= 0.5 };
}

/** One faithless elector: someone pledged to the state's winner who voted for another party. */
export interface FaithlessElector {
  state: number;
  /** How many electors defected (one, rarely two). */
  electors: number;
  from: number;
  to: number;
}

/** The chance a state's electors include a faithless one, per election. */
export const FAITHLESS_CHANCE = 0.004;

/**
 * Rare named faithless electors: now and then one or two of a state's electors
 * vote for the runner-up instead. Returns the defections and the electoral
 * shares after them.
 */
export function faithlessElectors(
  electoral: readonly number[],
  winners: readonly StateWinner[],
  shares: readonly (readonly number[])[],
  votes: readonly number[],
  ctx: Context,
): { electoral: number[]; faithless: FaithlessElector[] } {
  const live = winners.reduce((total, winner, i) => total + (winner >= 0 ? votes[i]! : 0), 0);
  const counts = electoral.map((share) => share * live);
  const faithless: FaithlessElector[] = [];
  winners.forEach((winner, i) => {
    if (winner < 0 || votes[i]! < 3 || ctx.rng.next() >= FAITHLESS_CHANCE) return;
    const state = shares[i] ?? [];
    const to = state.length
      ? state.map((share, party) => ({ share, party })).filter(({ party }) => party !== winner).sort((a, b) => b.share - a.share)[0]!.party
      : (winner + 1) % PARTY_COUNT;
    const electors = ctx.rng.next() < 0.2 ? 2 : 1;
    const moved = Math.min(electors, counts[winner]!);
    if (moved <= 0) return;
    counts[winner]! -= moved;
    counts[to]! += moved;
    faithless.push({ state: i, electors: moved, from: winner, to });
  });
  return { electoral: live > 0 ? counts.map((c) => c / live) : [...electoral], faithless };
}
