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

/** Party colors, deep enough to read on the concrete-grey page. Same hues as before. */
export const PARTY_COLORS = [
  '#e0832a', '#8a63d2', '#c2468f', '#2f6fd6', '#c9a20f', '#d64541', '#7f9f2f',
  '#5f6f8f', '#b955b4', '#4e9338', '#16a085', '#a8160f', '#e6bf3a', '#1f4ea8', '#8b8f94',
] as const;

export const BLOC_COLORS = ['#c2185b', '#7e57c2', '#2f6fd6', '#6d6a64', '#16a085', '#c9a20f', '#d64541'];
export const NO_VOTE_COLOR = '#a6a29a';
export const SECEDED_COLOR = '#6d6a64';

/** Black or white text, whichever reads better on a fill color. */
export function inkOn(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [number, number, number];
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.2 ? '#111111' : '#f4f2ee';
}
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

/** Estimated popular votes for a share of the vote in an election. */
export function estimatedVotes(term: Term, share: number, liveElectoralVotes: number): number {
  const real = realElectoralVotes(term.election);
  // 1792 has no electoral vote counts in the simulation, so it is not scaled.
  const scale = liveElectoralVotes > 0 && real > 0 ? liveElectoralVotes / real : 1;
  return share * realTotalVotes(term.election) * scale;
}

/** Estimated popular votes for the winner of an election. */
export const estimatedWinnerVotes = (term: Term, liveElectoralVotes: number): number =>
  estimatedVotes(term, term.winnerPopularShare, liveElectoralVotes);

/** "72.0M", "6.43M", "850K" or "8,600": short enough for a table column. */
export function compactCount(votes: number): string {
  if (votes >= 1e6) return `${(votes / 1e6).toFixed(votes >= 1e7 ? 1 : 2)}M`;
  if (votes >= 1e4) return `${Math.round(votes / 1e3)}K`;
  return (Math.round(votes / 10) * 10).toLocaleString('en-US');
}

/** "68.4 million", "1.2 million" or "28,600": rounded to what an estimate can claim. */
export function approximateCount(votes: number): string {
  if (votes >= 1e6) return `${(votes / 1e6).toFixed(votes >= 1e7 ? 1 : 2)} million`;
  const rounded = votes >= 1e4 ? Math.round(votes / 100) * 100 : Math.round(votes / 10) * 10;
  return rounded.toLocaleString('en-US');
}
