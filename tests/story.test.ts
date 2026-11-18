import { describe, expect, it } from 'vitest';
import { partyName, PARTIES } from '../src/engine/data';
import { CORRECTED_SETTINGS, DEFAULT_SETTINGS, simulate } from '../src/engine/simulate';
import { SECEDED } from '../src/engine/types';
import { chapterFacts, list, storyText, writeStory } from '../src/app/story';

const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);

describe('written history', () => {
  it('states only facts the timeline shows, for 20 seeds under both rule sets', () => {
    for (const settings of [DEFAULT_SETTINGS, CORRECTED_SETTINGS]) {
      for (const seed of SEEDS) {
        const timeline = simulate(seed, settings);
        const { terms, finalPresident } = timeline;
        const served = [...terms.map((t) => ({ began: t.termBegan, president: t.president, party: t.potusParty, event: t.descriptor })),
          { began: finalPresident.termBegan, president: finalPresident.name, party: finalPresident.party, event: finalPresident.descriptor }];
        const story = writeStory(timeline, 'test rules');
        expect(story.chapters).toHaveLength(7);
        story.chapters.forEach((chapter, c) => {
          const facts = chapterFacts(timeline, c);
          const inside = served.filter((t) => t.began >= facts.from && t.began < facts.to);
          expect(inside).toHaveLength(10);
          // Who governed.
          expect(facts.partyYears.reduce((total, p) => total + p.years, 0)).toBe(40);
          for (const { party, years } of facts.partyYears) expect(inside.filter((t) => t.party === party).length * 4).toBe(years);
          for (const term of inside) expect(facts.presidents.some((p) => p.name === term.president)).toBe(true);
          // Elections: each one put a president of this chapter in office.
          const rows = terms.filter((t) => t.election >= facts.from - 1 && t.election < facts.to - 1);
          expect(facts.elections).toEqual(rows.map((t) => t.election));
          for (const year of facts.changes) expect(terms.find((t) => t.election === year)!.result).toBe('LOSS');
          for (const year of facts.contingent) expect(Math.max(...terms.find((t) => t.election === year)!.electoral)).toBeLessThanOrEqual(0.5);
          if (facts.landslide) expect(terms.find((t) => t.election === facts.landslide!.election)!.winnerName).toBe(facts.landslide.name);
          // Parties rising and falling.
          for (const { party, election } of facts.rose) {
            expect(terms.find((t) => t.support[party]! > 0)!.election).toBe(election);
          }
          for (const { party, election } of facts.fell) {
            expect([...terms].reverse().find((t) => t.support[party]! > 0)!.election).toBe(election);
            expect(terms.some((t) => t.election > election && t.support[party]! > 0)).toBe(false);
          }
          // Upheavals.
          expect(facts.civilWars.map((w) => w.began)).toEqual(inside.filter((t) => t.event === 'Civil War').map((t) => t.began));
          expect(facts.chaos.map((w) => w.began)).toEqual(inside.filter((t) => t.event === 'Chaos').map((t) => t.began));
          expect(facts.dictatorships.reduce((total, d) => total + (d.to - d.from) / 4, 0))
            .toBe(inside.filter((t) => t.event === 'DICTATORSHIP').length);
          if (facts.secession) {
            const row = terms.find((t) => t.election === facts.secession!.election)!;
            expect(row.grid.winners.filter((w) => w === SECEDED).length).toBe(facts.secession.states);
            for (const r of rows) expect(r.grid.winners.filter((w) => w === SECEDED).length).toBeLessThanOrEqual(facts.secession.states);
          } else {
            for (const r of rows) expect(r.grid.winners.includes(SECEDED)).toBe(false);
          }
          for (const change of facts.territory) {
            const row = terms.find((t) => t.election === change.election)!;
            const before = terms[row.index - 1]!;
            for (const t of change.joined) expect([before.grid.expansions[t], row.grid.expansions[t]]).toEqual([false, true]);
            for (const t of change.left) expect([before.grid.expansions[t], row.grid.expansions[t]]).toEqual([true, false]);
          }
          // Every sentence is written out in full, and names only parties that appear in this chapter's facts.
          const text = chapter.paragraphs.join(' ');
          expect(text).not.toMatch(/undefined|NaN|null|\[object/);
          const named = new Set([...facts.partyYears.map((p) => p.party), ...facts.presidents.flatMap((p) => p.parties), ...facts.rose.map((r) => r.party),
            ...facts.fell.map((f) => f.party), ...facts.dictatorships.map((d) => d.party),
            ...[facts.landslide?.party, facts.closest?.party].filter((p): p is number => p !== undefined)]);
          PARTIES.forEach((_, p) => {
            // "Third Party" can only be matched as a whole name; other names are distinct words.
            if (!named.has(p) && new RegExp(`\\b${partyName(p).replace('.', '\\.')}\\b`).test(text)) {
              throw new Error(`Seed ${seed}, chapter ${c}: mentions ${partyName(p)} without a fact for it`);
            }
          });
        });
        // The same seed always gives the same story.
        expect(storyText(writeStory(simulate(seed, settings), 'test rules'), 'x')).toBe(storyText(story, 'x'));
      }
    }
  });

  it('joins lists in plain English', () => {
    expect(list([])).toBe('');
    expect(list(['A'])).toBe('A');
    expect(list(['A', 'B'])).toBe('A and B');
    expect(list(['A', 'B', 'C'])).toBe('A, B and C');
  });
});
