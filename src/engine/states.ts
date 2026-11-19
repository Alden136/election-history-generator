/**
 * The states: which territories have joined, how urban each state is, which
 * way it leans, how many electoral votes it has, and how it votes.
 *
 * Sheet rows 86-158: P-X (expansions), AI-CT (winners), DC-FN (lean),
 * FS-ID (urbanisation), IN-KY (electoral votes), LL-NW (real-life votes).
 *
 * Comments marked QUIRK keep behaviour that looks unintended in the sheet.
 */
import { HOME_STATE_BONUS } from './candidates';
import { RUNNING_MATE_HOME_BONUS } from './succession';
import {
  CENSUS_ELECTIONS,
  NAMED_PARTY_COUNT,
  P,
  PARTY_COUNT,
  STATES,
  STATE_COUNT,
  URBAN_DIRECTION,
  partyIndex,
  stateIndex,
} from './data';
import { NO_VOTE, SECEDED, type Context, type Expansions, type StateGrid, type StateWinner } from './types';
import { argMin, clamp, safeDiv, sum } from './util';

const VIRGINIA = stateIndex('VA');
const DC = stateIndex('DC');
/** The first 49 states (through Hawaii) are the ones the sheet averages over. */
const CORE_STATES = stateIndex('HI') + 1;
/** The 16 states of 1796 urbanise unconditionally. */
const ORIGINAL_STATES = 16;

/** Which expansion a state needs before it can hold electoral votes. */
const GATE: Record<string, keyof Expansions> = {
  TX: 'texas',
  CA: 'west', NV: 'west', NM: 'west', AZ: 'west', HI: 'west',
  WV: 'westVirginia',
  CL: 'canada', JF: 'canada', SK: 'canada', MB: 'canada', ON: 'canada', NB: 'canada', NL: 'canada', NS: 'canada',
  QC: 'quebec',
  SN: 'mexico', CH: 'mexico',
  PR: 'puertoRico',
  CU: 'cuba',
};
const STATE_GATE: (keyof Expansions | null)[] = STATES.map((s) => GATE[s.code] ?? null);

const realVotes = (state: number, election: number): number =>
  STATES[state]!.realElectoralVotes[election] ?? 0;

export const NO_EXPANSIONS: Expansions = {
  texas: false, west: false, mexico: false, canada: false,
  quebec: false, puertoRico: false, cuba: false, westVirginia: false,
};

export const countExpansions = (e: Expansions): number => Object.values(e).filter(Boolean).length;

// -------------------------------------------------------------- expansions

export interface ExpansionInput {
  termBegan: number;
  potusIdeology: number;
  prevTermBegan: number;
  prevPotusIdeology: number;
  /** Expansions as of the previous term and the one before it. */
  prev: Expansions;
  prev2: Expansions;
  virginiaSeceded: boolean;
}

/** Territory joins when the year and the president's ideology line up. */
export function updateExpansions(input: ExpansionInput, ctx: Context): Expansions {
  const { rng } = ctx;
  const { termBegan, potusIdeology, prevTermBegan, prevPotusIdeology, prev, prev2 } = input;

  const texas = prev.texas || (termBegan > 1835 && potusIdeology > 3);
  const west =
    prev.west || (rng.next() > 0.5 && prev2.texas) || (prevTermBegan > 1840 && prevPotusIdeology > 2);
  const mexico = prev.mexico || (west && !prev.west && rng.next() > 0.9);
  // QUIRK: written as ABS(score > 7), so only a far-right president annexes
  // Canada. ABS(score) > 7, either extreme, was probably meant.
  const canadaIdeology = ctx.corrections?.has('canada-annexation') ? Math.abs(prevPotusIdeology) : prevPotusIdeology;
  const canada = prev.canada || canadaIdeology > 7;
  const quebec = prev.quebec || (!prev.canada && canada && rng.next() > 0.95);
  const puertoRico = prev.puertoRico || (prevTermBegan > 1950 && prevPotusIdeology < -4);
  const cuba = prev.cuba || (prevTermBegan > 1850 && prevPotusIdeology > 8);
  const westVirginia = prev.westVirginia || input.virginiaSeceded;

  return { texas, west, mexico, canada, quebec, puertoRico, cuba, westVirginia };
}

// ------------------------------------------------------------------- grid

/** The 1792 row records 15 state winners but no electoral vote counts. */
export function initialGrid(): StateGrid {
  const winners = STATES.map((s) => (s.winner1792 ? partyIndex(s.winner1792) : NO_VOTE));
  return {
    expansions: NO_EXPANSIONS,
    expanded: false,
    winners,
    lean: new Array<number>(STATE_COUNT).fill(0),
    urban: new Array<number>(STATE_COUNT).fill(0),
    avgUrban: 0,
    votes: new Array<number>(STATE_COUNT).fill(0),
    totalVotes: 0,
    secededVotes: 0,
    votingStates: winners.filter((winner) => winner >= 0).length,
  };
}

