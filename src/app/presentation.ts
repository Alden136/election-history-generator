import { ELECTIONS, PARTIES, STATES } from '../engine/data';
import turnout from '../../data/turnout.json';
import { RULES, type Rule } from '../engine/rules';
import type { Dials, Term } from '../engine/types';
import { CHARISMA_STEP, EXPERIENCE_STEP, HOME_STATE_BONUS, INCUMBENT_EDGE, type Nominee } from '../engine/candidates';
import type { Fight, Primary, Wing } from '../engine/primaries';
import type { Departure, Succession } from '../engine/succession';
import { popularWeight } from '../engine/popularVote';
import { electoralTotals } from '../engine/states';
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

/** Midterm years: two years after every presidential election but the last (1794 to 2062). */
export const MIDTERM_YEARS: readonly number[] = ELECTIONS.slice(0, -1).map((election) => election + 2);
export const isMidtermYear = (year: number) => MIDTERM_YEARS.includes(year);
const ALL_YEARS: readonly number[] = [...ELECTIONS, ...MIDTERM_YEARS].sort((a, b) => a - b);
/** Every election year in order: the presidential ones, plus the midterms when they are on. */
export const electionYears = (midterms: boolean): readonly number[] => (midterms ? ALL_YEARS : ELECTIONS);
/** The presidential election a year belongs to: itself, or the one two years before a midterm. */
export const presidentialYear = (year: number) => (isMidtermYear(year) ? year - 2 : year);

export interface TimelineLocation {
  seed: number;
  year: number;
  corrections: readonly Rule[];
  dials: Dials;
  /** Midterm elections, an addition that is on unless the link says midterms=0. */
  midterms: boolean;
  /** Candidate traits, an addition that is on unless the link says traits=0. */
  traits: boolean;
  /** Primaries, an addition that is on unless the link says primaries=0. They only run with candidate traits on. */
  primaries: boolean;
  /** Running mates and succession, an addition that is on unless the link says vp=0. They only run with candidate traits on. */
  runningMates: boolean;
  /** The state-by-state popular vote, an addition that is on unless the link says pv=0. */
  popularVote: boolean;
  /** Spoiler candidates, an addition that is on unless the link says spoilers=0. They only run with primaries on. */
  spoilers: boolean;
}

export function readLocation(search: string): TimelineLocation {
  const params = new URLSearchParams(search);
  const seed = parseSeed(params.get('seed') ?? '');
  const year = Number(params.get('year'));
  // No rules in the address means the default, Corrected; Faithful is written as rules=none.
  const rules = params.get('rules');
  const selected = new Set(rules === null ? RULES : rules.split(','));
  const midterms = params.get('midterms') !== '0';
  return {
    seed: seed ?? DEFAULT_SEED,
    // A midterm year opens that midterm when midterms are on, or the election before it when they are off.
    year: ELECTIONS.includes(year) || (midterms && isMidtermYear(year)) ? year : isMidtermYear(year) ? year - 2 : DEFAULT_YEAR,
    corrections: RULES.filter((rule) => selected.has(rule)),
    dials: parseDials(params.get('dials')),
    midterms,
    traits: params.get('traits') !== '0',
    primaries: params.get('primaries') !== '0',
    runningMates: params.get('vp') !== '0',
    popularVote: params.get('pv') !== '0',
    spoilers: params.get('spoilers') !== '0',
  };
}

