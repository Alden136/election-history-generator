import { describe, expect, it } from 'vitest';
import { STATES } from '../src/engine/data';
import { CORRECTED_SETTINGS, DEFAULT_SETTINGS, simulate } from '../src/engine/simulate';
import { NO_VOTE, SECEDED, type StateWinner } from '../src/engine/types';
import { stateHistory, stateStory, yearRange } from '../src/app/stateHistory';

/** A one-state timeline: each entry is [the state's winner, the party that won the presidency]. */
function timeline(rows: [StateWinner, number][], votes = 5) {
  return rows.map(([winner, winnerParty], i) => ({
    election: 1792 + 4 * i,
    winnerParty,
    grid: { winners: [winner], votes: [winner === NO_VOTE ? 0 : votes + i], lean: [0] },
  }));
}

describe('state history', () => {
  it('summarises a state by hand', () => {
    const history = stateHistory(timeline([
      [NO_VOTE, 0], [3, 3], [3, 0], [SECEDED, 0], [SECEDED, 0], [1, 1], [1, 1], [1, 2], [3, 3],
    ]), 0);
    expect(history.firstVote).toBe(1796);
    expect(history.voted).toBe(6);
    expect(history.backedWinner).toBe(4);
    expect(history.parties).toEqual([{ party: 1, wins: 3 }, { party: 3, wins: 3 }]);
    expect(history.longestStreak).toEqual({ party: 1, from: 1812, to: 1820, elections: 3 });
    expect(history.secessions).toEqual([{ from: 1804, to: 1808, returned: 1812 }]);
    expect(history.peak).toEqual({ votes: 13, election: 1824 });
    expect(stateStory('Ohio', history)).toEqual([
      'Ohio first voted in 1796.',
      'It seceded and sat out the 1804 to 1808 elections, returning in 1812.',
    ]);
  });

  it('handles a state that never joins and one that never returns', () => {
    const never = stateHistory(timeline([[NO_VOTE, 0], [NO_VOTE, 1]]), 0);
    expect(never).toMatchObject({ firstVote: null, voted: 0, backedWinner: 0, parties: [], longestStreak: null, peak: null });
    expect(stateStory('Cuba', never)).toEqual(['Cuba never votes in this timeline.']);

    const gone = stateHistory(timeline([[2, 2], [SECEDED, 2]]), 0);
    expect(gone.secessions).toEqual([{ from: 1796, to: 1796, returned: null }]);
    expect(stateStory('Texas', gone)[1]).toBe('It seceded and sat out the 1796 election and had not returned by 2064.');
    expect(yearRange(1864, 1864)).toBe('1864');
    expect(yearRange(1864, 1872)).toBe('1864–1872');
  });

  it('agrees with the timeline for every state', () => {
    for (const settings of [DEFAULT_SETTINGS, CORRECTED_SETTINGS]) {
      for (let seed = 1; seed <= 25; seed++) {
        const { terms } = simulate(seed, settings);
        STATES.forEach((_, state) => {
          const history = stateHistory(terms, state);
          expect(history.results).toHaveLength(terms.length);
          const voted = terms.filter((term) => term.grid.winners[state]! >= 0);
          expect(history.voted).toBe(voted.length);
          expect(history.firstVote).toBe(voted[0]?.election ?? null);
          expect(history.backedWinner).toBe(voted.filter((term) => term.grid.winners[state] === term.winnerParty).length);
          expect(history.parties.reduce((total, { wins }) => total + wins, 0)).toBe(voted.length);
          expect(history.secessions.reduce((total, { from, to }) => total + (to - from) / 4 + 1, 0))
            .toBe(terms.filter((term) => term.grid.winners[state] === SECEDED).length);
          if (history.longestStreak) {
            const { party, from, to, elections } = history.longestStreak;
            expect(elections).toBe((to - from) / 4 + 1);
            expect(terms.filter((t) => t.election >= from && t.election <= to).every((t) => t.grid.winners[state] === party)).toBe(true);
          }
        });
      }
    }
  });
});