export function averageUrban(urban: readonly number[]): number {
  const positive = urban.slice(0, CORE_STATES).filter((u) => u > 0);
  return safeDiv(sum(positive), positive.length);
}

/** Cities grow a little every term; states with the sheet's "GEO" flag grow faster. */
function nextUrban(election: number, prev: readonly number[], ctx: Context): number[] {
  const { rng } = ctx;
  return STATES.map((state, i) => {
    const growth = (): number => ((state.geoFlag ? 1 : 0) + 1.8) * rng.next() / 100;
    const setback = (): number => (rng.next() < 1 / 30 ? 0.98 : 1);
    if (i === DC) {
      if (realVotes(i, election) === 0) return 0;
      // The 1800 formula puts the cap outside the setback, unlike later rows.
      const grown = 0.98 + growth();
      return election === 1800 ? Math.min(1, grown * setback()) : Math.min(0.95, grown) * setback();
    }
    if (i < ORIGINAL_STATES) return Math.min(0.95, prev[i]! + growth()) * setback();
    return (realVotes(i, election) > 0 ? Math.min(0.95, prev[i]! + growth()) : 0) * setback();
  });
}

/**
 * A state's lean follows its own past, drifts with how urban it is compared
 * with the average, and shifts by region in 1820-1860 and 1950-2060.
 */
function nextLean(
  election: number,
  prev: readonly number[],
  urban: readonly number[],
  avgUrban: number,
  ctx: Context,
): number[] {
  const { rng } = ctx;
  const regional = (election >= 1820 && election <= 1860) || (election >= 1950 && election <= 2060);
  const direction = URBAN_DIRECTION[election] === 'LEFT' ? 1 : -1;
  return STATES.map((state, i) => {
    const base =
      urban[i] === 0
        ? 0
        : (regional && state.region === 'NORTH' ? -0.5 : 0) +
          (regional && state.region === 'SOUTH' ? 1 : 0) +
          (6 * prev[i]! + 10 * direction * (urban[i]! - avgUrban)) / 7;
    const lurch = (rng.next() < 1 / 30 ? 1.5 : 1) * (rng.next() < 1 / 30 ? 0.5 : 1);
    return clamp(base * lurch, -8, 8);
  });
}

/**
 * Electoral votes follow real history, re-rolled within 10% after each census
 * or whenever a state joins, and only once the state's territory has joined.
 */
function nextVotes(
  election: number,
  prevElection: number,
  prev: readonly number[],
  expansions: Expansions,
  ctx: Context,
): number[] {
  const { rng } = ctx;
  const count = (year: number): number => {
    let n = 0;
    for (let i = 0; i < CORE_STATES; i++) if (realVotes(i, year) > 0) n++;
    return n;
  };
  const recount = CENSUS_ELECTIONS.has(election) || count(election) !== count(prevElection);

  return STATES.map((_, i) => {
    const gate = STATE_GATE[i];
    if (gate && !expansions[gate]) return 0;
    const real = realVotes(i, election);
    if (real === 0) return 0;
    return Math.max(3, recount ? Math.round(real * (0.9 + rng.next() * 0.2)) : prev[i]!);
  });
}

export interface VotingInput {
  performance: number;
  descriptor: string;
  potusIdeology: number;
  /** National support and shown ideology, 15 entries each. */
  support: readonly number[];
  shownIdeology: readonly number[];
  /** Candidate traits addition: for each state, the parties whose nominee calls it home. */
  homes?: readonly (readonly number[])[];
  /** Running mates addition: for each state, the parties whose running mate calls it home. */
  mateHomes?: readonly (readonly number[])[];
}

function loyaltyParty(party: number, corrections: Context['corrections']): number | undefined {
  if (party < 0 || party >= NAMED_PARTY_COUNT) return undefined;
  // QUIRK: the sheet skips L. Republican and checks its support for Whig states.
  if (party === P.L_REPUBLICAN && !corrections?.has('republican-loyalty')) return undefined;
  if (party === P.WHIG && !corrections?.has('whig-loyalty')) return P.L_REPUBLICAN;
  return party;
}

