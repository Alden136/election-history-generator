/**
 * Runs one alternate history: 69 elections, 1792 to 2064.
 *
 * Each term is computed from the terms before it, in the order the sheet's
 * formulas depend on each other. The same seed always gives the same result.
 */
import { electCongress, electPresident } from './congress';
import { courtAverage, updateCourt } from './court';
import {
  DEFAULT_DIALS,
  ELECTIONS,
  NAMED_PARTY_COUNT,
  P,
  PARTIES,
  PARTY_COUNT,
  BLOC_COUNT,
  START_BLOCS,
  START_COURT,
} from './data';
import {
  blocShares,
  electorateCenter,
  nationalSupport,
  partyVotes,
  updateBlocSizes,
  updatePartyIdeology,
} from './electorate';
import { thirdPartyStrength, updateStrengths } from './parties';
import {
  dayOneApproval,
  descriptor,
  electionDayApproval,
  performance,
  presidentIdeology,
  stability,
  winnerName,
} from './president';
import { createRng } from './rng';
import { RULES, rulePreset, type Preset, type Rule } from './rules';
import {
  NO_EXPANSIONS,
  VIRGINIA,
  countExpansions,
  electoralShares,
  initialGrid,
  leanAverage,
  nextGrid,
  updateExpansions,
} from './states';
import { summarise, type FinalPresident, type Summary } from './summary';
import { SECEDED, type Context, type Expansions, type Settings, type Term } from './types';
import { argMax } from './util';

export interface Timeline {
  seed: number;
  preset: Preset;
  corrections: readonly Rule[];
  /** One entry per election, 1792 first. */
  terms: Term[];
  /** The president inaugurated in 2065, after the last election. */
  finalPresident: FinalPresident;
  /** Territory as of 2065. */
  finalExpansions: Expansions;
  summary: Summary;
}

export const DEFAULT_SETTINGS: Settings = { dials: DEFAULT_DIALS };
export const CORRECTED_SETTINGS: Settings = { ...DEFAULT_SETTINGS, corrections: RULES };

const WASHINGTON = 'George Washington';
const zeros = (n: number): number[] => new Array<number>(n).fill(0);

/** The 1792 row: almost entirely hand-typed in the sheet. */
function firstTerm(ctx: Context): Term {
  const federalistSeats = 0.5 * (51 / 105 + 18 / 30);
  const republicanSeats = 0.5 * (54 / 105 + 11 / 30);

  const support = zeros(PARTY_COUNT);
  support[P.FEDERALIST] = 77 / 132;
  support[P.J_REPUBLICAN] = 55 / 132;

  const congress = zeros(PARTY_COUNT);
  congress[P.FEDERALIST] = federalistSeats;
  congress[P.J_REPUBLICAN] = republicanSeats;

  const strength = zeros(NAMED_PARTY_COUNT);
  strength[P.FEDERALIST] = federalistSeats;
  strength[P.J_REPUBLICAN] = republicanSeats;

  const ideology = zeros(NAMED_PARTY_COUNT);
  ideology[P.FEDERALIST] = PARTIES[P.FEDERALIST]!.startIdeology ?? 0;
  ideology[P.J_REPUBLICAN] = PARTIES[P.J_REPUBLICAN]!.startIdeology ?? 0;

  const shownIdeology = zeros(PARTY_COUNT);
  shownIdeology[P.FEDERALIST] = ideology[P.FEDERALIST]!;
  shownIdeology[P.J_REPUBLICAN] = ideology[P.J_REPUBLICAN]!;
  shownIdeology[P.THIRD] = 3 * (ctx.rng.next() - 0.5);

  const congressIdeology = 0.5 * congress.reduce((acc, seat, p) => acc + seat * shownIdeology[p]!, 0);
  const electoral = zeros(PARTY_COUNT);
  electoral[P.FEDERALIST] = 1;

  const blocSizes = START_BLOCS.map((b) => b.startSize);
  const shares = blocShares(blocSizes);

  return {
    index: 0,
    election: 1792,
    termBegan: 1789,
    president: WASHINGTON,
    potusParty: P.FEDERALIST,
    potusIdeology: 1,
    dayOneApproval: 0.75,
    performance: 0,
    descriptor: 'National Father',
    stability: 0.65,
    electionDayApproval: 0.75,
    result: 'WIN',
    winnerParty: P.FEDERALIST,
    winnerName: WASHINGTON,
    winnerElectoralShare: 1,
    winnerPopularShare: 1,
    electoral,
    support,
    shownIdeology,
    congress,
    congressRaw: [...congress],
    congressIdeologyBefore: 0,
    congressIdeology,
    congressLeader: argMax(congress),
    closeness: congress.map((seat, p) => 100 - (seat === 0 ? 100 : Math.abs(shownIdeology[p]! - congressIdeology))),
    strength,
    strengthThird: thirdPartyStrength(strength),
    strengthLeader: P.FEDERALIST,
    ideology,
    votes: Array.from({ length: NAMED_PARTY_COUNT }, () => zeros(BLOC_COUNT)),
    voteTotals: zeros(NAMED_PARTY_COUNT),
    nonvoters: zeros(BLOC_COUNT),
    blocSizes,
    blocShares: shares,
    center: electorateCenter(shares),
    leanAverage: 0,
    leanShift: 0,
    court: [...START_COURT],
    courtAverage: courtAverage(START_COURT),
    grid: initialGrid(),
  };
}