export function timelineUrl(href: string, { seed, year, corrections, dials, midterms, traits, primaries, runningMates, popularVote, spoilers }: TimelineLocation): URL {
  const url = new URL(href);
  url.searchParams.set('seed', String(seed));
  url.searchParams.set('year', String(year));
  const selected = RULES.filter((rule) => corrections.includes(rule));
  if (selected.length === RULES.length) url.searchParams.delete('rules');
  else url.searchParams.set('rules', selected.length ? selected.join(',') : 'none');
  const adjusted = encodeDials(dials);
  if (adjusted) url.searchParams.set('dials', adjusted);
  else url.searchParams.delete('dials');
  // On is the default, so only "off" is written into the link.
  if (midterms) url.searchParams.delete('midterms');
  else url.searchParams.set('midterms', '0');
  if (traits) url.searchParams.delete('traits');
  else url.searchParams.set('traits', '0');
  if (primaries) url.searchParams.delete('primaries');
  else url.searchParams.set('primaries', '0');
  if (runningMates) url.searchParams.delete('vp');
  else url.searchParams.set('vp', '0');
  if (popularVote) url.searchParams.delete('pv');
  else url.searchParams.set('pv', '0');
  if (spoilers) url.searchParams.delete('spoilers');
  else url.searchParams.set('spoilers', '0');
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
      : term.popularVote ? term.popularVote[index]! : (term.electoral[index]! + 2 * term.support[index]!) / 3,
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
  const scale = term.index === 0 || real === 0 ? 1 : liveElectoralVotes / real;
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

/** The additions switched on, in words: "midterm elections, candidate traits and primaries". Primaries and running mates count only with traits. */
export function additionsText(midterms: boolean, traits: boolean, primaries = false, runningMates = false, popularVote = false, spoilers = false): string {
  const on = [midterms && 'midterm elections', traits && 'candidate traits', traits && primaries && 'primaries', traits && runningMates && 'running mates',
    popularVote && 'a state popular vote', traits && primaries && spoilers && 'spoiler candidates'].filter((item): item is string => Boolean(item));
  return on.length > 1 ? `${on.slice(0, -1).join(', ')} and ${on.at(-1)}` : on.join('');
}

/** Candidate traits in words. */
export const CHARISMA_LABELS: Record<number, string> = { [-2]: 'Wooden', [-1]: 'Stiff', 0: 'Steady', 1: 'Likable', 2: 'Magnetic' };
export const EXPERIENCE_LABELS = ['Newcomer', 'Seasoned', 'Veteran'] as const;

/** "Raises their party's national support by 5%." for a multiplier of 1.05; the change is relative to the party's own support. */
const supportEffect = (fraction: number) => fraction === 0 ? 'No effect on support.'
  : `${fraction > 0 ? 'Raises' : 'Lowers'} their party's national support by ${Math.round(Math.abs(fraction) * 1000) / 10}%.`;

/**
 * Each of a nominee's traits with the effect it has on the vote, for the
 * pop-ups on the trait tags. Appeal effects scale the party's own national
 * support before every party is rescaled to the same total.
 */
export function traitEffects(nominee: Nominee, primary?: Primary): { label: string; effect: string }[] {
  const traits: { label: string; effect: string }[] = [];
  if (nominee.home) {
    const state = STATES.find((s) => s.code === nominee.home)?.name ?? nominee.home;
    traits.push({ label: `From ${state}`, effect: `Home state. ${state} leans ${HOME_STATE_BONUS} points toward their party.` });
  }
  // Appeal effects are relative to the party's own support; every party is then rescaled to the same total.
  const charisma = CHARISMA_STEP * nominee.charisma;
  traits.push({ label: CHARISMA_LABELS[nominee.charisma]!, effect: `Charisma ${nominee.charisma > 0 ? '+' : ''}${nominee.charisma} of ±2. `
    + supportEffect(charisma) });
  const experience = EXPERIENCE_STEP * nominee.experience;
  traits.push({ label: EXPERIENCE_LABELS[nominee.experience]!, effect: `Experience ${nominee.experience} of 2. `
    + supportEffect(experience)
    + (nominee.incumbent ? ' A sitting president always counts as a veteran.' : '') });
  if (nominee.incumbent) traits.push({ label: 'Incumbent', effect: `The sitting president is running again. ${supportEffect(INCUMBENT_EDGE)}` });
  return primary ? [...traits, ...primaryEffects(primary)] : traits;
}

/** Wings and fights in words. */
export const WING_LABELS: Record<Wing, string> = { moderate: 'Moderate wing', ideologue: 'Ideologue wing' };
export const FIGHT_LABELS: Record<Fight, string> = { unopposed: 'Unopposed', easy: 'Easy primary', contested: 'Contested primary', bitter: 'Bitter primary' };

/** The primary vote as a score, winner first: "52–48". */
export function primaryScore(primary: Primary): string {
  const won = Math.round(primary.share * 100);
  return `${won}–${100 - won}`;
}

/** The nominee's wing and how their primary went, with what each does, for the tag pop-ups. */
export function primaryEffects(primary: Primary): { label: string; effect: string }[] {
  const winner = primary.contenders[primary.winner]!;
  const loser = primary.contenders.find((_, i) => i !== primary.winner);
  if (!loser) return [{ label: FIGHT_LABELS.unopposed, effect: 'Renominated without a primary challenge. No cost to support.' }];
  const cost = primary.cost ? supportEffect(-primary.cost) : 'No cost to support.';
  const fight = primary.fight === 'bitter'
    ? `Won ${primaryScore(primary)} against a rival wing ${Math.abs(winner.position - loser.position).toFixed(1)} points away. ${cost}`
    : `Won ${primaryScore(primary)}. ${cost}`;
  return [
    { label: WING_LABELS[winner.wing], effect: `Ran from the party's ${winner.wing} wing at ${signed(winner.position)}. Voters see this position, `
      + 'a winning president governs from it, and the party moves toward it.' },
    { label: FIGHT_LABELS[primary.fight], effect: fight + (loser.incumbent ? ' Denied the sitting president renomination.' : '') },
  ];
}

/** How a president left office early, in words. */
export const DEPARTURE_LABELS: Record<Departure, string> = { death: 'Died in office', assassination: 'Assassinated', resignation: 'Resigned' };

/** "Died in office in 1841; John Tyler took over" */
export function successionText(succession: Succession): string {
  return `${DEPARTURE_LABELS[succession.cause]} in ${succession.year}; ${succession.successor} took over`;
}

/** The party that won the most votes nationally, when the state popular vote is on. */
export function popularVoteLeader(term: Term): number | null {
  return term.popularVote ? term.popularVote.indexOf(Math.max(...term.popularVote)) : null;
}

/** The two leading parties in a state, with the margin: "Union 54.2%, Whig 41.0% · won by 13.2 points". Null without vote shares. */
export function stateVoteText(term: Term, state: number): string | null {
  const shares = term.grid.voteShares?.[state];
  if (!shares?.length) return null;
  const [first, second] = shares.map((share, party) => ({ share, party })).sort((a, b) => b.share - a.share);
  const top = [first, second].filter((entry) => entry && entry.share > 0).map((entry) => `${PARTIES[entry!.party]!.name} ${percent(entry!.share)}`);
  return `${top.join(', ')} · won by ${((first!.share - (second?.share ?? 0)) * 100).toFixed(1)} points`;
}

export interface StateVoteRow {
  party: number;
  /** The party's nominee, when candidate traits are on. */
  candidate: string | null;
  share: number;
  /** Estimated votes, on the same scale as the national counts. */
  votes: number;
}

/**
 * How many votes each party's candidate won in a state, most first. Counts are
 * estimates: the national estimate (real turnout for the year) split between
 * the states by the same weight the national vote uses, so the states add up
 * to the national totals. Null without the state popular vote.
 */
export function stateVotes(term: Term, state: number): { cast: number; rows: StateVoteRow[] } | null {
  const all = term.grid.voteShares;
  const shares = all?.[state];
  if (!all || !shares?.length) return null;
  const weight = all.reduce((total, s, i) => total + (s.length ? popularWeight(term.grid.votes[i]!) : 0), 0);
  const cast = estimatedVotes(term, 1, electoralTotals(term.grid).live) * popularWeight(term.grid.votes[state]!) / weight;
  const rows = shares.map((share, party) => ({
    party, share, votes: share * cast, candidate: term.nominees?.find((nominee) => nominee.party === party)?.name ?? null,
  })).filter((row) => row.share > 0).sort((a, b) => b.share - a.share);
  return { cast, rows };
}
