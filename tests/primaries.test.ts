import { describe, expect, it } from 'vitest';
import { P } from '../src/engine/data';
import {
  DRAG_LOST, DRAG_WON, FIGHT_COST, fightOf, moderateChance, nomineePosition, partyAfterPrimaries, supportAfterPrimaries, wingPositions,
  type Primary,
} from '../src/engine/primaries';
import { CORRECTED_SETTINGS, simulate } from '../src/engine/simulate';
import { DEFAULT_DIALS } from '../src/engine/data';
import { RULES } from '../src/engine/rules';
import { additionsText, readLocation, timelineUrl } from '../src/app/presentation';

const ON = { ...CORRECTED_SETTINGS, midterms: true, candidateTraits: true, primaries: true };

describe('primaries', () => {
  it('are off unless asked for, and need candidate traits', () => {
    for (const settings of [CORRECTED_SETTINGS, { ...CORRECTED_SETTINGS, primaries: true }]) {
      const timeline = simulate(42, settings);
      expect(timeline.primaries).toBe(false);
      expect(timeline.terms.every((term) => term.primaries === null)).toBe(true);
    }
    expect(simulate(42, ON).primaries).toBe(true);
  });

  it('give every named party with support one primary, and its winner is the nominee', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const { terms } = simulate(seed, ON);
      expect(terms[0]!.primaries).toBeNull();
      for (const term of terms.slice(1)) {
        const primaries = term.primaries!;
        const named = term.nominees!.map((n) => n.party).filter((party) => party !== P.THIRD);
        expect(primaries.map((p) => p.party)).toEqual(named);
        for (const primary of primaries) {
          const winner = primary.contenders[primary.winner]!;
          const nominee = term.nominees!.find((n) => n.party === primary.party)!;
          expect(nominee.name).toBe(winner.name);
          expect(nominee.incumbent).toBe(winner.incumbent);
          expect(primary.share).toBeGreaterThanOrEqual(0.5);
          expect(primary.cost).toBe(FIGHT_COST[primary.fight]);
          expect(primary.contenders.length).toBe(primary.fight === 'unopposed' ? 1 : 2);
          // Voters see the position the nominee ran on.
          expect(term.shownIdeology[primary.party]).toBe(winner.position);
        }
        // Nobody runs twice in one year.
        const names = primaries.flatMap((p) => p.contenders.map((c) => c.name));
        const third = term.nominees!.find((n) => n.party === P.THIRD)?.name;
        const all = third ? [...names, third] : names;
        expect(new Set(all).size).toBe(all.length);
      }
    }
  });

  it('place the moderate between the party and the centre, and the ideologue further out', () => {
    for (const [ideology, center] of [[4, 0], [-6, 1], [9.5, -1], [0, 0], [-10, 2]] as const) {
      const { moderate, ideologue } = wingPositions(ideology, center);
      expect(Math.abs(moderate - center)).toBeLessThanOrEqual(Math.abs(ideology - center));
      expect(Math.abs(ideologue - center)).toBeGreaterThanOrEqual(Math.abs(ideology - center));
      expect(Math.abs(ideologue - ideology)).toBeLessThanOrEqual(3);
      for (const position of [moderate, ideologue]) expect(Math.abs(position)).toBeLessThanOrEqual(10);
    }
    expect(wingPositions(4, 0)).toEqual({ moderate: 2, ideologue: 6.5 });
  });

  it('tilt the odds by charisma and experience, within 15% to 85%', () => {
    expect(moderateChance({ charisma: 0, experience: 1 }, { charisma: 0, experience: 1 })).toBe(0.5);
    expect(moderateChance({ charisma: 2, experience: 1 }, { charisma: 0, experience: 1 })).toBeCloseTo(0.66, 10);
    expect(moderateChance({ charisma: 2, experience: 2 }, { charisma: -2, experience: 0 })).toBe(0.85);
    expect(moderateChance({ charisma: -2, experience: 0 }, { charisma: 2, experience: 2 })).toBe(0.15);
  });

  it('call a close fight between distant wings bitter, and charge for it', () => {
    expect(fightOf(0.52, 4)).toBe('bitter');
    expect(fightOf(0.52, 1)).toBe('contested');
    expect(fightOf(0.6, 4)).toBe('contested');
    expect(fightOf(0.7, 4)).toBe('easy');
    const primary = (party: number, fight: Primary['fight']): Primary => ({ party, contenders: [], winner: 0, share: 0.5, fight, cost: FIGHT_COST[fight] });
    const after = supportAfterPrimaries([0.5, 0.5], [primary(0, 'bitter'), primary(1, 'easy')]);
    expect(after.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
    expect(after[0]).toBeLessThan(0.5);
  });

  it('let a winning president govern from the position they ran on', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { terms } = simulate(seed, ON);
      for (let i = 1; i < terms.length - 1; i++) {
        const position = nomineePosition(terms[i]!.primaries, terms[i]!.winnerParty);
        if (position !== undefined) expect(terms[i + 1]!.potusIdeology).toBe(position);
      }
    }
  });

  it('pull a party toward its nominee: further when they won', () => {
    const primaries: Primary[] = [0, 1].map((party) => ({
      party, winner: 0, share: 0.6, fight: 'contested', cost: FIGHT_COST.contested,
      contenders: [{ name: String(party), home: null, charisma: 0, experience: 0, position: 4, wing: 'ideologue', incumbent: false }],
    }));
    const after = partyAfterPrimaries([2, 2, 5], [2, 2, 5], primaries, 0);
    expect(after).toEqual([2 + DRAG_WON * 2, 2 + DRAG_LOST * 2, 5]);
  });

  it('sometimes deny a struggling president renomination', () => {
    let challenged = 0, beaten = 0;
    for (let seed = 1; seed <= 150; seed++) {
      for (const term of simulate(seed, ON).terms.slice(1)) {
        const primary = term.primaries!.find((p) => p.contenders.some((c) => c.incumbent));
        if (!primary || primary.fight === 'unopposed') continue;
        challenged++;
        expect(term.performance).toBeLessThan(0);
        if (!primary.contenders[primary.winner]!.incumbent) beaten++;
      }
    }
    expect(challenged).toBeGreaterThan(0);
    expect(beaten).toBeGreaterThan(0);
    expect(beaten).toBeLessThan(challenged / 2);
  });
});

describe('primaries in the app', () => {
  it('are on by default, travel in share links as primaries=0 when off, and count only with traits', () => {
    expect(readLocation('?seed=3&year=1900').primaries).toBe(true);
    const base = { seed: 3, year: 1900, corrections: RULES, dials: DEFAULT_DIALS, midterms: true, traits: true };
    const off = timelineUrl('https://example.test/', { ...base, primaries: false });
    expect(off.searchParams.get('primaries')).toBe('0');
    expect(readLocation(off.search).primaries).toBe(false);
    expect(timelineUrl(off.href, { ...base, primaries: true }).searchParams.has('primaries')).toBe(false);
    expect(additionsText(true, true, true)).toBe('midterm elections, candidate traits and primaries');
    expect(additionsText(true, false, true)).toBe('midterm elections');
    expect(additionsText(false, true, true)).toBe('candidate traits and primaries');
  });
});