export function nextWinners(
  prev: StateGrid,
  lean: readonly number[],
  votes: readonly number[],
  input: VotingInput,
  ctx: Context,
): StateWinner[] {
  const { rng, dials, corrections } = ctx;
  const secededBefore = prev.winners.filter((w) => w === SECEDED).length;
  // QUIRK: the sheet uses zero ideology as a proxy for no support.
  const penalty = corrections?.has('neutral-party-eligibility')
    ? input.support.map((share) => share > 0 ? 0 : 100)
    : input.shownIdeology.map((ideo) => ideo === 0 ? 100 : 0);

  return prev.winners.map((last, i) => {
    const existed = last !== NO_VOTE;
    // A seceded state stays out while the president does badly and at least
    // three states are out.
    if (input.performance < 0.15 && last === SECEDED && secededBefore > 2) return SECEDED;
    // In a civil war, states far from the president's ideology leave.
    if (
      input.descriptor === 'Civil War' &&
      existed &&
      Math.abs(input.potusIdeology - prev.lean[i]!) > dials.secessionThreshold
    ) {
      return SECEDED;
    }
    if (existed && rng.next() < dials.partyLoyalty) {
      const check = loyaltyParty(last, corrections);
      if (check !== undefined && input.support[check]! > 0) return last;
    }
    if (votes[i] === 0) return NO_VOTE;
    const scores: number[] = [];
    for (let p = 0; p < PARTY_COUNT; p++) {
      const home = (input.homes?.[i]?.includes(p) ? HOME_STATE_BONUS : 0) + (input.mateHomes?.[i]?.includes(p) ? RUNNING_MATE_HOME_BONUS : 0);
      scores.push(
        Math.abs(input.shownIdeology[p]! - lean[i]!) - input.support[p]! * dials.partyVictoryBoost + penalty[p]! - home,
      );
    }
    return argMin(scores);
  });
}

export interface GridInput extends VotingInput {
  /** 1 for the 1796 election, 2 for 1800, and so on. */
  index: number;
  election: number;
  expansions: Expansions;
  expanded: boolean;
}

/** One election's state grid, from the previous election's. */
export function nextGrid(prev: StateGrid, input: GridInput, ctx: Context): StateGrid {
  const { election, index } = input;
  let urban: number[], lean: number[], votes: number[];

  if (index === 1) {
    // 1796: the sheet's hand-typed starting values.
    urban = STATES.map((s) => s.urbanisation1796 ?? 0);
    lean = STATES.map((s) => s.lean1796 ?? 0);
    votes = STATES.map((s) => s.electoralVotes1796 ?? 0);
  } else {
    urban = nextUrban(election, prev.urban, ctx);
    lean = nextLean(election, prev.lean, urban, averageUrban(urban), ctx);
    votes = nextVotes(election, election - 4, prev.votes, input.expansions, ctx);
  }

  const winners = nextWinners(prev, lean, votes, input, ctx);
  const { total, seceded, votingStates } = electoralTotals({ winners, votes });
  return {
    expansions: input.expansions,
    expanded: input.expanded,
    winners,
    lean,
    urban,
    avgUrban: averageUrban(urban),
    votes,
    totalVotes: total,
    secededVotes: seceded,
    votingStates,
  };
}

/** Electoral-vote-weighted average lean of the states still in the union. */
export function leanAverage(grid: StateGrid): number {
  let weighted = 0;
  let weight = 0;
  for (let i = 0; i < STATE_COUNT; i++) {
    if (grid.winners[i] === SECEDED) continue;
    weighted += grid.lean[i]! * grid.votes[i]!;
    weight += grid.votes[i]!;
  }
  return safeDiv(weighted, weight);
}

/**
 * Electoral College share for the 14 named parties plus Third Party, which
 * takes whatever is left over.
 */
export function electoralShares(grid: StateGrid, ctx: Context): number[] {
  const { rng } = ctx;
  const { won, live } = electoralTotals(grid);
  const shares = won.slice(0, NAMED_PARTY_COUNT).map((votes) => {
    // One time in five a few electors go astray.
    const faithless = rng.next() > 0.8 ? 1 - rng.next() * 0.05 : 1;
    return safeDiv(votes, live) * faithless;
  });
  // The sheet divides by zero when every elector is out. Keep zero shares
  // and let the contingent election rules resolve the tied ranks.
  shares.push(live === 0 ? 0 : clamp(1 - sum(shares), 0, 1));
  return shares;
}

/** Count state results and elector weights before any faithless-elector draw. */
export function electoralTotals(grid: Pick<StateGrid, 'votes' | 'winners'>) {
  const won = new Array<number>(PARTY_COUNT).fill(0);
  let total = 0;
  let seceded = 0;
  let votingStates = 0;
  grid.winners.forEach((winner, i) => {
    const votes = grid.votes[i]!;
    total += votes;
    if (winner === SECEDED) seceded += votes;
    if (winner >= 0) {
      won[winner]! += votes;
      votingStates++;
    }
  });
  return { won, total, seceded, live: total - seceded, votingStates };
}

export { VIRGINIA };
