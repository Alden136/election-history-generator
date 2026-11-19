import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { readLocation, timelineUrl } from '../src/app/presentation';
import { congressFromRaw, electPresident } from '../src/engine/congress';
import { DEFAULT_DIALS, P, PARTY_COUNT } from '../src/engine/data';
import { partyVotes, updateBlocSizes, updatePartyIdeology } from '../src/engine/electorate';
import { updateStrengths, type StrengthInput } from '../src/engine/parties';
import { RULES, type Rule } from '../src/engine/rules';
import { CORRECTED_SETTINGS, DEFAULT_SETTINGS, internals, simulate } from '../src/engine/simulate';
import { nextWinners, NO_EXPANSIONS, updateExpansions } from '../src/engine/states';
import { summarise } from '../src/engine/summary';
import { NO_VOTE, type Context } from '../src/engine/types';

// Timelines from before the additions existed: their fields are left out so the pinned digests still apply.
const ADDITION_KEYS = new Set(['midterm', 'midterms', 'nominees', 'candidateTraits', 'primaries', 'runningMates', 'vicePresident', 'succession', 'popularVote', 'voteShares', 'spoiler', 'spoilers', 'contested', 'recounts', 'faithless', 'electorRule', 'turnout', 'suffrage']);
const withoutMidterms = (key: string, value: unknown) => (ADDITION_KEYS.has(key) ? undefined : value);

const context = (...rules: Rule[]): Context => ({
  dials: DEFAULT_DIALS,
  corrections: new Set(rules),
  rng: { next: () => 0.25, between: (min, max) => Math.floor(min + (max - min + 1) * 0.25) },
});
const first = internals.firstTerm(context());
const parties = (values: Partial<Record<number, number>> = {}) =>
  Array.from({ length: PARTY_COUNT }, (_, index) => values[index] ?? 0);
const named = (values: Partial<Record<number, number>> = {}) => parties(values).slice(0, P.THIRD);
const inactive = { ...first, strength: named(), support: parties(), strengthThird: 0 };

function strength(overrides: Partial<StrengthInput>, ...rules: Rule[]) {
  return updateStrengths({
    election: 1852, potusParty: P.WHIG, performance: 0, electionDayApproval: 0.5,
    prev: inactive, prev2: inactive, ...overrides,
  }, context(...rules));
}

