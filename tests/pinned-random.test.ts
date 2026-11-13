import { describe, expect, it } from 'vitest';
import { electCongress, electPresident } from '../src/engine/congress';
import { updateCourt } from '../src/engine/court';
import { DEFAULT_DIALS, P, PARTY_COUNT, stateIndex } from '../src/engine/data';
import { nationalSupport, partyVotes, updateBlocSizes, updatePartyIdeology } from '../src/engine/electorate';
import { updateStrengths } from '../src/engine/parties';
import { descriptor, electionDayApproval, performance, winnerName } from '../src/engine/president';
import { internals } from '../src/engine/simulate';
import { electoralShares, electoralTotals, nextGrid, nextWinners, NO_EXPANSIONS, updateExpansions } from '../src/engine/states';
import { NO_VOTE, SECEDED, type Context } from '../src/engine/types';

function constant(draw: number): Context {
  return { dials: DEFAULT_DIALS, rng: { next: () => draw, between: (lo, hi) => lo + Math.floor(draw * (hi - lo + 1)) } };
}

function pinned(...draws: number[]) {
  let i = 0;
  const next = (): number => {
    if (i === draws.length) throw new Error('Unexpected random draw');
    return draws[i++]!;
  };
  const context: Context = {
    dials: DEFAULT_DIALS,
    rng: { next, between: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)) },
  };
  return { context, check: () => expect(i).toBe(draws.length) };
}

const first = internals.firstTerm(constant(0.5));
const partyValues = (entries: Record<number, number>) =>
  Array.from({ length: PARTY_COUNT }, (_, i) => entries[i] ?? 0);

