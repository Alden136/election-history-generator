import { describe, expect, it } from 'vitest';
import candidates from '../data/candidates.json';
import dials from '../data/dials.json';
import electionData from '../data/elections.json';
import initial from '../data/initial-state.json';
import parties from '../data/parties.json';
import states from '../data/states.json';

describe('extracted sheet data', () => {
  it('has 69 elections from 1792 to 2064', () => {
    expect(electionData.elections).toHaveLength(69);
    expect(electionData.elections[0]).toBe(1792);
    expect(electionData.elections.at(-1)).toBe(2064);
  });

  it('has 14 named parties plus Third Party, two of them present in 1792', () => {
    expect(parties).toHaveLength(15);
    expect(parties.at(-1)?.name).toBe('Third Party');
    expect(parties.filter((p) => p.existsAtStart).map((p) => p.name)).toEqual([
      'Federalist',
      'J. Republican',
    ]);
    for (const p of parties.slice(0, 14)) {
      expect(p.startIdeology).toBeGreaterThanOrEqual(-10);
      expect(p.startIdeology).toBeLessThanOrEqual(10);
    }
  });

  it('has a candidate for every election after 1792 in every ideology band', () => {
    expect(candidates.bands).toHaveLength(10);
    expect(candidates.bands[0]).toEqual({ min: -10, max: -8 });
    expect(candidates.bands.at(-1)).toEqual({ min: 8, max: 10 });
    const byElection: Record<string, string[]> = candidates.byElection;
    for (const election of electionData.elections.slice(1)) {
      const names = byElection[election];
      expect(names, `election ${election}`).toHaveLength(10);
      for (const name of names ?? []) expect(name.length).toBeGreaterThan(0);
    }
    // Spot checks against values read from the live sheet.
    expect(byElection['1796']?.[0]).toBe('Thomas Jefferson');
    expect(byElection['1796']?.[9]).toBe('Alexander Hamilton');
  });

  it('has 64 states with unique codes and map tiles', () => {
    expect(states).toHaveLength(64);
    expect(new Set(states.map((s) => s.code)).size).toBe(64);
    const tiles = new Set(states.map((s) => `${s.tile.col},${s.tile.row}`));
    expect(tiles.size).toBe(64);
    for (const s of states) {
      expect(s.tile.col).toBeGreaterThanOrEqual(0);
      expect(s.tile.col).toBeLessThan(11);
      expect(s.tile.row).toBeGreaterThanOrEqual(0);
      expect(s.tile.row).toBeLessThan(9);
      expect([null, 'NORTH', 'SOUTH']).toContain(s.region);
    }
  });

  it('starts with the 16 states of 1796 and their electoral votes', () => {
    const original = states.filter((s) => s.electoralVotes1796 !== null);
    expect(original).toHaveLength(16);
    expect(original.reduce((sum, s) => sum + (s.electoralVotes1796 ?? 0), 0)).toBe(138);
    expect(states.find((s) => s.code === 'VA')?.electoralVotes1796).toBe(21);
  });

  it('gives every state real-life electoral votes through 2064 once it has any', () => {
    for (const s of states) {
      const votes: Record<string, number | undefined> = s.realElectoralVotes;
      const years = Object.keys(votes).map(Number);
      expect(years.length, s.code).toBeGreaterThan(0);
      expect(Math.max(...years), s.code).toBe(2064);
      // No gaps: once a state appears it has a value every four years.
      expect(years.length, s.code).toBe((2064 - Math.min(...years)) / 4 + 1);
    }
    const ca: Record<string, number | undefined> = states.find((s) => s.code === 'CA')!.realElectoralVotes;
    expect(Object.keys(ca)[0]).toBe('1852');
  });

  it('has the dials the sheet author set', () => {
    expect(dials).toEqual({
      partyLoyalty: 0.5,
      secessionThreshold: 8,
      partyVictoryBoost: 15,
      crisisBacklash: 5,
      potusBacklash: 0.5,
      blocSizeMultiplier: 30,
    });
  });

  it('has seven ideology blocs and a 15-seat court with six seats filled', () => {
    expect(initial.blocs.map((b) => b.name)).toEqual([
      'Revolutionary',
      'Progressive',
      'Liberal',
      'Moderate',
      'Conservative',
      'Nationalist',
      'Authoritarian',
    ]);
    expect(initial.blocs.map((b) => b.startSize)).toEqual([2, 30, 200, 200, 200, 30, 2]);
    expect(initial.court).toHaveLength(15);
    expect(initial.court.filter((seat) => seat !== null)).toHaveLength(6);
  });
});