describe('individual corrections', () => {
  it('uses each party’s correct vote bloc independently', () => {
    const strength = named({ [P.POPULIST]: 1, [P.AGRARIAN]: 0.5 });
    const ideology = named({ [P.POPULIST]: 9, [P.AGRARIAN]: -3.5 });
    const shares = [0.05, 0.1, 0.2, 0.25, 0.25, 0.1, 0.05];
    const vote = (...rules: Rule[]) => partyVotes(strength, ideology, shares, new Set(rules)).votes;
    expect(vote()[P.POPULIST]![6]).toBe(0.1);
    expect(vote('populist-authoritarian')[P.POPULIST]![6]).toBe(0.05);
    expect(vote('populist-authoritarian')[P.AGRARIAN]![2]).toBe(0.15);
    expect(vote('agrarian-liberal')[P.AGRARIAN]![2]).toBe(0.12);
    expect(vote('agrarian-liberal')[P.POPULIST]![6]).toBe(0.1);
  });

  it('finds the largest voter bloc among the seven bloc columns', () => {
    const affected = [P.WHIG, P.AGRARIAN, P.UNION, P.SOCIALIST, P.LIBERAL];
    const prev = {
      ...first,
      votes: first.votes.map(() => [0.1, 0.05, 0, 0, 0, 0, 0]),
      voteTotals: named(Object.fromEntries(first.votes.map((_, i) => [i, 0.15]))),
      nonvoters: [0, 0, 0, 1, 0, 0, 0],
    };
    const faithful = updatePartyIdeology(prev, context());
    const corrected = updatePartyIdeology(prev, context('largest-voter-bloc'));
    affected.forEach((party) => expect(corrected[party]).toBeCloseTo(faithful[party]! - 9 / 8, 12));
    expect(corrected[P.FEDERALIST]).toBe(faithful[P.FEDERALIST]);
  });

  it('fixes Whig and L. Republican loyalty with independent switches', () => {
    const prev = { ...first.grid, winners: [P.WHIG, P.L_REPUBLICAN], lean: [0, 0] };
    const input = {
      performance: 0, descriptor: '', potusIdeology: 0,
      support: parties({ [P.WHIG]: 0.05, [P.L_REPUBLICAN]: 0.05, [P.DEMOCRAT]: 0.9 }),
      shownIdeology: parties({ [P.WHIG]: 3, [P.L_REPUBLICAN]: -3, [P.DEMOCRAT]: 1 }),
    };
    const vote = (support: number[], ...rules: Rule[]) =>
      nextWinners(prev, [0, 0], [3, 3], { ...input, support }, context(...rules));
    expect(vote(input.support)).toEqual([P.WHIG, P.DEMOCRAT]);
    expect(vote(input.support, 'republican-loyalty')).toEqual([P.WHIG, P.L_REPUBLICAN]);
    const noWhig = parties({ [P.L_REPUBLICAN]: 0.05, [P.DEMOCRAT]: 0.95 });
    expect(vote(noWhig, 'whig-loyalty')).toEqual([P.DEMOCRAT, P.DEMOCRAT]);
    const noRepublican = parties({ [P.WHIG]: 0.05, [P.DEMOCRAT]: 0.95 });
    expect(vote(noRepublican, 'whig-loyalty')).toEqual([P.WHIG, P.DEMOCRAT]);
  });

  it('restores the American party trigger for a Whig incumbent after 1847', () => {
    const prev = { ...inactive, performance: -0.4 };
    expect(strength({ prev })[P.AMERICAN]).toBe(0);
    expect(strength({ prev }, 'american-party-trigger')[P.AMERICAN]).toBeGreaterThan(0);
    expect(strength({ prev, election: 1844 }, 'american-party-trigger')[P.AMERICAN]).toBe(0);
    expect(strength({ prev, potusParty: P.DEMOCRAT }, 'american-party-trigger')[P.AMERICAN]).toBe(0);
    expect(strength({ prev: { ...prev, performance: -0.3 } }, 'american-party-trigger')[P.AMERICAN]).toBe(0);
  });

  it('uses one failed-president strength penalty without changing the performance threshold', () => {
    for (const party of [P.FEDERALIST, P.DEMOCRAT, P.LIBERAL]) {
      const prev = { ...inactive, winnerParty: party, strength: named({ [party]: 0.5 }), support: parties({ [party]: 0.5 }) };
      const failed = { prev, potusParty: party, performance: -0.31 };
      expect(strength(failed, 'failed-president-penalty')[party]).toBeCloseTo(0.465, 12);
      expect(strength({ ...failed, performance: -0.3 }, 'failed-president-penalty')[party]).toBe(0.5);
    }
  });

  it('awards the Liberal strength bonus based on the prior election winner', () => {
    const prev = {
      ...inactive, winnerParty: P.LIBERAL, strengthLeader: P.WHIG, strengthThird: 0.2,
      strength: named({ [P.LIBERAL]: 0.3 }), support: parties({ [P.LIBERAL]: 0.3 }),
    };
    expect(strength({ prev })[P.LIBERAL]).toBe(0.3);
    expect(strength({ prev }, 'liberal-winner-bonus')[P.LIBERAL]).toBe(0.4);
    const loser = { ...prev, strengthLeader: P.LIBERAL, winnerParty: P.WHIG };
    expect(strength({ prev: loser })[P.LIBERAL]).toBe(0.4);
    expect(strength({ prev: loser }, 'liberal-winner-bonus')[P.LIBERAL]).toBe(0.3);
  });

  it('allows either ideological extreme to annex Canada with the same threshold', () => {
    const annex = (ideology: number, ...rules: Rule[]) => updateExpansions({
      termBegan: 2001, potusIdeology: 0, prevTermBegan: 1997, prevPotusIdeology: ideology,
      prev: NO_EXPANSIONS, prev2: NO_EXPANSIONS, virginiaSeceded: false,
    }, context(...rules)).canada;
    expect(annex(-8)).toBe(false);
    expect(annex(-8, 'canada-annexation')).toBe(true);
    expect(annex(8, 'canada-annexation')).toBe(true);
    expect(annex(-7, 'canada-annexation')).toBe(false);
  });

  it('restores approval-based shifts and clamps after lean adjustment independently', () => {
    const prev = { blocSizes: [20, 20, 40, 40, 40, 20, 20], leanShift: 0 };
    expect(updateBlocSizes(prev, -3, 0.6, 0.5, context())).toEqual(prev.blocSizes);
    expect(updateBlocSizes(prev, -3, 0.6, 0.5, context('presidential-bloc-shift'))[2]).toBeCloseTo(34, 12);
    expect(updateBlocSizes(prev, 9, 0.6, 0.5, context('presidential-bloc-shift'))[6]).toBeCloseTo(14, 12);
    const shifted = { ...prev, leanShift: 3 };
    expect(updateBlocSizes(shifted, 9, 0.6, 0.5, context())[0]).toBe(-10);
    expect(updateBlocSizes(shifted, 9, 0.6, 0.5, context('bloc-size-floor'))[0]).toBe(1);
  });

  it('lets a supported zero-ideology party compete for a state', () => {
    const prev = { ...first.grid, winners: [NO_VOTE], lean: [0] };
    const vote = (...rules: Rule[]) => nextWinners(prev, [0], [3], {
      performance: 0, descriptor: '', potusIdeology: 0,
      support: parties({ [P.UNION]: 0.6, [P.DEMOCRAT]: 0.4 }),
      shownIdeology: parties({ [P.DEMOCRAT]: 2, [P.THIRD]: 0.1 }),
    }, context(...rules))[0];
    expect(vote()).toBe(P.DEMOCRAT);
    expect(vote('neutral-party-eligibility')).toBe(P.UNION);
  });

  it('eliminates phantom Third Party congressional seats from positive floating-point residue', () => {
    const raw = parties({ 0: 0.3, 1: 0.1, 2: 0.2 });
    const faithful = congressFromRaw(raw, first, first.shownIdeology);
    const corrected = congressFromRaw(raw, first, first.shownIdeology, new Set<Rule>(['congress-rounding']));
    expect(faithful.shares[P.THIRD]).toBeGreaterThan(0);
    expect(faithful.closeness[P.THIRD]).toBeGreaterThan(0);
    expect(corrected.shares[P.THIRD]).toBe(0);
    expect(corrected.closeness[P.THIRD]).toBe(0);
  });

  it('keeps the last inauguration open-ended in the corrected tenure summary', () => {
    const { summary, finalPresident } = simulate(10, {
      ...CORRECTED_SETTINGS, corrections: RULES.filter((rule) => rule !== 'contingent-eligibility'),
    });
    expect(summary.radical).toMatchObject({ name: finalPresident.name, termStart: 2065, termEnd: null });
  });

  it('excludes zero-vote parties from contingent elections with electoral votes', () => {
    const votes = parties({ [P.FEDERALIST]: 0.5, [P.DEMOCRAT]: 0.5 });
    const prev = {
      congress: parties({ [P.J_REPUBLICAN]: 0.6, [P.DEMOCRAT]: 0.3, [P.THIRD]: 0.1 }),
      closeness: parties(),
    };
    const rule = new Set<Rule>(['contingent-eligibility']);
    expect(electPresident(votes, prev)).toBe(P.J_REPUBLICAN);
    expect(electPresident(votes, prev, rule)).toBe(P.DEMOCRAT);
    votes[P.THIRD] = 1e-16;
    const residue = { ...prev, congress: parties({ [P.THIRD]: 0.6, [P.DEMOCRAT]: 0.4 }) };
    expect(electPresident(votes, residue, rule)).toBe(P.DEMOCRAT);
    expect(electPresident(parties(), prev, rule)).toBe(P.J_REPUBLICAN);
  });

  it('replays the contingent-election correction only when the link includes it', () => {
    const seed = 508;
    const dials = { partyLoyalty: 0.97, secessionThreshold: 15.8, partyVictoryBoost: 24,
      crisisBacklash: 7.1, potusBacklash: 0.63, blocSizeMultiplier: 33 };
    const legacy = { seed, year: 1816, dials, corrections: RULES.filter((rule) => rule !== 'contingent-eligibility'), midterms: false, traits: false, primaries: false, runningMates: false, popularVote: false, spoilers: false, recounts: false, faithless: false, turnout: false, electorRule: 'winner-take-all' as const };
    const original = readLocation(timelineUrl('https://example.test/', legacy).search);
    const current = readLocation(timelineUrl('https://example.test/', { ...legacy, corrections: RULES }).search);
    const term = (settings: typeof original) => simulate(seed, settings).terms.find((item) => item.election === 1816)!;
    expect(term(original).winnerParty).toBe(P.J_REPUBLICAN);
    expect(term(current).winnerParty).toBe(P.FEDERALIST);
  });

  it('reports nonconsecutive service as separate ranges with the total years served', () => {
    const term = (president: string, termBegan: number) => ({
      ...first, president, termBegan, winnerName: president,
    });
    const terms = [term('A', 2013), term('B', 2017), term('A', 2021), term('A', 2025)];
    const final = { name: 'C', termBegan: 2029, ideology: 1, party: P.WHIG, descriptor: '' };
    const faithful = summarise(terms, final, NO_EXPANSIONS);
    const corrected = summarise(terms, final, NO_EXPANSIONS, new Set<Rule>(['presidential-tenure']));
    expect(faithful.longest.termEnd).toBe(2025);
    expect(corrected.longest.terms).toEqual([{ start: 2013, end: 2017 }, { start: 2021, end: 2029 }]);
    expect(corrected.longest.info).toBe('12 years');
    expect(corrected.current.termStart).toBe(2021);
    expect(corrected.current.termEnd).toBe(2029);
  });
});

