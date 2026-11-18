/**
 * Candidate traits, an addition the spreadsheet does not have (off unless
 * settings.candidateTraits is true). Before each election every party with
 * national support picks a nominee, so who runs can change the result:
 *
 * - Home state: the state the person was based in (data/candidate-homes.json)
 *   leans toward their party.
 * - Charisma and experience: rolled once per person per timeline from the
 *   seed and the name, without touching the simulation's random numbers, so
 *   the same person has the same traits throughout one timeline.
 * - Incumbency: a sitting president running again gets an edge.
 *
 * Charisma, experience and incumbency scale the party's national support,
 * and what one party gains the others lose, so total support is unchanged.
 */
import { CANDIDATES, CANDIDATE_HOMES, P, STATES } from './data';
import type { Context } from './types';

export interface Nominee {
  party: number;
  name: string;
  /** State code of the home state, or null when the list has none for them. */
  home: string | null;
  /** -2 (wooden) to 2 (magnetic). */
  charisma: number;
  /** 0 newcomer, 1 seasoned, 2 veteran (always, for a sitting president running again). */
  experience: number;
  /** True when the sitting president is running again. */
  incumbent: boolean;
}

/** Support gained per step of charisma, per level of experience, and for running as the sitting president. */
export const CHARISMA_STEP = 0.025;
export const EXPERIENCE_STEP = 0.015;
export const INCUMBENT_EDGE = 0.04;
/** How much closer a home state counts its own candidate's party, on the state lean scale (-8 to 8). */
export const HOME_STATE_BONUS = 2;

/** A small stable hash (FNV-1a) of the seed and a name, so traits are the same every time. */
function hash(seed: number, text: string): number {
  let h = 0x811c9dc5 ^ (seed >>> 0);
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  // A final mix so nearby seeds give unrelated traits.
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d) >>> 0;
  h ^= h >>> 12;
  return h >>> 0;
}

/** Charisma and experience for one person in one timeline. Charisma follows a bell shape: most people are steady. */
export function traitsFor(seed: number, name: string): { charisma: number; experience: number } {
  const h = hash(seed, name);
  const roll = h % 16; // 1 + 4 + 6 + 4 + 1
  const charisma = roll === 0 ? -2 : roll <= 4 ? -1 : roll <= 10 ? 0 : roll <= 14 ? 1 : 2;
  const experience = Math.floor(h / 16) % 3;
  return { charisma, experience };
}

export const bandOf = (ideology: number) => Math.min(9, Math.max(0, Math.floor((ideology + 10) / 2)));

export interface NominationInput {
  election: number;
  /** National support, 15 entries. */
  support: readonly number[];
  /** Ideology of the 14 named parties; Third Party runs at the electorate's centre. */
  ideology: readonly number[];
  center: number;
  president: string;
  previousPresident: string;
  potusParty: number;
  descriptor: string;
}

/**
 * Every party with support picks a nominee: the sitting president when they
 * run again (the same chances the spreadsheet uses for a re-run), otherwise the
 * listed candidate for this year and the party's ideology. Two parties never
 * share a nominee: the weaker one takes the nearest other name on the list.
 */
export function chooseNominees(input: NominationInput, ctx: Context): Nominee[] {
  const { rng } = ctx;
  const seed = ctx.seed ?? 0;
  const { election, support, president, potusParty } = input;
  const runsAgain = presidentRunsAgain(input, rng);
  const lists = nameLists(election);
  const parties = support.map((share, party) => ({ share, party })).filter(({ share }) => share > 0)
    .sort((a, b) => b.share - a.share || a.party - b.party);
  const taken = new Set<string>();
  if (runsAgain) taken.add(president);

  return parties.map(({ party }) => {
    const incumbent = runsAgain && party === potusParty;
    const name = incumbent ? president : pickName(lists, bandOf(party === P.THIRD ? input.center : input.ideology[party]!), taken);
    return nomineeFor(party, name, incumbent, seed);
  }).sort((a, b) => a.party - b.party);
}

/** A person's nominee record: home state and the traits rolled for them in this timeline. */
export function nomineeFor(party: number, name: string, incumbent: boolean, seed: number): Nominee {
  const traits = traitsFor(seed, name);
  // A sitting president has run the country: they count as a veteran whatever their roll.
  return { party, name, home: CANDIDATE_HOMES[name] ?? null, charisma: traits.charisma, experience: incumbent ? 2 : traits.experience, incumbent };
}

/** Whether the sitting president runs again: the same chances the spreadsheet uses for a re-run. */
export function presidentRunsAgain(input: Pick<NominationInput, 'support' | 'president' | 'previousPresident' | 'potusParty' | 'descriptor'>,
  rng: Context['rng']): boolean {
  const { support, president, previousPresident, potusParty, descriptor } = input;
  const mayRun = president !== 'George Washington' && support[potusParty]! > 0;
  return mayRun && (
    (previousPresident === president ? rng.next() <= 0.2 : rng.next() <= 0.7) ||
    (descriptor === 'DICTATORSHIP' && rng.next() <= 0.7));
}

/** This year's candidate list first, then the elections around it, so a crowded field still finds a free name. */
export function nameLists(election: number): (readonly string[])[] {
  return [0, -4, 4, -8, 8, -12, 12, -16, 16].map((offset) => CANDIDATES[election + offset] ?? []);
}

/**
 * The listed name for an ideology band, or the closest one still free, nearest
 * band first and outwards, looking at nearby elections only when this year's
 * list has no free name left. The name is marked as taken.
 */
export function pickName(lists: readonly (readonly string[])[], band: number, taken: Set<string>): string {
  let name = '';
  for (const candidates of lists) {
    for (let step = 0; step < 10 && !name; step++) {
      for (const b of step === 0 ? [band] : [band - step, band + step]) {
        const candidate = candidates[b];
        if (candidate && !taken.has(candidate)) { name = candidate; break; }
      }
    }
    if (name) break;
  }
  name ||= lists[0]![band] ?? '';
  taken.add(name);
  return name;
}

/** National support after the nominees' appeal: each party scaled, then all rescaled to the same total. */
export function supportWithNominees(support: readonly number[], nominees: readonly Nominee[]): number[] {
  const total = support.reduce((a, b) => a + b, 0);
  const scaled = support.map((share, party) => {
    const nominee = nominees.find((n) => n.party === party);
    if (!nominee || share <= 0) return share;
    const appeal = 1 + CHARISMA_STEP * nominee.charisma + EXPERIENCE_STEP * nominee.experience + (nominee.incumbent ? INCUMBENT_EDGE : 0);
    return share * Math.max(0.5, appeal);
  });
  const after = scaled.reduce((a, b) => a + b, 0);
  return after > 0 ? scaled.map((share) => share * total / after) : scaled;
}

/** For each state, the parties whose nominee calls it home. */
export function homeStates(nominees: readonly Nominee[]): number[][] {
  const homes: number[][] = STATES.map(() => []);
  for (const nominee of nominees) {
    const state = nominee.home === null ? -1 : STATES.findIndex((s) => s.code === nominee.home);
    if (state >= 0) homes[state]!.push(nominee.party);
  }
  return homes;
}
