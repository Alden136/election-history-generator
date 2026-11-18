import { describe, expect, it } from 'vitest';
import { DEFAULT_DIALS } from '../src/engine/data';
import { electPresident } from '../src/engine/congress';
import { RULES } from '../src/engine/rules';
import { CORRECTED_SETTINGS, DEFAULT_SETTINGS, simulate } from '../src/engine/simulate';
import { chambers, midtermChambers } from '../src/app/chambers';
import { readLocation, timelineUrl } from '../src/app/presentation';

describe('midterm elections', () => {
  it('are off unless asked for, and then leave every term without a midterm', () => {
    for (const settings of [DEFAULT_SETTINGS, CORRECTED_SETTINGS]) {
      const timeline = simulate(42, settings);
      expect(timeline.midterms).toBe(false);
      expect(timeline.terms.every((term) => term.midterm === null)).toBe(true);
    }
  });

  it('elect a sound Congress two years into every term after the first', () => {
    for (const settings of [DEFAULT_SETTINGS, CORRECTED_SETTINGS]) {
      for (let seed = 1; seed <= 30; seed++) {
        const { terms, midterms } = simulate(seed, { ...settings, midterms: true });
        expect(midterms).toBe(true);
        expect(terms[0]!.midterm).toBeNull();
        for (const term of terms.slice(1)) {
          const midterm = term.midterm!;
          expect(midterm.election).toBe(term.election - 2);
          expect(midterm.shares.every((share) => Number.isFinite(share) && share >= 0)).toBe(true);
          expect(midterm.shares.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
          expect(midterm.shares[midterm.leader]).toBe(Math.max(...midterm.shares));
        }
      }
    }
  });

  it('usually cost the president\'s party ground', () => {
    let held = 0;
    let lost = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const { terms } = simulate(seed, { ...CORRECTED_SETTINGS, midterms: true });
      terms.slice(1).forEach((term) => {
        const before = terms[term.index - 1]!.congress[term.potusParty]!;
        if (term.midterm!.shares[term.potusParty]! < before) lost++;
        else held++;
      });
    }
    expect(lost / (lost + held)).toBeGreaterThan(0.8);
  });

  it('decide deadlocked elections with the midterm Congress', () => {
    let deadlocks = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const { terms } = simulate(seed, { ...CORRECTED_SETTINGS, midterms: true });
      for (const term of terms.slice(1)) {
        if (Math.max(...term.electoral) > 0.5) continue;
        deadlocks++;
        expect(electPresident(term.electoral, { congress: term.midterm!.shares, closeness: term.midterm!.closeness }, new Set(RULES))).toBe(term.winnerParty);
      }
    }
    expect(deadlocks).toBeGreaterThan(0);
  });

  it('change the history that follows', () => {
    const off = simulate(42, CORRECTED_SETTINGS);
    const on = simulate(42, { ...CORRECTED_SETTINGS, midterms: true });
    // The 1792 election comes before any midterm, so it is the same.
    expect(on.terms[0]).toEqual({ ...off.terms[0], midterm: null });
    expect(on.terms.some((term, k) => term.congressLeader !== off.terms[k]!.congressLeader || term.courtAverage !== off.terms[k]!.courtAverage)).toBe(true);
  });

  it('travel in share links as midterms=1', () => {
    const base = { seed: 9, year: 1900, corrections: RULES, dials: DEFAULT_DIALS };
    const on = timelineUrl('https://example.test/', { ...base, midterms: true });
    expect(on.searchParams.get('midterms')).toBe('1');
    expect(readLocation(on.search).midterms).toBe(true);
    const off = timelineUrl(on.href, { ...base, midterms: false });
    expect(off.searchParams.has('midterms')).toBe(false);
    expect(readLocation(off.search).midterms).toBe(false);
  });

  it('keep the chamber sizes of the Congress they replace', () => {
    const { terms } = simulate(7, { ...CORRECTED_SETTINGS, midterms: true });
    for (const term of terms.slice(0, -1)) {
      const elected = chambers(term);
      const after = midtermChambers(term, terms[term.index + 1]!.midterm!);
      expect(after.house.size).toBe(elected.house.size);
      expect(after.senate.size).toBe(elected.senate.size);
    }
  });
});
