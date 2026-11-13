import { BLOC_COUNT, NAMED_PARTY_COUNT, PARTY_COUNT, STATE_COUNT } from '../src/engine/data.ts';
import type { Timeline } from '../src/engine/simulate.ts';
import { NO_VOTE, SECEDED, type Expansions } from '../src/engine/types.ts';
import { sum } from '../src/engine/util.ts';

const expansionKeys = ['texas', 'west', 'mexico', 'canada', 'quebec', 'puertoRico', 'cuba', 'westVirginia'] as const;
const normalized = (values: readonly number[], total = 1): boolean => Math.abs(sum(values) - total) < 1e-9;

function gainedOrKept(before: Expansions, after: Expansions): boolean {
  return expansionKeys.every((key) => !before[key] || after[key]);
}

export function assertTimeline(timeline: Timeline): void {
  const { terms, finalPresident, finalExpansions, summary } = timeline;
  const require = (condition: boolean, label: string, year?: number): void => {
    if (!condition) throw new Error(`Seed ${timeline.seed}${year === undefined ? '' : `, ${year}`}: ${label}`);
  };
  require(terms.length === 69, 'expected 69 elections');

  for (const [i, term] of terms.entries()) {
    const { grid } = term;
    const check = (condition: boolean, label: string) => require(condition, label, term.election);
    check(term.index === i && term.election === 1792 + 4 * i && term.termBegan === 1789 + 4 * i, 'invalid year or index');

    const arrays: [readonly number[], number, string][] = [
      [term.electoral, PARTY_COUNT, 'electoral shares'],
      [term.support, PARTY_COUNT, 'support'],
      [term.shownIdeology, PARTY_COUNT, 'shown ideology'],
      [term.congress, PARTY_COUNT, 'congress shares'],
      [term.congressRaw, PARTY_COUNT, 'raw congress seats'],
      [term.closeness, PARTY_COUNT, 'congress closeness'],
      [term.strength, NAMED_PARTY_COUNT, 'party strength'],
      [term.ideology, NAMED_PARTY_COUNT, 'party ideology'],
      [term.voteTotals, NAMED_PARTY_COUNT, 'vote totals'],
      [term.blocSizes, BLOC_COUNT, 'bloc sizes'],
      [term.blocShares, BLOC_COUNT, 'bloc shares'],
      [term.nonvoters, BLOC_COUNT, 'nonvoters'],
      [grid.winners, STATE_COUNT, 'state winners'],
      [grid.lean, STATE_COUNT, 'state lean'],
      [grid.urban, STATE_COUNT, 'state urbanization'],
      [grid.votes, STATE_COUNT, 'state electoral votes'],
    ];
    for (const [values, length, name] of arrays) {
      check(values.length === length && values.every(Number.isFinite), `invalid ${name}`);
    }
    check(term.votes.length === NAMED_PARTY_COUNT &&
      term.votes.every((votes, party) => votes.length === BLOC_COUNT &&
        votes.every((vote) => Number.isFinite(vote) && vote >= 0) && normalized(votes, term.voteTotals[party])),
      'invalid vote-by-bloc totals');
    check(term.court.length === 15 && term.court.every((seat) => seat === null || Number.isFinite(seat)), 'invalid court seats');
    check([term.potusIdeology, term.dayOneApproval, term.performance, term.stability, term.electionDayApproval,
      term.winnerElectoralShare, term.winnerPopularShare, term.congressIdeology, term.congressIdeologyBefore,
      term.strengthThird, term.center, term.leanAverage, term.leanShift, term.courtAverage, grid.avgUrban]
      .every(Number.isFinite), 'non-finite term value');
    const shares = { electoral: term.electoral, support: term.support, congress: term.congress,
      strength: term.strength, urban: grid.urban };
    // SS-SY apply the lean multiplier after the floor. A sufficiently abrupt
    // lean shift can therefore produce a negative bloc in the original rules.
    for (const [name, values] of Object.entries(shares)) {
      check(values.every((v) => v >= 0 && v <= 1 + 1e-9), `${name} share outside its valid range: ${Math.min(...values)} to ${Math.max(...values)}`);
    }
    check(term.ideology.every((v) => Math.abs(v) <= 10) && grid.lean.every((v) => Math.abs(v) <= 8), 'ideology or state lean outside its valid range');
    check(term.stability >= 0.1 && term.stability <= 1 &&
      term.electionDayApproval >= 0.05 && term.electionDayApproval <= 0.9, 'approval or stability outside its valid range');
    check(normalized(term.blocShares) && normalized(term.support), 'electorate shares do not sum to one');
    check(grid.winners.every((winner) => Number.isInteger(winner) && winner >= SECEDED && winner < PARTY_COUNT), 'unknown state winner');
    check(grid.votes.every((votes) => Number.isInteger(votes) && votes >= 0), 'invalid state elector count');
    check(grid.totalVotes === sum(grid.votes) &&
      grid.secededVotes === sum(grid.votes.filter((_, state) => grid.winners[state] === SECEDED)) &&
      grid.votingStates === grid.winners.filter((winner) => winner !== NO_VOTE && winner !== SECEDED).length,
      'state totals do not match the grid');
    const next = terms[i + 1] ?? { president: finalPresident.name, potusParty: finalPresident.party, grid: { expansions: finalExpansions } };
    check(term.winnerName.length > 0 && next.president === term.winnerName && next.potusParty === term.winnerParty,
      'next president does not match the election');
    check(gainedOrKept(grid.expansions, next.grid.expansions), 'an expansion reversed');
    check(term.winnerElectoralShare === term.electoral[term.winnerParty] &&
      term.result === (term.winnerParty === term.potusParty ? 'WIN' : 'LOSS'), 'winner does not match the result');
    if (i === 0) continue; // The sheet seeds 1792 without a full electoral or congressional tally.
    check(normalized(term.congress), 'congress shares do not sum to one');
    const expectedElectoralTotal = grid.totalVotes === grid.secededVotes ? 0 : 1;
    check(normalized(term.electoral, expectedElectoralTotal), 'electoral shares do not match eligible electors');
  }

  require(finalPresident.termBegan === 2065 && Number.isFinite(finalPresident.ideology), 'invalid final presidency');
  require(summary.weirdness === summary.expansions + summary.governingParties +
    0.5 * summary.dictatorships + summary.civilWars, 'inconsistent weirdness score');
}
