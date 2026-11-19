import { describe, expect, it } from 'vitest';
import { DEFAULT_DIALS, P } from '../src/engine/data';
import { createRng } from '../src/engine/rng';
import { RULES } from '../src/engine/rules';
import { CORRECTED_SETTINGS, simulate } from '../src/engine/simulate';
import { findSpoiler, SPOILER_MIN_DISTANCE, SPOILER_MIN_SUPPORT, supportWithSpoiler } from '../src/engine/spoilers';
import type { Primary } from '../src/engine/primaries';
import { additionsText, readLocation, timelineUrl } from '../src/app/presentation';
import { writeStory } from '../src/app/story';

const ON = { ...CORRECTED_SETTINGS, midterms: true, candidateTraits: true, primaries: true, runningMates: true, popularVote: true, spoilers: true };

const contender = (name: string, position: number, wing: 'moderate' | 'ideologue') =>
  ({ name, home: null, charisma: 0, experience: 1, position, wing, incumbent: false });
const bitter = (party: number, apart: number): Primary => ({
  party, winner: 0, share: 0.52, fight: 'bitter', cost: 0.06,
  contenders: [contender('Winner', 1, 'moderate'), contender('Loser', 1 + apart, 'ideologue')],
});

describe('spoiler candidates', () => {
  it('are off unless asked for, and need primaries', () => {
    for (const settings of [CORRECTED_SETTINGS, { ...CORRECTED_SETTINGS, candidateTraits: true, spoilers: true }]) {
      const timeline = simulate(42, settings);
      expect(timeline.spoilers).toBe(false);
      expect(timeline.terms.every((term) => term.spoiler === null)).toBe(true);
    }
    expect(simulate(42, ON).spoilers).toBe(true);
  });

  it('only come out of a bitter primary in a big party with wings far apart', () => {
    const ctx = () => ({ rng: createRng(1), dials: DEFAULT_DIALS });
    const support = [0.5, 0.1, ...new Array<number>(12).fill(0), 0.4];
    let bolted = 0;
    for (let i = 0; i < 400; i++) {
      const c = { rng: createRng(i), dials: DEFAULT_DIALS };
      if (findSpoiler([bitter(0, SPOILER_MIN_DISTANCE + 1)], support, c)) bolted++;
    }
    expect(bolted).toBeGreaterThan(0);
    expect(bolted).toBeLessThan(400 * 0.4);
    // Too close together, too small a party, or not bitter: never.
    for (let i = 0; i < 200; i++) {
      expect(findSpoiler([bitter(0, SPOILER_MIN_DISTANCE - 1)], support, ctx())).toBeNull();
      expect(findSpoiler([bitter(1, SPOILER_MIN_DISTANCE + 1)], support, ctx())).toBeNull();
      expect(findSpoiler([{ ...bitter(0, 5), fight: 'contested' }], support, ctx())).toBeNull();
    }
    expect(support[1]).toBeLessThan(SPOILER_MIN_SUPPORT);
  });

  it('move support from the old party to the Third Party without changing the total', () => {
    const support = [0.5, 0.3, ...new Array<number>(12).fill(0), 0.2];
    const after = supportWithSpoiler(support, { party: 0, name: 'X', position: 5, share: 0.4, wasIncumbent: false });
    expect(after[0]).toBeCloseTo(0.3, 10);
    expect(after[P.THIRD]).toBeCloseTo(0.4, 10);
    expect(after.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
  });

  it('run as the Third Party\'s candidate on their own position, and stay rare', () => {
    let elections = 0, spoilers = 0;
    for (let seed = 1; seed <= 120; seed++) {
      for (const term of simulate(seed, ON).terms.slice(1)) {
        elections++;
        const s = term.spoiler;
        if (!s) continue;
        spoilers++;
        const primary = term.primaries!.find((p) => p.party === s.party)!;
        expect(primary.fight).toBe('bitter');
        expect(primary.contenders[1 - primary.winner]!.name).toBe(s.name);
        expect(term.nominees!.find((n) => n.party === P.THIRD)!.name).toBe(s.name);
        expect(term.shownIdeology[P.THIRD]).toBe(s.position);
        // Nobody is on two tickets.
        const names = [...term.nominees!, ...(term.runningMates ?? [])].map((n) => n.name);
        expect(new Set(names).size).toBe(names.length);
      }
    }
    expect(spoilers).toBeGreaterThan(0);
    // Rare: about one election in 25.
    expect(spoilers / elections).toBeLessThan(0.07);
  });

  it('show up in the story and travel in share links as spoilers=0 when off', () => {
    const timeline = Array.from({ length: 40 }, (_, seed) => simulate(seed + 1, ON)).find((t) => t.terms.some((term) => term.spoiler))!;
    const s = timeline.terms.find((term) => term.spoiler)!.spoiler!;
    const text = writeStory(timeline, 'the Corrected rules').chapters.flatMap((c) => c.paragraphs).join(' ');
    expect(text).toContain(`${s.name} lost the`);
    expect(readLocation('?seed=3&year=1900').spoilers).toBe(true);
    const base = { seed: 3, year: 1900, corrections: RULES, dials: DEFAULT_DIALS, midterms: true, traits: true, primaries: true, runningMates: true, popularVote: true };
    const off = timelineUrl('https://example.test/', { ...base, spoilers: false });
    expect(off.searchParams.get('spoilers')).toBe('0');
    expect(readLocation(off.search).spoilers).toBe(false);
    expect(additionsText(false, true, true, false, false, true)).toBe('candidate traits, primaries and spoiler candidates');
    expect(additionsText(false, true, false, false, false, true)).toBe('candidate traits');
  });
});
