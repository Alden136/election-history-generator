/**
 * Typed access to the data files extracted from the sheet.
 */
import candidatesJson from '../../data/candidates.json';
import candidateHomesJson from '../../data/candidate-homes.json';
import dialsJson from '../../data/dials.json';
import electionsJson from '../../data/elections.json';
import initialJson from '../../data/initial-state.json';
import partiesJson from '../../data/parties.json';
import statesJson from '../../data/states.json';
import type { Dials } from './types';

export interface PartyData {
  id: string;
  name: string;
  order: number;
  startIdeology: number | null;
  existsAtStart: boolean;
  tagline: string | null;
}

export interface StateData {
  code: string;
  name: string;
  region: 'NORTH' | 'SOUTH' | null;
  winner1792: string | null;
  lean1796: number | null;
  urbanisation1796: number | null;
  geoFlag: boolean;
  electoralVotes1796: number | null;
  realElectoralVotes: Record<string, number | undefined>;
  tile: { col: number; row: number };
}

export const PARTIES: PartyData[] = partiesJson;
export const STATES: StateData[] = statesJson as StateData[];
export const ELECTIONS: number[] = electionsJson.elections;
export const CENSUS_ELECTIONS: ReadonlySet<number> = new Set(electionsJson.censusElections);
export const URBAN_DIRECTION: Record<string, string | undefined> = electionsJson.urbanDirection;
export const DEFAULT_DIALS: Dials = dialsJson;
export const CANDIDATES: Record<string, string[] | undefined> = candidatesJson.byElection;
/** Home state code of each listed candidate, where known (candidate traits addition). */
export const CANDIDATE_HOMES: Record<string, string | undefined> = candidateHomesJson.homes;
export const START_BLOCS = initialJson.blocs;
export const START_COURT: (number | null)[] = initialJson.court;

export const PARTY_COUNT = 15;
export const NAMED_PARTY_COUNT = 14;
export const BLOC_COUNT = 7;
export const STATE_COUNT = STATES.length;

/** Party indexes, in the sheet's fixed order. */
export const P = {
  FEDERALIST: 0,
  J_REPUBLICAN: 1,
  AMERICAN: 2,
  DEMOCRAT: 3,
  WHIG: 4,
  L_REPUBLICAN: 5,
  POPULIST: 6,
  NATIONAL: 7,
  PROGRESSIVE: 8,
  AGRARIAN: 9,
  UNION: 10,
  SOCIALIST: 11,
  LIBERAL: 12,
  PATRIOT: 13,
  THIRD: 14,
} as const;

/** Fixed positions of the seven ideology blocs on the -10 to 10 axis. */
export const BLOC_POSITIONS = START_BLOCS.map((b) => b.position);
export const BLOC_NAMES = START_BLOCS.map((b) => b.name);

export function partyName(index: number): string {
  return PARTIES[index]?.name ?? 'Unknown';
}

export function partyIndex(name: string): number {
  return PARTIES.findIndex((p) => p.name === name);
}

export function stateIndex(code: string): number {
  const i = STATES.findIndex((s) => s.code === code);
  if (i < 0) throw new Error(`Unknown state code ${code}`);
  return i;
}

// Guard against the data files drifting away from what the engine assumes.
const expectedOrder = [
  'Federalist', 'J. Republican', 'American', 'Democrat', 'Whig', 'L. Republican', 'Populist',
  'National', 'Progressive', 'Agrarian', 'Union', 'Socialist', 'Liberal', 'Patriot', 'Third Party',
];
if (PARTIES.length !== PARTY_COUNT || PARTIES.some((p, i) => p.name !== expectedOrder[i])) {
  throw new Error('data/parties.json is not in the order the engine expects');
}
