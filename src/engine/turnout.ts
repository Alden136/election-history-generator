/**
 * Turnout and suffrage, an addition the spreadsheet does not have (off unless
 * settings.turnout is true).
 *
 * Each of the seven ideology blocs turns out at its own rate each election:
 * more after a close last election and when a party stands near it, less for
 * the president's side after a bad term and for blocs no party speaks for.
 * What parties can win from a bloc scales with its turnout relative to the
 * others, so turnout moves national support.
 *
 * The electorate widens when real history widened it. There is no demographic
 * data, only ideology blocs, so each widening adds new voters with a tilt, and
 * new voters turn out less at first.
 */
import { BLOC_COUNT, BLOC_POSITIONS } from './data';
import type { Context } from './types';
import { clamp } from './util';

export interface Suffrage {
  /** The first presidential election the new voters could vote in. */
  election: number;
  /** Who gained the vote, for display and the story. */
  label: string;
  /** New voters, as a share of the electorate before. */
  added: number;
  /** How the new voters spread over the seven blocs (sums to 1); null spreads them like the electorate already is. */
  tilt: readonly number[] | null;
}

export const SUFFRAGE: readonly Suffrage[] = [
  { election: 1872, label: 'Black men won the vote (15th Amendment, 1870)', added: 0.12, tilt: [0.02, 0.25, 0.45, 0.2, 0.06, 0.02, 0] },
  { election: 1920, label: 'Women won the vote (19th Amendment, 1920)', added: 0.9, tilt: null },
  { election: 1968, label: 'The Voting Rights Act (1965) opened the vote in the South', added: 0.04, tilt: [0.03, 0.3, 0.42, 0.18, 0.05, 0.02, 0] },
  { election: 1972, label: '18-year-olds won the vote (26th Amendment, 1971)', added: 0.1, tilt: [0.04, 0.22, 0.3, 0.24, 0.12, 0.06, 0.02] },
];

export interface Turnout {
  /** Turnout in each bloc, 0 to 1. */
  blocs: number[];
  /** Turnout across the whole electorate, 0 to 1. */
  overall: number;
  /** Share of each bloc who are newly enfranchised voters; it halves every election. */
  fresh: number[];
}

/** How much less new voters turn out, at full strength. */
export const NEW_VOTER_DROP = 0.35;

/** Bloc sizes after any widening of the vote at this election, and which. */
export function widenElectorate(election: number, sizes: readonly number[], fresh: readonly number[]): { sizes: number[]; fresh: number[]; suffrage: Suffrage | null } {
  const decayed = fresh.map((f) => f / 2);
  const event = SUFFRAGE.find((s) => s.election === election) ?? null;
  if (!event) return { sizes: [...sizes], fresh: decayed, suffrage: null };
  const total = sizes.reduce((a, b) => a + b, 0);
  const tilt = event.tilt ?? sizes.map((s) => s / total);
  const added = tilt.map((t) => t * event.added * total);
  const next = sizes.map((s, b) => s + added[b]!);
  // New voters' share of each bloc: the new arrivals plus what is left of earlier ones.
  return { sizes: next, fresh: next.map((s, b) => clamp((decayed[b]! * sizes[b]! + added[b]!) / s, 0, 1)), suffrage: event };
}

export interface TurnoutInput {
  /** Bloc shares of the electorate. */
  shares: readonly number[];
  fresh: readonly number[];
  /** The 14 named parties' ideology, and last election's national support (15 entries). */
  ideology: readonly number[];
  lastSupport: readonly number[];
  potusIdeology: number;
  performance: number;
  descriptor: string;
}

/** Each bloc's turnout this election. */
export function blocTurnout(input: TurnoutInput, ctx: Context): Turnout {
  const sorted = [...input.lastSupport].sort((a, b) => b - a);
  // A close race last time brings people out: up to 7.5 points for a dead heat.
  const closeness = 0.3 * Math.max(0, 0.25 - (sorted[0]! - (sorted[1] ?? 0)));
  const badTerm = Math.min(1, Math.max(0, -input.performance) / 0.35);
  const blocs = BLOC_POSITIONS.slice(0, BLOC_COUNT).map((position, b) => {
    // How far the nearest party with support stands from the bloc.
    const nearest = Math.min(...input.ideology.map((score, p) => (input.lastSupport[p]! > 0 ? Math.abs(score - position) : Infinity)));
    const represented = nearest < 1 ? 0.05 : nearest > 3 ? -0.1 * Math.min(1, (nearest - 3) / 3) : 0;
    const presidentsSide = Math.abs(position - input.potusIdeology) < 2.5;
    const mood = presidentsSide
      ? (input.performance < 0 ? -0.12 * badTerm : 0.04) + (input.descriptor === 'Scandal' ? -0.04 : 0)
      : 0;
    const noise = (ctx.rng.next() * 2 - 1) * 0.04;
    return clamp((0.62 + closeness + represented + mood + noise) * (1 - NEW_VOTER_DROP * input.fresh[b]!), 0.3, 0.88);
  });
  const overall = blocs.reduce((total, t, b) => total + t * input.shares[b]!, 0) / input.shares.reduce((a, b) => a + b, 0);
  return { blocs, overall, fresh: [...input.fresh] };
}

/** Bloc shares weighted by each bloc's turnout relative to the whole electorate's, so only differences matter. */
export function sharesByTurnout(shares: readonly number[], turnout: Turnout): number[] {
  return shares.map((share, b) => (turnout.overall > 0 ? share * turnout.blocs[b]! / turnout.overall : share));
}

/** No new voters yet. */
export const NO_FRESH: readonly number[] = new Array<number>(BLOC_COUNT).fill(0);