function nextTerm(history: readonly Term[], ctx: Context): Term {
  const prev = history[history.length - 1]!;
  const prev2 = history.length >= 2 ? history[history.length - 2] : undefined;
  const index = prev.index + 1;
  const election = ELECTIONS[index]!;
  const termBegan = prev.termBegan + 4;

  // The president: last election's winner.
  const president = prev.winnerName;
  const potusParty = prev.winnerParty;
  const potusIdeology = presidentIdeology(potusParty, prev);
  const dayOne = dayOneApproval(prev, prev2);

  // Territory.
  const expansions = updateExpansions(
    {
      termBegan,
      potusIdeology,
      prevTermBegan: prev.termBegan,
      prevPotusIdeology: prev.potusIdeology,
      prev: prev.grid.expansions,
      prev2: prev2?.grid.expansions ?? NO_EXPANSIONS,
      virginiaSeceded: prev.grid.winners[VIRGINIA] === SECEDED,
    },
    ctx,
  );
  const expanded = countExpansions(expansions) !== countExpansions(prev.grid.expansions);

  // How the term went.
  const perf = performance(election, potusIdeology, expanded, prev, ctx);
  const label = descriptor(perf, potusIdeology, potusParty, prev, ctx);
  const stable = stability(perf, potusIdeology, expanded, history);

  // Congress as it sat during the term, and the court.
  const congressIdeologyBefore = prev.congressIdeology;
  const court = updateCourt(prev.court, potusIdeology, congressIdeologyBefore, ctx);
  const electionDay = electionDayApproval(
    dayOne, perf, label, potusIdeology, congressIdeologyBefore, potusParty, prev, ctx,
  );

  // The electorate and the parties.
  const blocSizes = updateBlocSizes(prev, potusIdeology, dayOne, electionDay, ctx);
  const shares = blocShares(blocSizes);
  const center = electorateCenter(shares);
  // The sheet hand-types every party's ideology for 1796.
  const ideology =
    index === 1 ? PARTIES.slice(0, NAMED_PARTY_COUNT).map((p) => p.startIdeology ?? 0) : updatePartyIdeology(prev, ctx);
  const strength = updateStrengths(
    { election, potusParty, performance: perf, electionDayApproval: electionDay, prev, prev2 },
    ctx,
  );
  const strengthThird = thirdPartyStrength(strength);
  const { votes, totals, nonvoters } = partyVotes(strength, ideology, shares, ctx.corrections);
  const { support, shownIdeology } = nationalSupport(election, strength, strengthThird, totals, ideology, ctx);

  // The states vote.
  const grid = nextGrid(
    prev.grid,
    { index, election, expansions, expanded, performance: perf, descriptor: label, potusIdeology, support, shownIdeology },
    ctx,
  );
  const electoral = electoralShares(grid, ctx);
  const leanAvg = leanAverage(grid);

  // Congress, then the presidency.
  const congress = electCongress(prev, label, support, shownIdeology, grid, ctx);
  const winnerParty = electPresident(electoral, prev, ctx.corrections);
  const result = potusParty === winnerParty ? 'WIN' : 'LOSS';
  const nextIdeology = winnerParty === P.THIRD ? center : ideology[winnerParty]!;
  const winner = winnerName(
    election,
    president,
    prev.president,
    result === 'WIN',
    label,
    nextIdeology,
    ctx,
  );
  const winnerElectoralShare = electoral[winnerParty]!;

  return {
    index,
    election,
    termBegan,
    president,
    potusParty,
    potusIdeology,
    dayOneApproval: dayOne,
    performance: perf,
    descriptor: label,
    stability: stable,
    electionDayApproval: electionDay,
    result,
    winnerParty,
    winnerName: winner,
    winnerElectoralShare,
    winnerPopularShare: (winnerElectoralShare + 2 * support[winnerParty]!) / 3,
    electoral,
    support,
    shownIdeology,
    congress: congress.shares,
    congressRaw: congress.raw,
    congressIdeologyBefore,
    congressIdeology: congress.ideology,
    congressLeader: congress.leader,
    closeness: congress.closeness,
    strength,
    strengthThird,
    strengthLeader: argMax([...strength, strengthThird]),
    ideology,
    votes,
    voteTotals: totals,
    nonvoters,
    blocSizes,
    blocShares: shares,
    center,
    leanAverage: leanAvg,
    leanShift: leanAvg - prev.leanAverage,
    court,
    courtAverage: courtAverage(court),
    grid,
  };
}

