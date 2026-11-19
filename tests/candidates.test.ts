import { describe, expect, it } from 'vitest';
import { CANDIDATE_HOMES, CANDIDATES, DEFAULT_DIALS, STATES } from '../src/engine/data';
import { supportWithNominees, traitsFor } from '../src/engine/candidates';
import { RULES } from '../src/engine/rules';
import { CORRECTED_SETTINGS, DEFAULT_SETTINGS, simulate } from '../src/engine/simulate';
import { readLocation, timelineUrl, traitEffects } from '../src/app/presentation';

const ON = { ...CORRECTED_SETTINGS, midterms: true, candidateTraits: true };

describe('candidate traits', () => {
  it('are off unless asked for', () => {
    for (const settings of [DEFAULT_SETTINGS, CORRECTED_SETTINGS]) {
      const timeline = simulate(42, settings);
      expect(timeline.candidateTraits).toBe(false);
      expect(timeline.terms.every((term) => term.nominees === null)).toBe(true);
    }
  });

  it('give every party with support its own nominee, and the winner is the winning party\'s', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const { terms, candidateTraits } = simulate(seed, ON);
      expect(candidateTraits).toBe(true);
      expect(terms[0]!.nominees).toBeNull();
      for (const term of terms.slice(1)) {
        const nominees = term.nominees!;
        const supported = term.support.flatMap((share, party) => (share > 0 ? [party] : []));
        expect(nominees.map((n) => n.party)).toEqual(supported);
        expect(new Set(nominees.map((n) => n.name)).size).toBe(nominees.length);
        expect(nominees.every((n) => n.name.length > 0)).toBe(true);
        expect(nominees.find((n) => n.party === term.winnerParty)!.name).toBe(term.winnerName);
        for (const n of nominees) expect(n.home).toBe(CANDIDATE_HOMES[n.name] ?? null);
      }
    }
  });

  it('keep one person\'s traits the same throughout a timeline', () => {
    const { terms } = simulate(5, ON);
    const seen = new Map<string, number>();
    for (const n of terms.flatMap((term) => term.nominees ?? [])) {
      const rolled = traitsFor(5, n.name);
      expect(n.charisma).toBe(rolled.charisma);
      // A sitting president running again counts as a veteran.
      expect(n.experience).toBe(n.incumbent ? 2 : rolled.experience);
      expect(seen.get(n.name) ?? n.charisma).toBe(n.charisma);
      seen.set(n.name, n.charisma);
    }
    // Different timelines roll different traits for the same person.
    const rolls = new Set(Array.from({ length: 50 }, (_, seed) => JSON.stringify(traitsFor(seed, 'Abraham Lincoln'))));
    expect(rolls.size).toBeGreaterThan(5);
  });

  it('move support between parties without changing the total', () => {
    const support = [0.4, 0.35, 0, 0.25];
    const nominees = [
      { party: 0, name: 'A', home: null, charisma: 2, experience: 2, incumbent: true },
      { party: 1, name: 'B', home: null, charisma: -2, experience: 0, incumbent: false },
      { party: 3, name: 'C', home: null, charisma: 0, experience: 1, incumbent: false },
    ];
    const after = supportWithNominees(support, nominees);
    expect(after.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
    expect(after[0]).toBeGreaterThan(0.4);
    expect(after[1]).toBeLessThan(0.35);
    expect(after[2]).toBe(0);
  });

  it('help a nominee carry their home state', () => {
    let home = 0, homeWins = 0, expected = 0;
    for (let seed = 1; seed <= 60; seed++) {
      for (const term of simulate(seed, ON).terms.slice(1)) {
        const voting = term.grid.winners.filter((w) => w >= 0).length;
        if (!voting) continue;
        for (const n of term.nominees!) {
          const i = STATES.findIndex((s) => s.code === n.home);
          if (i < 0 || term.grid.votes[i] === 0 || term.grid.winners[i]! < 0) continue;
          home++;
          if (term.grid.winners[i] === n.party) homeWins++;
          expected += term.grid.winners.filter((w) => w === n.party).length / voting;
        }
      }
    }
    expect(homeWins / home).toBeGreaterThan(expected / home + 0.05);
  });

  it('have real home states for listed candidates only', () => {
    const listed = new Set(['George Washington', ...Object.values(CANDIDATES).flat()]);
    const codes = new Set(STATES.map((s) => s.code));
    for (const [name, code] of Object.entries(CANDIDATE_HOMES)) {
      expect(listed.has(name), name).toBe(true);
      expect(codes.has(code!), `${name}: ${code}`).toBe(true);
    }
  });

  it('are on in the app by default, and travel in share links as traits=0 when off', () => {
    expect(readLocation('?seed=3&year=1900').traits).toBe(true);
    const base = { seed: 3, year: 1900, corrections: RULES, dials: DEFAULT_DIALS, midterms: true, primaries: true, runningMates: true, popularVote: true };
    const off = timelineUrl('https://example.test/', { ...base, traits: false });
    expect(off.searchParams.get('traits')).toBe('0');
    expect(readLocation(off.search).traits).toBe(false);
    expect(timelineUrl(off.href, { ...base, traits: true }).searchParams.has('traits')).toBe(false);
  });

  it('explain what each trait does, for the pop-ups on the trait tags', () => {
    const wooden = traitEffects({ party: 1, name: 'A', home: 'OH', charisma: -2, experience: 2, incumbent: true });
    expect(wooden.map((t) => t.label)).toEqual(['From Ohio', 'Wooden', 'Veteran', 'Incumbent']);
    expect(wooden[0]!.effect).toBe('Home state. Ohio leans 2 points toward their party.');
    expect(wooden[1]!.effect).toContain('Lowers their party\x27s national support by 5%');
    expect(wooden[2]!.effect).toContain('Raises their party\x27s national support by 3%');
    expect(wooden[3]!.effect).toContain('by 4%');
    const steady = traitEffects({ party: 1, name: 'B', home: null, charisma: 0, experience: 0, incumbent: false });
    expect(steady.map((t) => t.label)).toEqual(['Steady', 'Newcomer']);
    expect(steady.every((t) => t.effect.includes('No effect on support'))).toBe(true);
  });
});
