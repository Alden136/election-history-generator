import { describe, expect, it } from 'vitest';
import { CORRECTED_SETTINGS, simulate } from '../src/engine/simulate';
import { electoralTotals } from '../src/engine/states';
import { compactCount, estimatedVotes, estimatedWinnerVotes, partyResults } from '../src/app/presentation';

describe('popular vote counts', () => {
  it('shortens counts for a table column', () => {
    expect(compactCount(72_040_000)).toBe('72.0M');
    expect(compactCount(6_432_100)).toBe('6.43M');
    expect(compactCount(849_600)).toBe('850K');
    expect(compactCount(10_000)).toBe('10K');
    expect(compactCount(8_604)).toBe('8,600');
  });

  it('estimates every party on the same scale as the winner', () => {
    const { terms } = simulate(42, CORRECTED_SETTINGS);
    for (const term of terms.slice(1)) {
      const live = electoralTotals(term.grid).live;
      expect(estimatedVotes(term, term.winnerPopularShare, live)).toBe(estimatedWinnerVotes(term, live));
      // Party shares add up to the whole vote, so their counts add up to the estimated total.
      const parties = partyResults(term).filter((party) => party.popular !== null);
      const total = estimatedVotes(term, 1, live);
      const sum = parties.reduce((t, party) => t + estimatedVotes(term, party.popular!, live), 0);
      expect(Math.abs(sum - total) / total).toBeLessThan(0.02);
    }
  });
});
