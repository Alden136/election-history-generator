import type { Nominee } from './candidates';
import type { MidtermCongress } from './congress';
import type { Rule } from './rules';
import type { Rng } from './rng';

/** Tunable numbers the sheet author set by hand. See data/dials.json. */
export interface Dials {
  partyLoyalty: number;
  secessionThreshold: number;
  partyVictoryBoost: number;
  crisisBacklash: number;
  potusBacklash: number;
  blocSizeMultiplier: number;
}

export interface Settings {
  dials: Dials;
  corrections?: readonly Rule[];
  /** Midterm elections: an addition the spreadsheet does not have, off unless true. */
  midterms?: boolean;
  /** Candidate traits: an addition the spreadsheet does not have, off unless true. */
  candidateTraits?: boolean;
}

/** Who carried a state: a party index (0-14), or one of the two special values. */
export type StateWinner = number;
export const NO_VOTE: StateWinner = -1;
export const SECEDED: StateWinner = -2;

/** The eight territory switches. Once on, each stays on. */
export interface Expansions {
  texas: boolean;
  west: boolean;
  mexico: boolean;
  canada: boolean;
  quebec: boolean;
  puertoRico: boolean;
  cuba: boolean;
  westVirginia: boolean;
}

/** One election's state-level picture (one row of the sheet's lower grid). */
export interface StateGrid {
  expansions: Expansions;
  /** True when an expansion switched on this term. */
  expanded: boolean;
  /** Winner per state, in data/states.json order. */
  winners: StateWinner[];
  /** Lean per state, -8 (left) to 8 (right). */
  lean: number[];
  urban: number[];
  avgUrban: number;
  /** Electoral votes per state; 0 when not a state. */
  votes: number[];
  totalVotes: number;
  secededVotes: number;
  /** Number of states that voted for a party. */
  votingStates: number;
}

/**
 * Everything the model knows about one four-year term and the election that
 * ends it. This is one row of the sheet's upper table. Array fields indexed
 * "by party" have 15 entries (14 named parties, then Third Party) unless noted.
 */
export interface Term {
  /** 0 for the 1792 election, 1 for 1796, and so on. */
  index: number;
  election: number;
  termBegan: number;

  // The president serving this term.
  president: string;
  potusParty: number;
  potusIdeology: number;
  dayOneApproval: number;
  performance: number;
  descriptor: string;
  stability: number;
  electionDayApproval: number;

  // The election at the end of the term.
  result: 'WIN' | 'LOSS';
  winnerParty: number;
  winnerName: string;
  winnerElectoralShare: number;
  winnerPopularShare: number;
  /** Electoral College share by party. */
  electoral: number[];
  /** National support by party ("POTUS candidate approval" in the sheet). */
  support: number[];
  /** Party ideology as voters see it: 0 for a party with no support. */
  shownIdeology: number[];

  // Congress.
  congress: number[];
  congressRaw: number[];
  congressIdeologyBefore: number;
  congressIdeology: number;
  congressLeader: number;
  /** How close each party sits to Congress, used for contingent elections. */
  closeness: number[];

  // Parties (14 entries: no Third Party).
  strength: number[];
  strengthThird: number;
  strengthLeader: number;
  ideology: number[];
  /** votes[party][bloc]: share of the population. */
  votes: number[][];
  voteTotals: number[];

  // Electorate (7 blocs).
  nonvoters: number[];
  blocSizes: number[];
  blocShares: number[];
  /** Weighted centre of the electorate, -3 to 3. */
  center: number;
  /** Electoral-vote-weighted average state lean, and its change this term. */
  leanAverage: number;
  leanShift: number;

  /** Each party's nominee at this election, when candidate traits are on; null otherwise and for 1792. */
  nominees: Nominee[] | null;

  /** The Congress elected two years into this term, when midterms are on; null otherwise and for the founding term. */
  midterm: MidtermCongress | null;

  // Supreme Court: 15 seats, null when empty.
  court: (number | null)[];
  courtAverage: number;

  grid: StateGrid;
}

export interface Context {
  rng: Rng;
  dials: Dials;
  corrections?: ReadonlySet<Rule>;
  midterms?: boolean;
  candidateTraits?: boolean;
  /** The timeline's seed, for traits rolled without the shared random numbers. */
  seed?: number;
}