describe('pinned spreadsheet branches', () => {
  it('separates crisis-year and ordinary-year probabilities and applies expansion and collapse', () => {
    const event = pinned(0.5, 0.5, 0.5, 0.5, 0.2, 0.99);
    expect(performance(1796, 0, true, first, event.context)).toBeCloseTo(0.7, 12);
    event.check();
    const ordinary = pinned(0.5, 0.5, 0.5, 0.5, 0.2);
    expect(performance(1824, 0, false, first, ordinary.context)).toBe(0);
    ordinary.check();
    expect(performance(1824, 0, false, { ...first, stability: 0.1 }, constant(0.5))).toBe(0);
    expect(performance(1824, 0, false, { ...first, stability: 0.1 }, constant(0.75))).toBeCloseTo(-0.49, 12);
  });

  it('pins both extreme-president outcomes and the dictatorship and Civil War modifiers', () => {
    const extremist = { ...first, potusIdeology: 9 };
    const war = { ...extremist, descriptor: 'Civil War' };
    const dictatorship = { ...extremist, descriptor: 'DICTATORSHIP' };
    for (const [draw, expected] of [[0.49, 0.4], [0.5, -0.4]] as const) {
      const flip = pinned(0.5, 0.5, 0.5, 0.5, draw);
      expect(performance(1824, -9, false, extremist, flip.context)).toBe(expected);
      flip.check();
      const amplified = pinned(0.5, 0.5, 0.5, 0.5, draw);
      expect(performance(1824, -9, false, war, amplified.context)).toBe(expected * 2.5);
      amplified.check();
    }
    for (const [draw, expected] of [[0, 0.5], [0.2, -0.5], [0.4, 0.1], [0.6, 0.1], [0.8, 0.1]] as const) {
      const choice = pinned(0.5, 0.5, draw);
      expect(performance(1824, 0, false, dictatorship, choice.context)).toBe(expected);
      choice.check();
    }
  });

  it('pins every random descriptor and checks the performance cutoffs', () => {
    const unstable = { ...first, stability: 0.19 };
    const cases = [
      [0.006, first, ['Economic Boom', 'War Win', 'Good Feelings']],
      [-0.25, first, ['Recession', 'Scandal']],
      [-0.35, first, ['Depression', 'Lost War', 'Riots']],
      [-0.351, unstable, ['Civil War', 'Chaos']],
    ] as const;
    for (const [perf, prev, labels] of cases) {
      labels.forEach((label, i) => expect(descriptor(perf, 0, P.FEDERALIST, prev,
        constant((i + 0.5) / labels.length))).toBe(label));
    }
    expect(descriptor(-0.351, 0, P.FEDERALIST, first, constant(0))).toBe('Major War Loss');
    expect(descriptor(-0.005, 0, P.FEDERALIST, first, constant(0))).toBe('');
    expect(descriptor(0.005, 0, P.FEDERALIST, first, constant(0))).toBe('');
    expect(descriptor(0.15, 0, P.FEDERALIST, first, constant(0))).toBe('Major War Win');
    expect(descriptor(0.4, 7, P.FEDERALIST, first, constant(0))).toBe('Solved Crisis');
    expect(descriptor(0.4, 8, P.FEDERALIST, first, constant(0))).toBe('DICTATORSHIP');
    expect(descriptor(0.4, 0, P.FEDERALIST, { ...first, performance: -0.6 }, constant(0))).toBe('DICTATORSHIP');
    const dictator = { ...first, descriptor: 'DICTATORSHIP' };
    expect(descriptor(0, 0, P.FEDERALIST, dictator, constant(0))).toBe('DICTATORSHIP');
    expect(descriptor(0, 0, P.WHIG, dictator, constant(0))).toBe('');
  });

  it('pins approval noise and clamps both extremes', () => {
    const approve = (perf: number, roll: number) => electionDayApproval(
      0.5, perf, '', 0, 0, P.FEDERALIST, first, constant(roll),
    );
    expect(approve(0, 0)).toBeCloseTo(0.34, 12);
    expect(approve(0, 0.9)).toBeCloseTo(0.475, 12);
    expect(approve(-1, 0)).toBe(0.05);
    expect(approve(1, 0.9)).toBe(0.9);
  });

  it('pins second terms, later terms, and dictatorship reelection', () => {
    const winner = (previous: string, label: string, held: boolean, ...draws: number[]) => {
      const { context, check } = pinned(...draws);
      const name = winnerName(1800, 'John Adams', previous, held, label, 3, context);
      check();
      return name;
    };
    expect(winner('John Adams', '', true, 0.2)).toBe('John Adams');
    expect(winner('John Adams', '', true, 0.21, 0.1, 0.1)).toBe('John Jay');
    expect(winner('George Washington', '', true, 0.1, 0.7)).toBe('John Adams');
    expect(winner('George Washington', '', true, 0.1, 0.71, 0.1)).toBe('John Jay');
    expect(winner('John Adams', 'DICTATORSHIP', true, 0.8, 0.8, 0.7)).toBe('John Adams');
    expect(winner('John Adams', 'DICTATORSHIP', true, 0.8, 0.8, 0.71)).toBe('John Jay');
    expect(winner('John Adams', 'DICTATORSHIP', false, 0, 0, 0)).toBe('John Jay');
  });

  it('checks all territory gates, the annexation quirk, and persistence', () => {
    const input = {
      termBegan: 2001, potusIdeology: 4, prevTermBegan: 1997, prevPotusIdeology: 9,
      prev: NO_EXPANSIONS, prev2: NO_EXPANSIONS, virginiaSeceded: true,
    };
    const acquired = updateExpansions(input, constant(0.99));
    expect(acquired).toEqual({ ...NO_EXPANSIONS,
      texas: true, west: true, mexico: true, canada: true, quebec: true, cuba: true, westVirginia: true,
    });
    const skipped = updateExpansions(input, constant(0.5));
    expect(skipped).toEqual({ ...acquired, mexico: false, quebec: false });
    const left = { ...input, termBegan: 1997, potusIdeology: 0, prevPotusIdeology: -9, virginiaSeceded: false };
    expect(updateExpansions(left, constant(0.99))).toEqual({ ...NO_EXPANSIONS, puertoRico: true });
    const delayedWest = { ...left, prev2: { ...NO_EXPANSIONS, texas: true } };
    expect(updateExpansions(delayedWest, constant(0.5)).west).toBe(false);
    expect(updateExpansions(delayedWest, constant(0.51)).west).toBe(true);
    expect(updateExpansions({ ...left, prev: acquired }, constant(0))).toEqual({ ...acquired, puertoRico: true });
  });

  it('pins loyalty, Whig and L. Republican exceptions, and the zero-ideology penalty', () => {
    const previous = { ...first.grid, winners: [P.WHIG, P.L_REPUBLICAN, P.FEDERALIST, NO_VOTE], lean: [0, 0, 0, 0] };
    const vote = { performance: 0, descriptor: '', potusIdeology: 0,
      support: partyValues({ [P.L_REPUBLICAN]: 0.05, [P.J_REPUBLICAN]: 0.6, [P.UNION]: 0.35 }),
      shownIdeology: partyValues({ [P.L_REPUBLICAN]: -4, [P.J_REPUBLICAN]: -2 }),
    };
    const votes = [3, 3, 3, 0];
    const lean = [0, 0, 0, 0];
    expect(nextWinners(previous, lean, votes, vote, constant(0.49)))
      .toEqual([P.WHIG, P.J_REPUBLICAN, P.J_REPUBLICAN, NO_VOTE]);
    expect(nextWinners(previous, lean, votes, vote, constant(0.5)))
      .toEqual([P.J_REPUBLICAN, P.J_REPUBLICAN, P.J_REPUBLICAN, NO_VOTE]);
    const withoutLR = { ...vote, support: partyValues({ [P.WHIG]: 0.05, [P.J_REPUBLICAN]: 0.6, [P.UNION]: 0.35 }) };
    expect(nextWinners(previous, lean, votes, withoutLR, constant(0))[0]).toBe(P.J_REPUBLICAN);
    const moderate = { ...vote, shownIdeology: partyValues({ [P.UNION]: 0.1 }) };
    expect(nextWinners(previous, lean, votes, moderate, constant(0.9))[0]).toBe(P.UNION);
  });

  it('checks secession, continued secession, and the electoral denominator', () => {
    const vote = { performance: -0.4, descriptor: 'Civil War', potusIdeology: 8,
      support: first.support, shownIdeology: first.shownIdeology };
    const previous = { ...first.grid, winners: [P.FEDERALIST, P.J_REPUBLICAN, NO_VOTE], lean: [-1, 0, -1] };
    expect(nextWinners(previous, [0, 0, 0], [6, 4, 0], vote, constant(0.99))[0]).toBe(SECEDED);
    expect(nextWinners(previous, [0, 0, 0], [6, 4, 0], vote, constant(0.99))[1]).not.toBe(SECEDED);
    const seceded = { ...previous, winners: [SECEDED, SECEDED, SECEDED] };
    expect(nextWinners(seceded, [0, 0, 0], [3, 3, 3], vote, constant(0.99))).toEqual(seceded.winners);
    const rejoin = { ...vote, performance: 0.15, descriptor: '' };
    expect(nextWinners(seceded, [0, 0, 0], [3, 3, 3], rejoin, constant(0.99))).not.toContain(SECEDED);

    const grid = { ...previous, winners: [P.FEDERALIST, P.J_REPUBLICAN, SECEDED], votes: [6, 4, 9] };
    expect(electoralTotals(grid)).toMatchObject({ live: 10, seceded: 9, total: 19, votingStates: 2 });
    expect(electoralShares(grid, constant(0.8))).toEqual(partyValues({ [P.FEDERALIST]: 0.6, [P.J_REPUBLICAN]: 0.4 }));
    const faithless = electoralShares(grid, constant(0.9));
    expect(faithless[P.FEDERALIST]).toBeCloseTo(0.6 * 0.955, 12);
    expect(faithless[P.THIRD]).toBeCloseTo(0.045, 12);
    const noElectors = electoralShares({ ...grid, ...seceded, votes: [6, 4, 9] }, constant(0.9));
    expect(noElectors).toEqual(partyValues({}));
    expect(electPresident(noElectors, first)).toBe(P.FEDERALIST);
  });

  it('includes tied electoral ranks in contingent voting, with strict majority thresholds', () => {
    const electoral = partyValues({ 0: 0.5, 1: 0.3, 2: 0.1, 3: 0.1 });
    const prev = { congress: partyValues({ 3: 0.45, 4: 0.4 }), closeness: partyValues({ 2: 95, 4: 99 }) };
    expect(electPresident(electoral, prev)).toBe(2);
    expect(electPresident(electoral, { ...prev, congress: partyValues({ 3: 0.451 }) })).toBe(3);
    expect(electPresident(partyValues({ 0: 0.501, 3: 0.499 }), prev)).toBe(0);
  });

  it('pins congressional noise and removes carryover during Civil War', () => {
    const grid = { ...first.grid, winners: [P.FEDERALIST, P.J_REPUBLICAN], votingStates: 2 };
    const raw = (event: string, roll: number) =>
      electCongress(first, event, first.support, first.shownIdeology, grid, constant(roll)).raw[0]!;
    const fresh = (first.support[0]! + 0.5) / 4;
    expect(raw('', 0)).toBeCloseTo(fresh + first.congressRaw[0]! / 2, 12);
    expect(raw('', 0.9)).toBeCloseTo(fresh + first.congressRaw[0]! / 2 - 0.045, 12);
    expect(raw('Civil War', 0)).toBeCloseTo(fresh, 12);
  });

  it('pins court replacement, ideological drift, and the empty-seat queue', () => {
    const replacement = pinned(0.19, 0.5, 0.09, 0.75, 0.1);
    expect(updateCourt([4, null, null, null], 3, 0, replacement.context)).toEqual([2, 2.25, null, null]);
    replacement.check();
    const drift = pinned(0.2, 0, 0.1);
    expect(updateCourt([4, null, null], 3, 0, drift.context)).toEqual([3.5, null, null]);
    drift.check();
  });

  it('pins ideology noise and preserves the broken Whig bloc pull', () => {
    const prev = {
      ...first,
      votes: first.votes.map((v, i) => i === P.WHIG ? [0.1, 0.05, 0, 0, 0, 0, 0] : v),
      voteTotals: first.voteTotals.map((v, i) => i === P.WHIG ? 0.15 : v),
      nonvoters: [0, 0, 0, 1, 0, 0, 0],
    };
    expect(updatePartyIdeology(prev, constant(0.5))[P.WHIG]).toBe(-0.5);
    expect(updatePartyIdeology(prev, constant(0))[P.WHIG]).toBeCloseTo(-1.7, 12);
    expect(updatePartyIdeology(prev, constant(0.9))[P.WHIG]).toBeCloseTo(0.46, 12);
    expect(updatePartyIdeology(prev, constant(0.5))[P.UNION]).toBe(0);
  });

  it('pins urban growth and setbacks, lean lurches, and census elector rolls', () => {
    const input = {
      index: 3, election: 1804, expanded: false, expansions: NO_EXPANSIONS,
      performance: 0, descriptor: '', potusIdeology: 1, support: first.support, shownIdeology: first.shownIdeology,
    };
    const original = nextGrid(first.grid, { ...input, index: 1, election: 1796 }, constant(0.5));
    const low = nextGrid(original, input, constant(0));
    const high = nextGrid(original, input, constant(0.99));
    const nh = stateIndex('NH');
    const startUrban = original.urban[nh]!;
    expect(low.urban[nh]).toBeCloseTo(startUrban * 0.98, 12);
    expect(high.urban[nh]).toBeGreaterThan(startUrban);
    const baseLean = (6 * original.lean[nh]! + 10 * (low.urban[nh]! - low.avgUrban)) / 7;
    expect(low.lean[nh]).toBeCloseTo(baseLean * 1.5 * 0.5, 12);
    expect(low.votes[nh]).toBe(6);
    expect(high.votes[nh]).toBe(8);
    const carry = nextGrid(high, { ...input, index: 4, election: 1808 }, constant(0));
    expect(carry.votes[nh]).toBe(high.votes[nh]);
    expect(carry.votes[stateIndex('TX')]).toBe(0);
  });

  it('pins Third Party support, its early-year penalty, and shown ideology noise', () => {
    const low = nationalSupport(1796, first.strength, first.strengthThird, first.strength,
      first.ideology, constant(0));
    const later = nationalSupport(1820, first.strength, first.strengthThird, first.strength,
      first.ideology, constant(0));
    const high = nationalSupport(1820, first.strength, first.strengthThird, first.strength,
      first.ideology, constant(0.9));
    expect(low.support[P.THIRD]).toBe(0);
    expect(low.shownIdeology[P.THIRD]).toBe(-1.5);
    expect(later.support[P.THIRD]).toBeGreaterThan(0);
    expect(high.support[P.THIRD]).toBeGreaterThan(later.support[P.THIRD]!);
    expect(high.shownIdeology[P.THIRD]).toBeCloseTo(1.2, 12);
  });

  it('preserves the two vote-by-bloc quirks and approval freezes', () => {
    const strength = partyValues({ [P.POPULIST]: 1, [P.AGRARIAN]: 0.5 }).slice(0, P.THIRD);
    const ideology = partyValues({ [P.POPULIST]: 9, [P.AGRARIAN]: -3.5 }).slice(0, P.THIRD);
    const shares = [0.05, 0.1, 0.2, 0.25, 0.25, 0.1, 0.05];
    const { votes } = partyVotes(strength, ideology, shares);
    expect(votes[P.POPULIST]![6]).toBe(0.1);
    expect(votes[P.AGRARIAN]![2]).toBe(0.15);
    expect(updateBlocSizes(first, -3, 0.7, 0.2, constant(0))).toEqual(first.blocSizes);
    expect(updateBlocSizes(first, 9, 0.7, 0.2, constant(0))).toEqual(first.blocSizes);
    expect(updateBlocSizes(first, 3, 0.7, 0.2, constant(0))[4]).toBeCloseTo(first.blocSizes[4]! - 30, 12);
    expect(updateBlocSizes({ ...first, leanShift: 3 }, 9, 0.7, 0.2, constant(0))[0]).toBe(-1);
  });

  it('pins party birth, collapse, and the different failed-president penalties', () => {
    const active = { ...first,
      strength: partyValues({ [P.DEMOCRAT]: 0.4, [P.FEDERALIST]: 0.4 }).slice(0, P.THIRD),
      support: partyValues({ [P.DEMOCRAT]: 0.81, [P.FEDERALIST]: 0.19 }),
      strengthThird: 0,
    };
    const strength = (prev: typeof first, perf: number, draw: number) => updateStrengths({
      election: 1840, prev, prev2: first, potusParty: prev.winnerParty,
      performance: perf, electionDayApproval: 0.5,
    }, constant(draw));
    expect(strength(active, 0, 0)[P.DEMOCRAT]).toBe(0.35);
    expect(strength(active, 0, 0.99)[P.DEMOCRAT]).toBe(0.55);
    expect(strength(active, -0.3, 0.5)[P.FEDERALIST]).toBe(0.4);
    expect(strength(active, -0.31, 0.5)[P.FEDERALIST]).toBe(0);
    const democrat = { ...active, winnerParty: P.DEMOCRAT };
    expect(strength(democrat, -0.31, 0)[P.DEMOCRAT]).toBeCloseTo(0.25, 12);
    const dominated = { ...first, support: partyValues({ [P.FEDERALIST]: 0.81, [P.J_REPUBLICAN]: 0.19 }) };
    expect(strength(dominated, 0, 0)[P.DEMOCRAT]).toBe(0.5);
    expect(strength(dominated, 0, 0.99)[P.DEMOCRAT]).toBeCloseTo(0.35, 12);
    expect(strength(first, 0, 0)[P.DEMOCRAT]).toBe(0);
  });
});
