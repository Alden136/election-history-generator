import { describe, expect, it } from 'vitest';
import { DEFAULT_DIALS } from '../src/engine/data';
import { RULES } from '../src/engine/rules';
import type { TimelineLocation } from '../src/app/presentation';
import {
  addSaved, describeSaved, loadSaved, locationOf, removeSaved, SAVED_KEY, sameTimeline, writeSaved,
} from '../src/app/saved';

function memoryStore(initial?: string) {
  const data = new Map<string, string>(initial === undefined ? [] : [[SAVED_KEY, initial]]);
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value) };
}

const corrected: TimelineLocation = { seed: 42, year: 2024, corrections: RULES, dials: DEFAULT_DIALS, midterms: false, traits: false, primaries: false, runningMates: false, popularVote: false };
const custom: TimelineLocation = {
  seed: 7, year: 1860, corrections: RULES.slice(0, 3), dials: { ...DEFAULT_DIALS, partyLoyalty: 0.8, potusBacklash: 0.73 }, midterms: true, traits: true, primaries: true, runningMates: true, popularVote: true,
};

describe('saved timelines', () => {
  it('saves, reads back and deletes', () => {
    const store = memoryStore();
    let list = addSaved([], 'Civil war timeline', custom, 1000);
    list = addSaved(list, '   ', corrected, 2000);
    expect(writeSaved(list, store)).toBe(true);

    const loaded = loadSaved(store);
    expect(loaded.map((item) => item.name)).toEqual(['Seed 42 · 2024', 'Civil war timeline']);
    expect(locationOf(loaded[1]!)).toEqual(custom);
    expect(locationOf(loaded[0]!)).toEqual(corrected);
    expect(describeSaved(loaded[1]!)).toBe('Seed 7 · 1860 · Custom · Midterms · Traits · Primaries · Running mates · State vote · 2 dials adjusted');
    expect(describeSaved(loaded[0]!)).toBe('Seed 42 · 2024 · Corrected');

    const left = removeSaved(loaded, loaded[0]!.id);
    expect(left.map((item) => item.name)).toEqual(['Civil war timeline']);
  });

  it('ignores missing, broken or foreign data', () => {
    expect(loadSaved(memoryStore())).toEqual([]);
    expect(loadSaved(memoryStore('not json'))).toEqual([]);
    expect(loadSaved(memoryStore('{"a":1}'))).toEqual([]);
    expect(loadSaved(memoryStore('[{"id":"x","name":"ok","savedAt":1,"query":"?seed=3"},{"id":2}]')).map((item) => item.name)).toEqual(['ok']);
    expect(loadSaved(null)).toEqual([]);
  });

  it('reports when the browser refuses to store', () => {
    const refusing = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); } };
    expect(writeSaved([], refusing)).toBe(false);
    expect(writeSaved([], null)).toBe(false);
  });

  it('matches the timeline on screen whatever the year', () => {
    const [saved] = addSaved([], 'x', custom);
    expect(sameTimeline(saved!, { ...custom, year: 2064 })).toBe(true);
    expect(sameTimeline(saved!, { ...custom, seed: 8 })).toBe(false);
    expect(sameTimeline(saved!, corrected)).toBe(false);
  });

  it('cuts long names', () => {
    const [saved] = addSaved([], 'x'.repeat(200), corrected);
    expect(saved!.name).toHaveLength(60);
  });
});
