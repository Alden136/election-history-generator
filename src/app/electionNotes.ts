/**
 * Words and figures for the recounts, faithless electors, other elector rules
 * and turnout additions. Display only; nothing here feeds the simulation.
 */
import { partyName, STATES } from '../engine/data';
import { electoralUnder, ELECTOR_RULES, winnerUnder, type ElectorRule } from '../engine/electorRules';
import type { Context, Term } from '../engine/types';

/** "Recount: held, margin 0.31 points" or "Recount: flipped from Whig to Democrat, margin 0.08 points". Null when there was none. */
export function recountText(term: Term, state: number): string | null {
  const recount = term.grid.recounts?.find((r) => r.state === state);
  if (!recount) return null;
  const margin = `margin ${(recount.margin * 100).toFixed(2)} points`;
  return recount.flipped
    ? `Recount: flipped from ${partyName(recount.other)} to ${partyName(recount.winner)}, ${margin}`
    : `Recount: ${partyName(recount.winner)} held on, ${margin}`;
}

/** "1 faithless elector voted Whig instead of Democrat". Null when there was none. */
export function faithlessText(term: Term, state: number): string | null {
  const record = term.faithless?.find((f) => f.state === state);
  if (!record) return null;
  return `${record.electors} faithless ${record.electors === 1 ? 'elector' : 'electors'} voted ${partyName(record.to)} instead of ${partyName(record.from)}`;
}

/** Every faithless elector at an election, as one sentence. */
export function faithlessSummary(term: Term): string | null {
  if (!term.faithless?.length) return null;
  return term.faithless.map((f) => `${f.electors} in ${STATES[f.state]!.name} voted ${partyName(f.to)} instead of ${partyName(f.from)}`).join('; ');
}

/** The Congress that would decide a deadlocked election: the one elected at the midterm, or else the last one. */
export function sittingCongress(terms: readonly Term[], term: Term): Pick<Term, 'congress' | 'closeness'> {
  if (term.midterm) return { congress: term.midterm.shares, closeness: term.midterm.closeness };
  return terms[term.index - 1] ?? term;
}

export interface OtherRuleRow {
  rule: ElectorRule;
  /** The winner under this method, and whether Congress had to choose. */
  party: number;
  byCongress: boolean;
  /** The winner's share: of electors, or of the national vote for the national method. */
  share: number;
  /** Electors won by the winner and the runner-up, out of live, for the elector methods. */
  electors: { winner: number; runnerUp: number; runnerUpParty: number; live: number } | null;
}

/** Who would have won this election under each way of choosing electors, from the same votes. Null without vote shares. */
export function otherRules(terms: readonly Term[], term: Term, corrections: Context['corrections']): OtherRuleRow[] | null {
  const shares = term.grid.voteShares;
  if (!shares || term.index === 0) return null;
  const sitting = sittingCongress(terms, term);
  const live = term.grid.winners.reduce((total, winner, i) => total + (winner >= 0 ? term.grid.votes[i]! : 0), 0);
  return ELECTOR_RULES.map((rule) => {
    const electoral = electoralUnder(rule, term.grid.winners, shares, term.grid.votes);
    const { party, byCongress } = winnerUnder(rule, electoral, sitting, corrections);
    const runnerUpParty = electoral.map((share, p) => ({ share, p })).filter(({ p }) => p !== party).sort((a, b) => b.share - a.share)[0]!.p;
    return {
      rule, party, byCongress, share: electoral[party]!,
      electors: rule === 'national' ? null
        : { winner: Math.round(electoral[party]! * live), runnerUp: Math.round(electoral[runnerUpParty]! * live), runnerUpParty, live },
    };
  });
}
