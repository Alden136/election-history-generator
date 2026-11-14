import { ELECTIONS, PARTIES, STATES } from '../engine/data';
import turnout from '../../data/turnout.json';
import { RULES, type Rule } from '../engine/rules';
import type { Dials, Term } from '../engine/types';
import { encodeDials, parseDials } from './dials';

export const DEFAULT_SEED = 42;
export const DEFAULT_YEAR = 2024;
export const MAX_SEED = 0xffffffff;

export function parseSeed(value: string): number | null {
  const digits = value.trim();
  if (!/^\d+$/.test(digits)) return null;
  const seed = Number(digits);
  return Number.isSafeInteger(seed) && seed <= MAX_SEED ? seed : null;
}

export interface TimelineLocation {
  seed: number;
  year: number;
  corrections: readonly Rule[];
  dials: Dials;
}

export function readLocation(search: string): TimelineLocation {
  const params = new URLSearchParams(search);
  const seed = parseSeed(params.get('seed') ?? '');
  const year = Number(params.get('year'));
  // No rules in the address means the default, Corrected; Faithful is written as rules=none.
  const rules = params.get('rules');
  const selected = new Set(rules === null ? RULES : rules.split(','));
  return {
    seed: seed ?? DEFAULT_SEED,
    year: ELECTIONS.includes(year) ? year : DEFAULT_YEAR,
    corrections: RULES.filter((rule) => selected.has(rule)),
    dials: parseDials(params.get('dials')),
  };
}

export function timelineUrl(href: string, { seed, year, corrections, dials }: TimelineLocation): URL {
  const url = new URL(href);
  url.searchParams.set('seed', String(seed));
  url.searchParams.set('year', String(year));
  const selected = RULES.filter((rule) => corrections.includes(rule));
  if (selected.length === RULES.length) url.searchParams.delete('rules');
  else url.searchParams.set('rules', selected.length ? selected.join(',') : 'none');
  const adjusted = encodeDials(dials);
  if (adjusted) url.searchParams.set('dials', adjusted);
  else url.searchParams.delete('dials');
  return url;
}

export const PARTY_COLORS = [
  '#eda661', '#b49ae8', '#d785b5', '#83aeff', '#dfc46f', '#ed8f91', '#b7cc89',
  '#a2adc7', '#e7a1e3', '#92c779', '#77d7bd', '#f56d67', '#f0db9a', '#629bec', '#c0c9d1',
] as const;

export const BLOC_COLORS = ['#ec83a8', '#ba9af2', '#87afff', '#a8b3c5', '#75d4bc', '#e1c16d', '#ed8f91'];
export const NO_VOTE_COLOR = '#536275';
export const SECEDED_COLOR = '#b6a0c7';
export const percent = (share: number) => `${(share * 100).toFixed(1)}%`;
export const signed = (value: number) => `${value > 0 ? '+' : ''}${value.toFixed(2)}`;

export function partyResults(term: Term) {
  return PARTIES.map((party, index) => ({
    index,
    name: party.name,
    electoral: term.electoral[index]!,
    support: term.support[index]!,
    // The founding row has a fixed winner share and no opposing popular tally.
    popular: term.index === 0
      ? term.winnerParty === index ? term.winnerPopularShare : null
      : (term.electoral[index]! + 2 * term.support[index]!) / 3,
    ideology: term.shownIdeology[index]!,
    won: term.winnerParty === index,
  })).filter((p) => p.won || p.electoral > 0 || p.support > 0)
    .sort((a, b) => Number(b.won) - Number(a.won) || b.electoral - a.electoral || b.support - a.support);
}

export function ideologyChartBounds(values: readonly number[]) {
  return {
    min: Math.min(-10, 5 * Math.floor(Math.min(0, ...values) / 5)),
    max: Math.max(10, 5 * Math.ceil(Math.max(0, ...values) / 5)),
  };
}

export function decidedByCongress(term: Term): boolean {
  return term.index > 0 && Math.max(...term.electoral) <= 0.5;
}

/**
 * Real popular-vote totals. The simulation only produces vote shares, so a
 * vote count is an estimate: the real total for that year, scaled by this
 * timeline's electoral votes against the real ones, so annexed or seceded
 * states count. Years after 2024 are projected; see data/turnout.json.
 */
const REAL_STATES = STATES.slice(0, STATES.findIndex((state) => state.code === 'DC') + 1);
const realTotalVotes = (year: number): number => {
  const recorded = turnout.votes[String(year) as keyof typeof turnout.votes];
  if (recorded !== undefined) return recorded;
  const base = turnout.votes[String(turnout.projectionStart) as keyof typeof turnout.votes];
  return base * (1 + turnout.projectionGrowthPerYear) ** (year - turnout.projectionStart);
};
const realElectoralVotes = (year: number): number =>
  REAL_STATES.reduce((total, state) => total + (state.realElectoralVotes[year] ?? 0), 0);

/** Estimated popular votes for the winner of an election. */
export function estimatedWinnerVotes(term: Term, liveElectoralVotes: number): number {
  const real = realElectoralVotes(term.election);
  // 1792 has no electoral vote counts in the simulation, so it is not scaled.
  const scale = liveElectoralVotes > 0 && real > 0 ? liveElectoralVotes / real : 1;
  return term.winnerPopularShare * realTotalVotes(term.election) * scale;
}

/** "68.4 million", "1.2 million" or "28,600": rounded to what an estimate can claim. */
export function approximateCount(votes: number): string {
  if (votes >= 1e6) return `${(votes / 1e6).toFixed(votes >= 1e7 ? 1 : 2)} million`;
  const rounded = votes >= 1e4 ? Math.round(votes / 100) * 100 : Math.round(votes / 10) * 10;
  return rounded.toLocaleString('en-US');
}