describe('preset replay', () => {
  it.each([
    [0, 'a9147adf141fd456ee656ba9c294468ca9cf38d1f871a397cbd9816217674fb5'],
    [42, '2add0fd04548caa1c9a324b52342acec96d3257a3e9ea2442f746f49d0c5317e'],
    [4294967295, '338c14c4b68b5cb4f4e1fb0d94bbe967658f2cf20850c506eaed191671485e13'],
  ] as const)('preserves the pre-preset result for seed %s', (seed, digest) => {
    const { preset, corrections, ...timeline } = simulate(seed);
    expect(preset).toBe('faithful');
    expect(corrections).toEqual([]);
    expect(createHash('sha256').update(JSON.stringify(timeline, withoutMidterms)).digest('hex')).toBe(digest);
  });

  it('replays Corrected and Custom timelines by seed and canonical rule list', () => {
    const corrected = simulate(42, CORRECTED_SETTINGS);
    expect(corrected.preset).toBe('corrected');
    expect(corrected.corrections).toEqual(RULES);
    expect(corrected).toEqual(simulate(42, CORRECTED_SETTINGS));
    expect(corrected.terms).not.toEqual(simulate(42).terms);
    const rules = ['whig-loyalty', 'populist-authoritarian'] as const;
    const custom = simulate(42, { ...DEFAULT_SETTINGS, corrections: rules });
    const url = timelineUrl('https://example.test/election/?tag=keep#main', { seed: 42, year: 1848, corrections: rules, dials: DEFAULT_DIALS, midterms: false, traits: false, primaries: false, runningMates: false, popularVote: false, spoilers: false, recounts: false, faithless: false, turnout: false, electorRule: 'winner-take-all' as const });
    const replay = readLocation(url.search);
    expect(url.pathname).toBe('/election/');
    expect(url.searchParams.get('tag')).toBe('keep');
    expect(url.hash).toBe('#main');
    expect(replay.year).toBe(1848);
    expect(replay.corrections).toEqual(['populist-authoritarian', 'whig-loyalty']);
    expect(custom.preset).toBe('custom');
    expect(custom).toEqual(simulate(replay.seed, { ...DEFAULT_SETTINGS, corrections: replay.corrections }));
  });

  it('defaults links to Corrected, writes Faithful as none, and discards unknown rules', () => {
    expect(readLocation('?seed=7&year=1960')).toEqual({ seed: 7, year: 1960, corrections: RULES, dials: DEFAULT_DIALS, midterms: true, traits: true, primaries: true, runningMates: true, popularVote: true, spoilers: true, recounts: true, faithless: true, turnout: true, electorRule: 'winner-take-all' as const });
    expect(readLocation('?seed=7&year=1960&rules=none').corrections).toEqual([]);
    const current = readLocation('?seed=7&year=1960&rules=unknown,whig-loyalty,whig-loyalty');
    expect(current.corrections).toEqual(['whig-loyalty']);
    const faithful = timelineUrl('https://example.test/?rules=whig-loyalty', { ...current, corrections: [] });
    expect(faithful.searchParams.get('rules')).toBe('none');
    expect(readLocation(faithful.search).corrections).toEqual([]);
    const corrected = timelineUrl(faithful.href, { ...current, corrections: RULES });
    expect(corrected.searchParams.has('rules')).toBe(false);
  });
});
