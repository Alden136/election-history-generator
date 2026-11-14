import { describe, expect, it } from 'vitest';
import turnout from '../data/turnout.json';
import { ELECTIONS } from '../src/engine/data';
import { simulate } from '../src/engine/simulate';
import { electoralTotals } from '../src/engine/states';
import { approximateCount, estimatedWinnerVotes } from '../src/app/presentation';

describe('estimated popular vote counts', () => {
  it('has a real total for every election up to 2024', () => {
    for (const year of ELECTIONS.filter((y) => y <= 2024)) {
      expect(turnout.votes[String(year) as keyof typeof turnout.votes], String(year)).toBeGreaterThan(0);
    }
  });

  it('matches the real total when the timeline has the real electoral votes', () => {
    // A timeline's 2024 winner with its share applied to the real 2024 turnout.
    const term = simulate(42).terms.find((t) => t.election === 2024)!;
    const votes = estimatedWinnerVotes(term, 538);
    expect(votes).toBeCloseTo(term.winnerPopularShare * 154308000, 0);
  });

  it('scales with the electoral votes this timeline actually has', () => {
    const term = simulate(42).terms.find((t) => t.election === 2024)!;
    const live = electoralTotals(term.grid).live;
    expect(estimatedWinnerVotes(term, live)).toBeCloseTo(estimatedWinnerVotes(term, 538) * live / 538, 0);
  });

  it('projects past 2024 at the stated growth rate', () => {
    const term = { ...simulate(42).terms.find((t) => t.election === 2028)!, winnerPopularShare: 1 };
    const real2028 = estimatedWinnerVotes(term, 538) / (538 / 538);
    expect(real2028).toBeCloseTo(154308000 * 1.005 ** 4, 0);
  });

  it('rounds counts to what an estimate can claim', () => {
    expect(approximateCount(68_436_512)).toBe('68.4 million');
    expect(approximateCount(1_234_567)).toBe('1.23 million');
    expect(approximateCount(28_579)).toBe('28,600');
    expect(approximateCount(4_321)).toBe('4,320');
  });
});
