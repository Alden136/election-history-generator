import { describe, expect, it } from 'vitest';
import { CORRECTED_SETTINGS, simulate } from '../src/engine/simulate';
import { rollSuccession, SUCCESSION_MOOD } from '../src/engine/succession';
import { createRng } from '../src/engine/rng';
import { DEFAULT_DIALS } from '../src/engine/data';
import { RULES } from '../src/engine/rules';
import { additionsText, readLocation, successionText, timelineUrl } from '../src/app/presentation';
import { presidencies } from '../src/app/profiles';
import { writeStory } from '../src/app/story';

const ON = { ...CORRECTED_SETTINGS, midterms: true, candidateTraits: true, primaries: true, runningMates: true };

describe('running mates and succession', () => {
  it('are off unless asked for, and need candidate traits', () => {
    for (const settings of [CORRECTED_SETTINGS, { ...CORRECTED_SETTINGS, runningMates: true }]) {
      const timeline = simulate(42, settings);
      expect(timeline.runningMates).toBe(false);
      expect(timeline.terms.every((term) => term.runningMates === null && term.succession === null && term.vicePresident === null)).toBe(true);
    }
    expect(simulate(42, ON).runningMates).toBe(true);
  });

  it('give every nominee a running mate who is not running for anything else', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const { terms } = simulate(seed, ON);
      for (const term of terms.slice(1)) {
        const mates = term.runningMates!;
        expect(mates.map((mate) => mate.party)).toEqual(term.nominees!.map((nominee) => nominee.party));
        const names = [...term.nominees!, ...mates].map((person) => person.name);
        expect(new Set(names).size).toBe(names.length);
        expect(mates.every((mate) => mate.name.length > 0 && !mate.incumbent)).toBe(true);
      }
    }
  });

  it('make the winning running mate vice president, who takes over when the president leaves', () => {
    let successions = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const { terms } = simulate(seed, ON);
      for (let i = 2; i < terms.length; i++) {
        const term = terms[i]!, prev = terms[i - 1]!;
        expect(term.vicePresident).toBe(prev.runningMates!.find((mate) => mate.party === prev.winnerParty)!.name);
        const s = term.succession;
        if (!s) continue;
        successions++;
        expect(s.president).toBe(term.president);
        expect(s.successor).toBe(term.vicePresident);
        expect(s.party).toBe(term.potusParty);
        expect(s.year).toBeGreaterThan(term.termBegan);
        expect(s.year).toBeLessThan(term.termBegan + 4);
        // The successor is the sitting president at the election: when they run, they run as the incumbent.
        const incumbent = term.nominees!.find((nominee) => nominee.incumbent);
        if (incumbent) expect(incumbent.name).toBe(s.successor);
      }
    }
    expect(successions).toBeGreaterThan(0);
  });

  it('happen more in chaos and after a scandal, and never after a quiet term but by death', () => {
    const odds = (descriptor: string, experience = 0) => {
      const ctx = { rng: createRng(7), dials: DEFAULT_DIALS };
      const counts: Record<string, number> = {};
      for (let i = 0; i < 20000; i++) {
        const s = rollSuccession({ termBegan: 1901, president: 'A', party: 0, experience, vicePresident: 'B', descriptor }, ctx);
        if (s) counts[s.cause] = (counts[s.cause] ?? 0) + 1;
      }
      return counts;
    };
    const quiet = odds('Economic Boom');
    expect(quiet.resignation).toBeUndefined();
    expect(quiet.death! / 20000).toBeCloseTo(0.05, 1);
    expect(odds('Economic Boom', 2).death!).toBeGreaterThan(quiet.death!);
    expect(odds('Chaos').assassination!).toBeGreaterThan(2 * quiet.assassination!);
    expect(odds('Scandal').resignation! / 20000).toBeCloseTo(0.15, 1);
  });

  it('move election-day approval: sympathy after a death, a hit after a resignation', () => {
    expect(SUCCESSION_MOOD.assassination).toBeGreaterThan(SUCCESSION_MOOD.death);
    expect(SUCCESSION_MOOD.death).toBeGreaterThan(0);
    expect(SUCCESSION_MOOD.resignation).toBeLessThan(0);
  });
});

describe('running mates and succession in the app', () => {
  const findSuccession = () => {
    for (let seed = 1; seed <= 50; seed++) {
      const timeline = simulate(seed, ON);
      const term = timeline.terms.find((t) => t.succession);
      if (term) return { timeline, term, s: term.succession! };
    }
    throw new Error('no succession found');
  };

  it('list the successor as their own presidency from the year they took over', () => {
    const { timeline, s } = findSuccession();
    const list = presidencies(timeline.terms, timeline.finalPresident);
    const left = list.find((p) => p.left?.year === s.year && p.name === s.president)!;
    const took = list[left.number]!;
    expect(left.to).toBe(s.year);
    expect(took).toMatchObject({ name: s.successor, from: s.year, tookOver: { from: s.president, cause: s.cause } });
    expect(took.terms[0]!.electedIn).toBeNull();
    // Numbers still run in order with no gaps.
    expect(list.map((p) => p.number)).toEqual(list.map((_, i) => i + 1));
  });

  it('tell the story of each succession', () => {
    const { timeline, s } = findSuccession();
    const story = writeStory(timeline, 'the Corrected rules');
    const text = story.chapters.flatMap((c) => c.paragraphs).join(' ');
    expect(text).toContain(`${s.successor}`);
    expect(text).toContain(String(s.year));
    expect(successionText(s)).toContain(`${s.successor} took over`);
  });

  it('are on by default and travel in share links as vp=0 when off', () => {
    expect(readLocation('?seed=3&year=1900').runningMates).toBe(true);
    const base = { seed: 3, year: 1900, corrections: RULES, dials: DEFAULT_DIALS, midterms: true, traits: true, primaries: true, popularVote: true, spoilers: true, recounts: true, faithless: true, turnout: true, electorRule: 'winner-take-all' as const };
    const off = timelineUrl('https://example.test/', { ...base, runningMates: false });
    expect(off.searchParams.get('vp')).toBe('0');
    expect(readLocation(off.search).runningMates).toBe(false);
    expect(timelineUrl(off.href, { ...base, runningMates: true }).searchParams.has('vp')).toBe(false);
    expect(additionsText(false, true, true, true)).toBe('candidate traits, primaries and running mates');
  });
});
