import { PARTIES } from './data';
import type { Timeline } from './simulate';

export const TIMELINE_METRICS = [
  'dictatorships', 'civilWars', 'expansions', 'governingParties', 'weirdness',
  'winnerEc', 'winnerPv', 'contingent', 'secededElections', 'noVotingStates',
  ...PARTIES.map((party) => party.name),
];

export function measureTimeline(timeline: Timeline): number[] {
  const { summary, terms } = timeline;
  const wins: number[] = PARTIES.map(() => 0);
  let winnerEc = 0, winnerPv = 0, contingent = 0, seceded = 0, noVotingStates = 0;
  // Exclude the fixed founding election from rates.
  for (const term of terms.slice(1)) {
    wins[term.winnerParty]!++;
    winnerEc += term.winnerElectoralShare;
    winnerPv += term.winnerPopularShare;
    if (Math.max(...term.electoral) <= 0.5) contingent++;
    if (term.grid.secededVotes > 0) seceded++;
    if (term.grid.votingStates === 0) noVotingStates++;
  }
  const n = terms.length - 1;
  return [summary.dictatorships, summary.civilWars, summary.expansions, summary.governingParties, summary.weirdness,
    winnerEc / n, winnerPv / n, contingent / n, seceded / n, noVotingStates, ...wins.map((win) => win / n)];
}

export interface BatchStatistics {
  means: number[];
  withDictatorship: number;
  withCivilWar: number;
  outcomes: { label: string; count: number }[];
}

export function collectStatistics() {
  const totals = TIMELINE_METRICS.map(() => 0);
  const outcomes = new Map<string, number>();
  let count = 0;
  let dictatorships = 0;
  let civilWars = 0;

  return {
    add(timeline: Timeline) {
      const { summary } = timeline;
      measureTimeline(timeline).forEach((value, i) => { totals[i]! += value; });
      if (summary.dictatorships > 0) dictatorships++;
      if (summary.civilWars > 0) civilWars++;
      outcomes.set(summary.weirdnessLabel, (outcomes.get(summary.weirdnessLabel) ?? 0) + 1);
      count++;
    },
    result(): BatchStatistics {
      return {
        means: totals.map((total) => total / count),
        withDictatorship: dictatorships / count,
        withCivilWar: civilWars / count,
        outcomes: Array.from(outcomes, ([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
      };
    },
  };
}
