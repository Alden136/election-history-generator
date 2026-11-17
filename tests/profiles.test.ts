import { describe, expect, it } from 'vitest';
import { PARTIES } from '../src/engine/data';
import { CORRECTED_SETTINGS, DEFAULT_SETTINGS, simulate } from '../src/engine/simulate';
import { ordinal, partyProfiles, presidencies, presidencyAt } from '../src/app/profiles';

describe('presidents and parties', () => {
  it('numbers presidencies and merges consecutive terms', () => {
    const { terms, finalPresident } = simulate(42, CORRECTED_SETTINGS);
    const list = presidencies(terms, finalPresident);
    expect(list[0]).toMatchObject({ number: 1, name: 'George Washington', from: 1789, to: 1797 });
    expect(list[0]!.terms.map((term) => term.electedIn)).toEqual([null, 1792]);
    expect(list.at(-1)).toMatchObject({ name: finalPresident.name, to: 2069, last: true });
    expect(list.at(-1)!.terms.at(-1)).toMatchObject({ began: 2065, dayOneApproval: null, electedIn: 2064 });
  });

  it('agrees with the timeline for every president and party', () => {
    for (const settings of [DEFAULT_SETTINGS, CORRECTED_SETTINGS]) {
      for (let seed = 1; seed <= 40; seed++) {
        const { terms, finalPresident } = simulate(seed, settings);
        const list = presidencies(terms, finalPresident);
        // Every term, plus the 2065 term, belongs to exactly one presidency, in order.
        expect(list.flatMap((p) => p.terms.map((t) => t.began))).toEqual([...terms.map((t) => t.termBegan), finalPresident.termBegan]);
        list.forEach((p, i) => {
          expect(p.number).toBe(i + 1);
          if (i > 0) expect(list[i - 1]!.name).not.toBe(p.name);
          expect(p.to).toBe(p.terms.at(-1)!.began + 4);
          for (const n of p.alsoServed) expect(list[n - 1]!.name).toBe(p.name);
        });
        for (const term of terms) expect(presidencyAt(list, term.termBegan)!.name).toBe(term.president);

        const profiles = partyProfiles(terms, list, PARTIES.length);
        const byParty = new Map(profiles.map((p) => [p.party, p]));
        // Every party that won a state, an election or the presidency has an entry.
        for (const term of terms) {
          for (const winner of term.grid.winners) if (winner >= 0) expect(byParty.has(winner)).toBe(true);
          expect(byParty.has(term.winnerParty)).toBe(true);
          expect(byParty.has(term.potusParty)).toBe(true);
        }
        expect(byParty.has(finalPresident.party)).toBe(true);
        expect(profiles.reduce((total, p) => total + p.wins.length, 0)).toBe(terms.length);
        expect(profiles.reduce((total, p) => total + p.congressLeads, 0)).toBe(terms.length);
        expect(profiles.reduce((total, p) => total + p.statesWon, 0))
          .toBe(terms.reduce((total, t) => total + t.grid.winners.filter((w) => w >= 0).length, 0));
        for (const p of profiles) {
          const supported = terms.filter((t) => t.support[p.party]! > 0).length;
          expect(p.ideology).toHaveLength(supported);
          expect(p.active.reduce((total, { from, to }) => total + (to - from) / 4 + 1, 0)).toBe(supported);
        }
      }
    }
  });

  it('writes ordinals', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111].map(ordinal))
      .toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '101st', '111th']);
  });
});
