/**
 * A real state-by-state popular vote, an addition the spreadsheet does not
 * have (off unless settings.popularVote is true).
 *
 * Every voting state gets a vote share for each party with support: the
 * state score the spreadsheet uses (distance from the state's lean, national
 * support, home states), a pull toward the party that won the state last time,
 * and some noise, turned into shares that add up to one. The plurality wins
 * the state. The national popular vote adds the states up, each weighted by
 * its electoral votes minus its two senators, as a stand-in for population.
 */
import { PARTY_COUNT } from './data';
import type { Context } from './types';

/** Score points per factor of e between two parties' votes: higher spreads the vote more evenly. */
export const VOTE_SPREAD = 10;
/** Pull toward last time's winner, in score points per unit of the Party loyalty dial. */
export const LOYALTY_PULL = 7;
/** Largest random swing for one party in one state, in score points. */
export const VOTE_NOISE = 4;

export interface StateVoteInput {
  /** The spreadsheet's score for each party: lower is better; Infinity for a party that cannot win. */
  scores: readonly number[];
  /** The party that won the state last time, or a negative code. */
  last: number;
}

/** One state's vote shares, 15 entries summing to one. */
export function stateShares({ scores, last }: StateVoteInput, ctx: Context): number[] {
  const { rng, dials } = ctx;
  const utility = scores.map((score, party) => {
    if (!Number.isFinite(score)) return -Infinity;
    const loyalty = party === last ? LOYALTY_PULL * dials.partyLoyalty : 0;
    return -score + loyalty + (rng.next() * 2 - 1) * VOTE_NOISE;
  });
  const top = Math.max(...utility);
  if (!Number.isFinite(top)) return new Array<number>(PARTY_COUNT).fill(0);
  const weights = utility.map((u) => (Number.isFinite(u) ? Math.exp((u - top) / VOTE_SPREAD) : 0));
  const total = weights.reduce((a, b) => a + b, 0);
  return weights.map((w) => w / total);
}

/** How much a state counts toward the national vote: its House seats, at least one. */
export const popularWeight = (electoralVotes: number) => Math.max(1, electoralVotes - 2);

/** The national popular vote: every voting state's shares, weighted by its House seats. */
export function nationalVote(shares: readonly (readonly number[])[], votes: readonly number[]): number[] {
  const totals = new Array<number>(PARTY_COUNT).fill(0);
  let weight = 0;
  shares.forEach((state, i) => {
    if (!state.length) return;
    const w = popularWeight(votes[i]!);
    weight += w;
    state.forEach((share, party) => { totals[party]! += share * w; });
  });
  return weight > 0 ? totals.map((t) => t / weight) : totals;
}

/** The winner's lead over the runner-up in a state, 0 to 1. */
export function stateMargin(shares: readonly number[]): number {
  const [first = 0, second = 0] = [...shares].sort((a, b) => b - a);
  return first - second;
}
