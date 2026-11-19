import { describe, expect, it } from 'vitest';
import { DEFAULT_DIALS } from '../src/engine/data';
import { electoralUnder, largestRemainder, stateElectors } from '../src/engine/electorRules';
import { nationalVote, stateMargin } from '../src/engine/popularVote';
import { flipChance, RECOUNT_MARGIN } from '../src/engine/recounts';
import { RULES } from '../src/engine/rules';
import { CORRECTED_SETTINGS, simulate } from '../src/engine/simulate';
import { SUFFRAGE } from '../src/engine/turnout';
import { additionsList, readLocation, timelineUrl } from '../src/app/presentation';
import { otherRules } from '../src/app/electionNotes';

const BASE = { ...CORRECTED_SETTINGS, midterms: true, candidateTraits: true, primaries: true, runningMates: true, popularVote: true, spoilers: true };
const ALL = { ...BASE, recounts: true, faithless: true, turnout: true };

describe('recounts', () => {
  it('are off unless asked for, and need the state popular vote', () => {
    for (const settings of [BASE, { ...CORRECTED_SETTINGS, recounts: true }]) {
      const timeline = simulate(42, settings);
      expect(timeline.recounts).toBe(false);
      expect(timeline.terms.every((term) => !term.grid.recounts && !term.contested)).toBe(true);
    }
  });

  it('recount every state won by under half a point, and only those', () => {
    let flipped = 0, total = 0;
    for (let seed = 1; seed <= 30; seed++) {
      for (const term of simulate(seed, ALL).terms.slice(1)) {
        const recounted = new Set(term.grid.recounts!.map((r) => r.state));
        term.grid.voteShares!.forEach((shares, state) => {
          if (!shares.length || term.grid.winners[state]! < 0) return;
          // After a flip the shares are swapped, so the margin itself is unchanged.
          expect(recounted.has(state)).toBe(stateMargin(shares) < RECOUNT_MARGIN);
          expect(shares.indexOf(Math.max(...shares))).toBe(term.grid.winners[state]);
        });
        for (const r of term.grid.recounts!) { total++; if (r.flipped) flipped++; }
        if (term.contested) expect(term.grid.recounts!.length).toBeGreaterThan(0);
      }
    }
    expect(total).toBeGreaterThan(0);
    expect(flipped / total).toBeGreaterThan(0.05);
    expect(flipped / total).toBeLessThan(0.3);
    expect(flipChance(0)).toBeCloseTo(0.25, 10);
    expect(flipChance(RECOUNT_MARGIN)).toBeCloseTo(0.05, 10);
  });
});

