import { describe, expect, it } from 'vitest';
import { DEFAULT_DIALS } from '../src/engine/data';
import { nationalVote, popularWeight, stateMargin } from '../src/engine/popularVote';
import { RULES } from '../src/engine/rules';
import { CORRECTED_SETTINGS, simulate } from '../src/engine/simulate';
import { additionsText, partyResults, readLocation, stateVoteText, timelineUrl } from '../src/app/presentation';

const ON = { ...CORRECTED_SETTINGS, midterms: true, candidateTraits: true, primaries: true, runningMates: true, popularVote: true };

describe('state popular vote', () => {
  it('is off unless asked for', () => {
    const timeline = simulate(42, CORRECTED_SETTINGS);
    expect(timeline.popularVote).toBe(false);
    for (const term of timeline.terms) {
      expect(term.popularVote).toBeNull();
      expect(term.grid.voteShares).toBeUndefined();
    }
  });

  it('gives every voting state shares that add up to one, and the plurality wins it', () => {
    for (let seed = 1; seed <= 30; seed++) {
      for (const term of simulate(seed, ON).terms.slice(1)) {
        const { winners, voteShares } = term.grid;
        winners.forEach((winner, i) => {
          const shares = voteShares![i]!;
          if (winner < 0) { expect(shares).toEqual([]); return; }
          expect(shares.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
          expect(shares.indexOf(Math.max(...shares))).toBe(winner);
          // A party with no national support gets no votes.
          shares.forEach((share, party) => { if (term.support[party] === 0) expect(share).toBe(0); });
        });
      }
    }
  });

  it('adds the states up into the national popular vote, which the winner\'s share comes from', () => {
    for (let seed = 1; seed <= 20; seed++) {
      for (const term of simulate(seed, ON).terms.slice(1)) {
        const national = term.popularVote!;
        expect(national).toEqual(nationalVote(term.grid.voteShares!, term.grid.votes));
        if (term.grid.votingStates > 0) expect(national.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
        expect(term.winnerPopularShare).toBe(national[term.winnerParty]);
        expect(partyResults(term).find((p) => p.index === term.winnerParty)!.popular).toBe(national[term.winnerParty]);
      }
    }
    expect(popularWeight(3)).toBe(1);
    expect(popularWeight(55)).toBe(53);
    // Weights 1 and 3: the state that did not vote counts for nothing.
    const [a, b] = nationalVote([[0.6, 0.4], [], [0.2, 0.8]], [3, 10, 5]);
    expect(a).toBeCloseTo(0.6 * 0.25 + 0.2 * 0.75, 10);
    expect(b).toBeCloseTo(0.4 * 0.25 + 0.8 * 0.75, 10);
  });

  it('gives believable margins, and sometimes elects a president who lost the popular vote', () => {
    const margins: number[] = [];
    let decided = 0, splits = 0;
    for (let seed = 1; seed <= 100; seed++) {
      for (const term of simulate(seed, ON).terms.slice(2)) {
        for (const shares of term.grid.voteShares!) if (shares.length) margins.push(stateMargin(shares));
        if (Math.max(...term.electoral) <= 0.5) continue;
        decided++;
        if (term.popularVote!.indexOf(Math.max(...term.popularVote!)) !== term.winnerParty) splits++;
      }
    }
    margins.sort((a, b) => a - b);
    const median = margins[Math.floor(margins.length / 2)]!;
    expect(median).toBeGreaterThan(0.08);
    expect(median).toBeLessThan(0.25);
    expect(splits).toBeGreaterThan(0);
    expect(splits / decided).toBeLessThan(0.15);
  });

  it('describes a state\'s vote in words', () => {
    const term = simulate(42, ON).terms[20]!;
    const state = term.grid.winners.findIndex((winner) => winner >= 0);
    expect(stateVoteText(term, state)).toMatch(/^.+ \d+\.\d%, .+ \d+\.\d% · won by \d+\.\d points$/);
    expect(stateVoteText(simulate(42, CORRECTED_SETTINGS).terms[20]!, state)).toBeNull();
  });

  it('is on in the app by default and travels in share links as pv=0 when off', () => {
    expect(readLocation('?seed=3&year=1900').popularVote).toBe(true);
    const base = { seed: 3, year: 1900, corrections: RULES, dials: DEFAULT_DIALS, midterms: true, traits: true, primaries: true, runningMates: true };
    const off = timelineUrl('https://example.test/', { ...base, popularVote: false });
    expect(off.searchParams.get('pv')).toBe('0');
    expect(readLocation(off.search).popularVote).toBe(false);
    expect(timelineUrl(off.href, { ...base, popularVote: true }).searchParams.has('pv')).toBe(false);
    expect(additionsText(false, false, false, false, true)).toBe('a state popular vote');
  });
});
