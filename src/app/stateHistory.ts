/**
 * One state's record across a whole timeline: how it voted in each election,
 * its electoral votes, and the headline figures the state panel shows.
 * Display only; nothing here feeds back into the simulation.
 */
import { NO_VOTE, SECEDED, type StateWinner, type Term } from '../engine/types';

export interface StateResult {
  election: number;
  /** Party index, NO_VOTE or SECEDED. */
  winner: StateWinner;
  /** Electoral votes; the sheet records none for 1792. */
  votes: number;
  lean: number;
  /** True when the state voted for the party that won the presidency. */
  backedWinner: boolean;
}

export interface StateStreak { party: number; from: number; to: number; elections: number }

export interface StateHistory {
  /** One entry per election, 1792 first. */
  results: StateResult[];
  /** First election in which the state voted for a party, or null if it never does. */
  firstVote: number | null;
  /** Elections in which it voted for a party. */
  voted: number;
  backedWinner: number;
  /** Times it voted for each party it ever chose, most often first. */
  parties: { party: number; wins: number }[];
  /** Longest unbroken run of voting for one party; the earliest on a tie. */
  longestStreak: StateStreak | null;
  /** Most electoral votes it ever had, and the first election it had them. */
  peak: { votes: number; election: number } | null;
  /** Stretches of elections it sat out as seceded. `returned` is the election it next took part in. */
  secessions: { from: number; to: number; returned: number | null }[];
}

type StateTerm = Pick<Term, 'election' | 'winnerParty'> & { grid: Pick<Term['grid'], 'winners' | 'votes' | 'lean'> };

export function stateHistory(terms: readonly StateTerm[], state: number): StateHistory {
  const results = terms.map((term): StateResult => {
    const winner = term.grid.winners[state] ?? NO_VOTE;
    return {
      election: term.election,
      winner,
      votes: term.grid.votes[state] ?? 0,
      lean: term.grid.lean[state] ?? 0,
      backedWinner: winner >= 0 && winner === term.winnerParty,
    };
  });
  const votes = results.filter((result) => result.winner >= 0);

  const wins = new Map<number, number>();
  for (const { winner } of votes) wins.set(winner, (wins.get(winner) ?? 0) + 1);
  const parties = Array.from(wins, ([party, count]) => ({ party, wins: count }))
    .sort((a, b) => b.wins - a.wins || a.party - b.party);

  let longestStreak = null as StateStreak | null;
  let streak = null as StateStreak | null;
  const secessions: StateHistory['secessions'] = [];
  let away = null as StateHistory['secessions'][number] | null;
  for (const { election, winner } of results) {
    // A streak ends when the state votes for someone else, sits out or secedes.
    if (winner >= 0 && streak?.party === winner) {
      streak.to = election;
      streak.elections++;
    } else {
      streak = winner >= 0 ? { party: winner, from: election, to: election, elections: 1 } : null;
    }
    if (streak && (!longestStreak || streak.elections > longestStreak.elections)) longestStreak = { ...streak };

    if (winner === SECEDED) {
      if (away) away.to = election;
      else secessions.push(away = { from: election, to: election, returned: null });
    } else if (away) {
      away.returned = election;
      away = null;
    }
  }

  const most = Math.max(0, ...results.map((result) => result.votes));
  return {
    results,
    firstVote: votes[0]?.election ?? null,
    voted: votes.length,
    backedWinner: votes.filter((result) => result.backedWinner).length,
    parties,
    longestStreak,
    peak: most > 0 ? { votes: most, election: results.find((result) => result.votes === most)!.election } : null,
    secessions,
  };
}

/** "1864" for one election, "1864–1872" for several. */
export const yearRange = (from: number, to: number): string => (from === to ? String(from) : `${from}–${to}`);

/** Plain sentences on when the state first voted and any time it seceded. */
export function stateStory(name: string, history: StateHistory): string[] {
  if (history.firstVote === null) return [`${name} never votes in this timeline.`];
  const story = [`${name} first voted in ${history.firstVote}.`];
  for (const { from, to, returned } of history.secessions) {
    const span = from === to ? `the ${from} election` : `the ${from} to ${to} elections`;
    story.push(`It seceded and sat out ${span}${returned === null ? ' and had not returned by 2064' : `, returning in ${returned}`}.`);
  }
  return story;
}
