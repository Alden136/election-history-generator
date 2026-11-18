/**
 * Primaries and nomination fights, an addition the spreadsheet does not have
 * (off unless settings.primaries and settings.candidateTraits are both true).
 *
 * Before each election every named party with support picks its nominee in a
 * primary between two wings:
 *
 * - a moderate, halfway from the party's position to the electorate's centre;
 * - an ideologue, further from the centre than the party.
 *
 * Charisma and experience tilt the odds, and a roll sets the primary vote. A
 * close fight between wings far apart is bitter and costs the nominee support
 * in November. The winner's position is what voters see this election, what a
 * winning president governs from, and it pulls the party toward it afterwards
 * (see partyAfterPrimaries). A sitting president runs unopposed unless their
 * term went badly; then the other wing may challenge them. Third Party has no
 * primary: its nominee is picked as with candidate traits alone.
 */
import { P } from './data';
import { bandOf, nameLists, nomineeFor, pickName, presidentRunsAgain, type NominationInput, type Nominee } from './candidates';
import type { Context } from './types';
import { clamp } from './util';

export type Wing = 'moderate' | 'ideologue';
/** How the primary went: no challenger, a clear win, a contest, or a bitter fight. */
export type Fight = 'unopposed' | 'easy' | 'contested' | 'bitter';

export interface Contender {
  name: string;
  home: string | null;
  charisma: number;
  experience: number;
  /** The ideology this contender runs on, −10 to 10. */
  position: number;
  wing: Wing;
  /** True for a sitting president seeking renomination. */
  incumbent: boolean;
}

export interface Primary {
  party: number;
  /** One contender when unopposed, otherwise two. */
  contenders: Contender[];
  /** Index of the winner in contenders. */
  winner: number;
  /** The winner's share of the primary vote, 0.5 to 1 (1 when unopposed). */
  share: number;
  fight: Fight;
  /** Share of the party's national support the fight costs, before rescaling. */
  cost: number;
}

/** Support lost to the fight, relative to the party's own support. */
export const FIGHT_COST: Record<Fight, number> = { unopposed: 0, easy: 0, contested: 0.02, bitter: 0.06 };
/** A primary decided by less than this margin (winner minus loser) is bitter, under CONTESTED_MARGIN contested. */
export const BITTER_MARGIN = 0.1;
export const CONTESTED_MARGIN = 0.25;
/** Wings closer than this are too alike for a fight to turn bitter. */
export const BITTER_DISTANCE = 2;
/** How far toward its nominee's position a party moves by the next election: further if they won the White House. */
export const DRAG_WON = 0.3;
export const DRAG_LOST = 0.15;

/** Where each wing stands, given the party's ideology and the electorate's centre. */
export function wingPositions(ideology: number, center: number): { moderate: number; ideologue: number } {
  const away = Math.sign(ideology - center) || (ideology >= 0 ? 1 : -1);
  return {
    moderate: clamp(ideology + (center - ideology) / 2, -10, 10),
    ideologue: clamp(ideology + away * Math.min(3, 1.5 + 0.25 * Math.abs(ideology - center)), -10, 10),
  };
}

export interface PrimaryInput extends NominationInput {
  /** How the sitting president's term went; below zero their renomination can be challenged. */
  performance: number;
  /** The ideology the sitting president governed from. */
  potusIdeology: number;
}

/** The moderate's chance before the roll: even, tilted by charisma and experience, kept to 15–85%. */
export function moderateChance(moderate: Pick<Contender, 'charisma' | 'experience'>, ideologue: Pick<Contender, 'charisma' | 'experience'>): number {
  return clamp(0.5 + 0.08 * (moderate.charisma - ideologue.charisma) + 0.04 * (moderate.experience - ideologue.experience), 0.15, 0.85);
}

/** The fight a primary was, from the winner's share and how far apart the wings stand. */
export function fightOf(share: number, distance: number): Fight {
  const margin = 2 * share - 1;
  if (margin < BITTER_MARGIN && distance >= BITTER_DISTANCE) return 'bitter';
  return margin < CONTESTED_MARGIN ? 'contested' : 'easy';
}