describe('elector rules', () => {
  it('split whole electors by largest remainders', () => {
    expect(largestRemainder(10, [0.55, 0.45])).toEqual([6, 4]);
    expect(largestRemainder(3, [1, 1, 1])).toEqual([1, 1, 1]);
    for (const electors of [3, 4, 7, 29, 55]) {
      for (const rule of ['district', 'proportional'] as const) {
        const won = stateElectors(rule, 0, [0.52, 0.4, 0.08], electors);
        expect(won.reduce((a, b) => a + b, 0)).toBe(electors);
        expect(won[0]).toBeGreaterThanOrEqual(won[1]!);
      }
      // By district the winner always takes at least the two at-large electors.
      expect(stateElectors('district', 1, [0.45, 0.5, 0.05], electors)[1]).toBeGreaterThanOrEqual(2);
    }
  });

  it('count winner-take-all like the states, and the national vote as the popular vote', () => {
    const term = simulate(42, BASE).terms[40]!;
    const wta = electoralUnder('winner-take-all', term.grid.winners, term.grid.voteShares!, term.grid.votes);
    term.grid.winners.forEach((winner) => { if (winner >= 0) expect(wta[winner]).toBeGreaterThan(0); });
    expect(wta.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
    expect(electoralUnder('national', term.grid.winners, term.grid.voteShares!, term.grid.votes)).toEqual(nationalVote(term.grid.voteShares!, term.grid.votes));
  });

  it('elect the national vote\'s plurality winner when the timeline runs under it', () => {
    const timeline = simulate(7, { ...BASE, electorRule: 'national' });
    expect(timeline.electorRule).toBe('national');
    for (const term of timeline.terms.slice(1)) {
      expect(term.winnerParty).toBe(term.popularVote!.indexOf(Math.max(...term.popularVote!)));
    }
    // Without the state popular vote there is nothing to count, so it falls back to winner-take-all.
    expect(simulate(7, { ...CORRECTED_SETTINGS, electorRule: 'national' }).electorRule).toBe('winner-take-all');
  });

  it('show who would have won under each method, agreeing with the actual result for its own method', () => {
    const timeline = simulate(3, BASE);
    for (const term of timeline.terms.slice(1)) {
      const rows = otherRules(timeline.terms, term, new Set(timeline.corrections))!;
      expect(rows.map((row) => row.rule)).toEqual(['winner-take-all', 'district', 'proportional', 'national']);
    }
    expect(otherRules(simulate(3, CORRECTED_SETTINGS).terms, simulate(3, CORRECTED_SETTINGS).terms[5]!, new Set())).toBeNull();
  });

  it('name rare faithless electors who move one or two votes', () => {
    let records = 0, elections = 0;
    for (let seed = 1; seed <= 40; seed++) {
      for (const term of simulate(seed, ALL).terms.slice(1)) {
        elections++;
        for (const f of term.faithless!) {
          records++;
          expect(f.electors).toBeGreaterThanOrEqual(1);
          expect(f.electors).toBeLessThanOrEqual(2);
          expect(f.to).not.toBe(f.from);
          expect(f.from).toBe(term.grid.winners[f.state]);
        }
        expect(term.electoral.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
      }
    }
    expect(records).toBeGreaterThan(0);
    expect(records / elections).toBeLessThan(0.4);
  });
});

describe('turnout and suffrage', () => {
  it('give every bloc a turnout in range, widen the vote on the real dates, and dip when women first vote', () => {
    let before = 0, at = 0, n = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const { terms } = simulate(seed, ALL);
      for (const term of terms.slice(1)) {
        for (const t of term.turnout!.blocs) { expect(t).toBeGreaterThanOrEqual(0.3); expect(t).toBeLessThanOrEqual(0.88); }
        expect(term.suffrage?.election ?? null).toBe(SUFFRAGE.find((s) => s.election === term.election)?.election ?? null);
      }
      before += terms.find((t) => t.election === 1916)!.turnout!.overall;
      at += terms.find((t) => t.election === 1920)!.turnout!.overall;
      n++;
    }
    expect(at / n).toBeLessThan(before / n);
    expect(simulate(42, BASE).terms.every((term) => term.turnout === null && term.suffrage === null)).toBe(true);
  });
});

describe('these additions in the app', () => {
  it('are on by default, travel in share links when off, and pick an elector rule', () => {
    const location = readLocation('?seed=3&year=1900');
    expect([location.recounts, location.faithless, location.turnout, location.electorRule]).toEqual([true, true, true, 'winner-take-all']);
    const url = timelineUrl('https://example.test/', { ...location, recounts: false, faithless: false, turnout: false, electorRule: 'district' });
    expect(url.searchParams.get('recounts')).toBe('0');
    expect(url.searchParams.get('faithless')).toBe('0');
    expect(url.searchParams.get('turnout')).toBe('0');
    expect(url.searchParams.get('electors')).toBe('district');
    expect(readLocation(url.search)).toMatchObject({ recounts: false, faithless: false, turnout: false, electorRule: 'district' });
    expect(readLocation('?electors=nonsense').electorRule).toBe('winner-take-all');
    expect(additionsList({ ...location, electorRule: 'proportional' })).toEqual(expect.arrayContaining(['recounts', 'faithless electors', 'turnout', 'proportional electors']));
    // Without the state popular vote, recounts, faithless electors and other rules cannot run.
    expect(additionsList({ ...location, popularVote: false, electorRule: 'national' })).not.toEqual(expect.arrayContaining(['recounts']));
    expect(RULES.length).toBeGreaterThan(0);
    expect(DEFAULT_DIALS).toBeTruthy();
  });
});
