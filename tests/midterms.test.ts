import { describe, expect, it } from 'vitest';
import { DEFAULT_DIALS } from '../src/engine/data';
import { electPresident } from '../src/engine/congress';
import { RULES } from '../src/engine/rules';
import { CORRECTED_SETTINGS, DEFAULT_SETTINGS, simulate } from '../src/engine/simulate';
import { chambers, midtermChambers } from '../src/app/chambers';
import { electionYears, isMidtermYear, presidentialYear, readLocation, timelineUrl } from '../src/app/presentation';
import { midtermSummary } from '../src/app/midtermView';

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

  it('are on in the app by default, and travel in share links as midterms=0 when off', () => {
    expect(readLocation('?seed=9&year=1900').midterms).toBe(true);
    const base = { seed: 9, year: 1900, corrections: RULES, dials: DEFAULT_DIALS, traits: true, primaries: true, runningMates: true, popularVote: true, spoilers: true };
    const off = timelineUrl('https://example.test/', { ...base, midterms: false });
    expect(off.searchParams.get('midterms')).toBe('0');
    expect(readLocation(off.search).midterms).toBe(false);
    const on = timelineUrl(off.href, { ...base, midterms: true });
    expect(on.searchParams.has('midterms')).toBe(false);
    expect(readLocation(on.search).midterms).toBe(true);
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

describe('midterms as elections', () => {
  it('make 137 elections in year order, 68 of them midterms', () => {
    const years = electionYears(true);
    expect(years).toHaveLength(137);
    expect(years.filter(isMidtermYear)).toHaveLength(68);
    expect(years.slice(0, 4)).toEqual([1792, 1794, 1796, 1798]);
    expect(years.at(-2)).toBe(2062);
    expect(years.at(-1)).toBe(2064);
    expect(electionYears(false)).toHaveLength(69);
    expect(presidentialYear(1862)).toBe(1860);
    expect(presidentialYear(1860)).toBe(1860);
  });

  it('open a midterm year from a link, or the election before it with midterms off', () => {
    expect(readLocation('?seed=1&year=1862').year).toBe(1862);
    expect(readLocation('?seed=1&year=1862&midterms=0').year).toBe(1860);
    expect(readLocation('?seed=1&year=1863').year).toBe(2024);
  });

  it('summarise each midterm against the Congress it replaces', () => {
    const { terms } = simulate(11, { ...CORRECTED_SETTINGS, midterms: true });
    for (const term of terms) {
      const summary = midtermSummary(term, terms[term.index + 1]);
      if (term.index === terms.length - 1) { expect(summary).toBeNull(); continue; }
      expect(summary!.year).toBe(term.election + 2);
      expect(summary!.party).toBe(term.winnerParty);
      expect(summary!.president).toBe(term.winnerName);
      const sum = (key: 'houseAfter' | 'senateAfter') => summary!.rows.reduce((total, row) => total + row[key], 0);
      expect(sum('houseAfter')).toBe(summary!.after.house.size);
      expect(sum('senateAfter')).toBe(summary!.after.senate.size);
      const own = summary!.rows.find((row) => row.party === summary!.party);
      expect(summary!.houseChange).toBe((own?.houseAfter ?? 0) - (own?.houseBefore ?? 0));
    }
    expect(midtermSummary(terms[0]!, simulate(11, CORRECTED_SETTINGS).terms[1])).toBeNull();
  });
});