/** Every party picks a nominee: by primary for the named parties, as with candidate traits for Third Party. */
export function holdPrimaries(input: PrimaryInput, ctx: Context): { nominees: Nominee[]; primaries: Primary[] } {
  const { rng } = ctx;
  const seed = ctx.seed ?? 0;
  const { election, support, president, potusParty, center } = input;
  const runsAgain = presidentRunsAgain(input, rng);
  const lists = nameLists(election);
  const taken = new Set<string>();
  if (runsAgain) taken.add(president);
  const parties = support.map((share, party) => ({ share, party })).filter(({ share }) => share > 0)
    .sort((a, b) => b.share - a.share || a.party - b.party);

  const contender = (party: number, name: string, position: number, wing: Wing, incumbent: boolean): Contender => {
    const { home, charisma, experience } = nomineeFor(party, name, incumbent, seed);
    return { name, home, charisma, experience, position, wing, incumbent };
  };

  const nominees: Nominee[] = [];
  const primaries: Primary[] = [];
  for (const { party } of parties) {
    if (party === P.THIRD) {
      const name = pickName(lists, bandOf(center), taken);
      nominees.push(nomineeFor(party, name, false, seed));
      continue;
    }
    const wings = wingPositions(input.ideology[party]!, center);
    const incumbentRuns = runsAgain && party === potusParty;
    let primary: Primary;
    if (incumbentRuns) {
      // The president stands on the wing nearer to how they governed.
      const ownWing: Wing = Math.abs(wings.moderate - input.potusIdeology) <= Math.abs(wings.ideologue - input.potusIdeology) ? 'moderate' : 'ideologue';
      const incumbent = contender(party, president, input.potusIdeology, ownWing, true);
      const challenged = input.performance < 0 && rng.next() < 0.5;
      if (!challenged) {
        primary = { party, contenders: [incumbent], winner: 0, share: 1, fight: 'unopposed', cost: 0 };
      } else {
        const otherWing: Wing = ownWing === 'moderate' ? 'ideologue' : 'moderate';
        const position = wings[otherWing];
        const challenger = contender(party, pickName(lists, bandOf(position), taken), position, otherWing, false);
        primary = decide(party, [incumbent, challenger], 0.7, rng.next());
      }
    } else {
      const moderate = contender(party, pickName(lists, bandOf(wings.moderate), taken), wings.moderate, 'moderate', false);
      const ideologue = contender(party, pickName(lists, bandOf(wings.ideologue), taken), wings.ideologue, 'ideologue', false);
      primary = decide(party, [moderate, ideologue], moderateChance(moderate, ideologue), rng.next());
    }
    primaries.push(primary);
    const winner = primary.contenders[primary.winner]!;
    nominees.push({ party, name: winner.name, home: winner.home, charisma: winner.charisma, experience: winner.experience, incumbent: winner.incumbent });
  }
  return {
    nominees: nominees.sort((a, b) => a.party - b.party),
    primaries: primaries.sort((a, b) => a.party - b.party),
  };
}

/**
 * The primary vote: the first contender's share centres on their chance, pulled
 * halfway toward even, plus a roll of ±30 points.
 */
function decide(party: number, contenders: [Contender, Contender], chance: number, roll: number): Primary {
  const first = clamp(0.5 + (chance - 0.5) / 2 + (roll - 0.5) * 0.6, 0.05, 0.95);
  const winner = first > 0.5 ? 0 : 1;
  const share = Math.max(first, 1 - first);
  const fight = fightOf(share, Math.abs(contenders[0].position - contenders[1].position));
  return { party, contenders, winner, share, fight, cost: FIGHT_COST[fight] };
}

/** National support after the fights: each party loses its fight's cost, then all are rescaled to the same total. */
export function supportAfterPrimaries(support: readonly number[], primaries: readonly Primary[]): number[] {
  const total = support.reduce((a, b) => a + b, 0);
  const scaled = support.map((share, party) => share * (1 - (primaries.find((p) => p.party === party)?.cost ?? 0)));
  const after = scaled.reduce((a, b) => a + b, 0);
  return after > 0 ? scaled.map((share) => share * total / after) : scaled;
}

/** The position a party's nominee ran on, or undefined when it held no primary. */
export function nomineePosition(primaries: readonly Primary[] | null | undefined, party: number): number | undefined {
  const primary = primaries?.find((p) => p.party === party);
  return primary?.contenders[primary.winner]!.position;
}

/** Party ideology after the last election's primaries: each party moves toward the position its nominee ran on. */
export function partyAfterPrimaries(ideology: readonly number[], previous: readonly number[], primaries: readonly Primary[], winnerParty: number): number[] {
  return ideology.map((score, party) => {
    const position = nomineePosition(primaries, party);
    if (position === undefined) return score;
    return clamp(score + (party === winnerParty ? DRAG_WON : DRAG_LOST) * (position - previous[party]!), -10, 10);
  });
}
