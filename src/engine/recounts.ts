/**
 * Close states and recounts, an addition the spreadsheet does not have (off
 * unless settings.recounts and settings.popularVote are both true).
 *
 * A state won by under half a point goes to a recount, which sometimes flips
 * it: the closer the count, the likelier. When giving a recounted state to the
 * other side would have changed who won the presidency, the result is
 * contested, as in 1876 and 2000, and the winner starts their term less
 * popular.
 */
import { electoralUnder, winnerUnder, type ElectorRule } from './electorRules';
import { stateMargin } from './popularVote';
import type { Context, StateWinner, Term } from './types';

export interface Recount {
  /** State index. */
  state: number;
  /** The margin before the recount, 0 to RECOUNT_MARGIN. */
  margin: number;
  flipped: boolean;
  /** Who holds the state after the recount, and the other of the top two. */
  winner: number;
  other: number;
}

/** A state won by less than this goes to a recount: half a point. */
export const RECOUNT_MARGIN = 0.005;
/** Day-one approval the winner of a contested election loses. */
export const CONTESTED_APPROVAL = 0.05;

/** The chance a recount flips the state: 25% for a dead heat, down to 5% at half a point. */
export const flipChance = (margin: number) => 0.25 - 0.2 * Math.min(1, margin / RECOUNT_MARGIN);

/**
 * Recount every state won by under half a point. A flipped state goes to the
 * runner-up, whose share swaps with the leader's so the count still shows who
 * won. Changes winners and shares in place.
 */
export function runRecounts(winners: StateWinner[], shares: number[][], ctx: Context): Recount[] {
  const recounts: Recount[] = [];
  shares.forEach((state, i) => {
    if (!state.length || winners[i]! < 0) return;
    const margin = stateMargin(state);
    if (margin >= RECOUNT_MARGIN) return;
    const order = state.map((share, party) => ({ share, party })).sort((a, b) => b.share - a.share);
    const leader = order[0]!.party, runnerUp = order[1]!.party;
    const flipped = ctx.rng.next() < flipChance(margin);
    if (flipped) {
      [state[leader], state[runnerUp]] = [state[runnerUp]!, state[leader]!];
      winners[i] = runnerUp;
    }
    recounts.push({ state: i, margin, flipped, winner: flipped ? runnerUp : leader, other: flipped ? leader : runnerUp });
  });
  return recounts;
}

/**
 * True when handing any recounted state to the other side would change who
 * wins the presidency, counted under the elector rule in use, with no stray
 * electors.
 */
export function isContested(
  winners: readonly StateWinner[],
  shares: readonly (readonly number[])[],
  votes: readonly number[],
  recounts: readonly Recount[],
  sitting: Pick<Term, 'congress' | 'closeness'>,
  corrections: Context['corrections'],
  rule: ElectorRule = 'winner-take-all',
): boolean {
  if (!recounts.length) return false;
  const winnerOf = (w: readonly StateWinner[], s: readonly (readonly number[])[]) =>
    winnerUnder(rule, electoralUnder(rule, w, s, votes), sitting, corrections).party;
  const actual = winnerOf(winners, shares);
  return recounts.some((recount) => {
    const otherWinners = [...winners];
    otherWinners[recount.state] = recount.other;
    const otherShares = shares.map((s) => [...s]);
    const state = otherShares[recount.state]!;
    [state[recount.winner], state[recount.other]] = [state[recount.other]!, state[recount.winner]!];
    return winnerOf(otherWinners, otherShares) !== actual;
  });
}