export function simulate(seed: number, settings: Settings = DEFAULT_SETTINGS): Timeline {
  const corrections = RULES.filter((rule) => settings.corrections?.includes(rule));
  const ctx: Context = { rng: createRng(seed), dials: settings.dials, corrections: new Set(corrections) };

  const terms: Term[] = [firstTerm(ctx)];
  while (terms.length < ELECTIONS.length) terms.push(nextTerm(terms, ctx));

  // The term that begins in 2065 has a president and territory but no election.
  const last = terms[terms.length - 1]!;
  const beforeLast = terms[terms.length - 2]!;
  const finalIdeology = presidentIdeology(last.winnerParty, last);
  const finalExpansions = updateExpansions(
    {
      termBegan: last.termBegan + 4,
      potusIdeology: finalIdeology,
      prevTermBegan: last.termBegan,
      prevPotusIdeology: last.potusIdeology,
      prev: last.grid.expansions,
      prev2: beforeLast.grid.expansions,
      virginiaSeceded: last.grid.winners[VIRGINIA] === SECEDED,
    },
    ctx,
  );
  // The sheet also scores that final term, and counts it in the summary.
  const finalExpanded = countExpansions(finalExpansions) !== countExpansions(last.grid.expansions);
  const finalPerformance = performance(last.election + 4, finalIdeology, finalExpanded, last, ctx);
  const finalPresident: FinalPresident = {
    name: last.winnerName,
    party: last.winnerParty,
    ideology: finalIdeology,
    termBegan: last.termBegan + 4,
    descriptor: descriptor(finalPerformance, finalIdeology, last.winnerParty, last, ctx),
  };

  return {
    seed,
    preset: rulePreset(corrections),
    corrections,
    terms,
    finalPresident,
    finalExpansions,
    summary: summarise(terms, finalPresident, finalExpansions, ctx.corrections),
  };
}

/** Exposed for tests that drive one term at a time. */
export const internals = { firstTerm, nextTerm };
