/**
 * The written history: the timeline told as a short story, one chapter per
 * forty years. Every sentence comes from a fixed pattern filled in with facts
 * taken from the timeline (see `chapterFacts`), so the same seed always gives
 * the same text and the story never claims something the timeline does not show.
 * Display only; nothing here feeds back into the simulation.
 */
import { partyName } from '../engine/data';
import type { Timeline } from '../engine/simulate';
import { SECEDED, type Expansions, type Term } from '../engine/types';
import { ordinal, presidencies, type Presidency } from './profiles';
import { TERRITORIES, TERRITORY_NAMES } from './timelineFinder';

/** Terms per chapter: ten four-year terms, forty years. */
export const CHAPTER_TERMS = 10;

export interface ChapterFacts {
  from: number;
  to: number;
  /** Presidencies with at least one term in the chapter, in order. */
  presidents: Presidency[];
  /** Years each party held the presidency within the chapter, most first. */
  partyYears: { party: number; years: number }[];
  /** Elections whose winner took office in this chapter. */
  elections: number[];
  /** Elections the party in the White House lost. */
  changes: number[];
  /** Elections Congress decided because no party won a majority of the Electoral College. */
  contingent: number[];
  /** The winner's largest and smallest Electoral College share, among elections decided by the voters. */
  landslide: { election: number; name: string; party: number; share: number } | null;
  closest: { election: number; name: string; party: number; share: number } | null;
  /** Parties that first had national support in this chapter, with that election. */
  rose: { party: number; election: number }[];
  /** Parties whose last election with national support fell in this chapter (none in the last chapter). */
  fell: { party: number; election: number }[];
  /** Terms that began in civil war or chaos. */
  civilWars: { began: number; president: string }[];
  chaos: { began: number; president: string }[];
  /** Dictatorships: unbroken runs of DICTATORSHIP terms under one president. */
  dictatorships: { name: string; party: number; from: number; to: number }[];
  /** The most states sitting out an election as seceded, and the first election it happened. */
  secession: { states: number; election: number } | null;
  /** Territories gained or lost, by the election in which the change shows. */
  territory: { election: number; joined: (keyof Expansions)[]; left: (keyof Expansions)[] }[];
  /** How many terms had each event, most first; empty events are left out. */
  events: { event: string; count: number }[];
}

export interface StoryChapter {
  from: number;
  to: number;
  title: string;
  paragraphs: string[];
  facts: ChapterFacts;
}

export interface Story {
  intro: string;
  chapters: StoryChapter[];
  ending: string;
}

/* ------------------------------------------------------------------ facts */

type ServedTerm = { began: number; president: string; party: number; event: string };

function servedTerms(timeline: Timeline): ServedTerm[] {
  const { terms, finalPresident } = timeline;
  return [
    ...terms.map((term) => ({ began: term.termBegan, president: term.president, party: term.potusParty, event: term.descriptor })),
    { began: finalPresident.termBegan, president: finalPresident.name, party: finalPresident.party, event: finalPresident.descriptor },
  ];
}

const active = (term: Term, party: number) => (term.support[party] ?? 0) > 0;

export function chapterFacts(timeline: Timeline, chapter: number): ChapterFacts {
  const { terms } = timeline;
  const served = servedTerms(timeline);
  const first = chapter * CHAPTER_TERMS;
  const inChapter = served.slice(first, first + CHAPTER_TERMS);
  const from = inChapter[0]!.began;
  const to = inChapter.at(-1)!.began + 4;
  const list = presidencies(terms, timeline.finalPresident);
  const presidents = list.filter((p) => p.terms.some((t) => t.began >= from && t.began < to));

  const years = new Map<number, number>();
  for (const term of inChapter) years.set(term.party, (years.get(term.party) ?? 0) + 4);
  const partyYears = Array.from(years, ([party, y]) => ({ party, years: y })).sort((a, b) => b.years - a.years || a.party - b.party);

  // The election before each term in the chapter put that term's president in office (1789 had none).
  const electionRows = terms.filter((_, k) => k + 1 >= first && k + 1 < first + CHAPTER_TERMS);
  const decidedByVoters = electionRows.filter((t) => t.index > 0 && Math.max(...t.electoral) > 0.5);
  const pick = (better: (a: Term, b: Term) => boolean) => {
    const best = decidedByVoters.reduce<Term | null>((a, b) => (a === null || better(b, a) ? b : a), null);
    return best && { election: best.election, name: best.winnerName, party: best.winnerParty, share: best.winnerElectoralShare };
  };

  const rose: ChapterFacts['rose'] = [];
  const fell: ChapterFacts['fell'] = [];
  const lastChapter = first + CHAPTER_TERMS >= served.length;
  for (let party = 0; party < (terms[0]?.support.length ?? 0); party++) {
    const firstActive = terms.find((t) => active(t, party));
    const lastActive = [...terms].reverse().find((t) => active(t, party));
    if (firstActive && electionRows.includes(firstActive)) rose.push({ party, election: firstActive.election });
    if (!lastChapter && lastActive && electionRows.includes(lastActive) && lastActive !== terms.at(-1)) fell.push({ party, election: lastActive.election });
  }

  const dictatorships: ChapterFacts['dictatorships'] = [];
  for (const term of inChapter) {
    if (term.event !== 'DICTATORSHIP') continue;
    const last = dictatorships.at(-1);
    if (last && last.name === term.president && last.to === term.began) last.to = term.began + 4;
    else dictatorships.push({ name: term.president, party: term.party, from: term.began, to: term.began + 4 });
  }

  let secession: ChapterFacts['secession'] = null;
  for (const term of electionRows) {
    const states = term.grid.winners.filter((w) => w === SECEDED).length;
    if (states > 0 && (!secession || states > secession.states)) secession = { states, election: term.election };
  }

  const territory: ChapterFacts['territory'] = [];
  for (const term of electionRows) {
    const previous = terms[term.index - 1];
    if (!previous || !term.grid.expanded) continue;
    const joined = TERRITORIES.filter((t) => term.grid.expansions[t] && !previous.grid.expansions[t]);
    const left = TERRITORIES.filter((t) => !term.grid.expansions[t] && previous.grid.expansions[t]);
    if (joined.length || left.length) territory.push({ election: term.election, joined, left });
  }

  const counts = new Map<string, number>();
  // Civil war, chaos and dictatorship get their own sentences; "National Father" only marks Washington's terms.
  const special = new Set(['DICTATORSHIP', 'Civil War', 'Chaos', 'National Father']);
  for (const { event } of inChapter) if (event && !special.has(event)) counts.set(event, (counts.get(event) ?? 0) + 1);

  return {
    from, to, presidents, partyYears,
    elections: electionRows.map((t) => t.election),
    changes: electionRows.filter((t) => t.index > 0 && t.result === 'LOSS').map((t) => t.election),
    contingent: electionRows.filter((t) => t.index > 0 && Math.max(...t.electoral) <= 0.5).map((t) => t.election),
    landslide: pick((a, b) => a.winnerElectoralShare > b.winnerElectoralShare),
    closest: pick((a, b) => a.winnerElectoralShare < b.winnerElectoralShare),
    rose, fell,
    civilWars: inChapter.filter((t) => t.event === 'Civil War').map((t) => ({ began: t.began, president: t.president })),
    chaos: inChapter.filter((t) => t.event === 'Chaos').map((t) => ({ began: t.began, president: t.president })),
    dictatorships, secession, territory,
    events: Array.from(counts, ([event, count]) => ({ event, count })).sort((a, b) => b.count - a.count || a.event.localeCompare(b.event)),
  };
}

/* ------------------------------------------------------------------ words */

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const count = (n: number) => WORDS[n] ?? String(n);
const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
// A bare majority keeps a decimal, so 50.4% never reads as a tie.
const percent = (share: number) => share < 0.51 ? `${(share * 100).toFixed(1)}%` : `${Math.round(share * 100)}%`;
const times = (n: number) => n === 1 ? 'once' : n === 2 ? 'twice' : `${count(n)} times`;
const party = (index: number) => partyName(index);
/** "the Whig party", but "the Third Party". */
/** Several parties at once: "the Whig and Union parties", keeping "the Third Party" apart. */
function theParties(indexes: readonly number[]): string {
  if (indexes.length === 1) return theParty(indexes[0]!);
  const named = indexes.filter((i) => partyName(i) !== 'Third Party').map(partyName);
  const third = indexes.some((i) => partyName(i) === 'Third Party');
  const group = named.length === 1 ? `the ${named[0]} party` : named.length ? `the ${list(named)} parties` : '';
  return third ? list([group, 'the Third Party'].filter(Boolean)) : group;
}
/** Group items by year, in year order. */
function byYear<T>(items: readonly T[], year: (item: T) => number): [number, T[]][] {
  const groups = new Map<number, T[]>();
  for (const item of [...items].sort((a, b) => year(a) - year(b))) groups.set(year(item), [...(groups.get(year(item)) ?? []), item]);
  return [...groups];
}
const theParty = (index: number) => partyName(index) === 'Third Party' ? 'the Third Party' : `the ${partyName(index)} party`;

/** "A", "A and B", "A, B and C". */
export function list(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

/** Each term event as a phrase: [one, several]. */
const EVENT_PHRASES: Record<string, [string, string]> = {
  'Economic Boom': ['an economic boom', 'economic booms'],
  'War Win': ['a war won', 'wars won'],
  'Major War Win': ['a major war won', 'major wars won'],
  'Good Feelings': ['a term of good feelings', 'terms of good feelings'],
  'Solved Crisis': ['a crisis solved', 'crises solved'],
  'Recession': ['a recession', 'recessions'],
  'Scandal': ['a scandal', 'scandals'],
  'Depression': ['a depression', 'depressions'],
  'Lost War': ['a war lost', 'wars lost'],
  'Major War Loss': ['a major war lost', 'major wars lost'],
  'Riots': ['a term of riots', 'terms of riots'],
};
const eventPhrase = ({ event, count: n }: { event: string; count: number }) => {
  const [one, many] = EVENT_PHRASES[event] ?? [event.toLowerCase(), `${event.toLowerCase()} terms`];
  return n === 1 ? one : `${count(n)} ${many}`;
};

const years = (from: number, to: number) => `${from}–${to}`;
/** Territory names as they read inside a sentence. */
const placeName = (territory: keyof Expansions) =>
  territory === 'west' ? 'the western states' : territory === 'mexico' ? 'northern Mexico' : TERRITORY_NAMES[territory];

function titleFor(facts: ChapterFacts, previous: string | null): string {
  const options = titleOptions(facts);
  return options.find((title) => title !== previous) ?? options[0]!;
}

/** Possible titles for a chapter, best first. */
function titleOptions(facts: ChapterFacts): string[] {
  const options: string[] = [];
  const [top, second] = facts.partyYears;
  if (facts.civilWars.length) options.push('War at home');
  if (facts.dictatorships.length) {
    const longest = [...facts.dictatorships].sort((a, b) => (b.to - b.from) - (a.to - a.from))[0]!;
    options.push(`The rule of ${longest.name}`);
  }
  if (facts.secession) options.push('A country split');
  if (facts.territory.flatMap((t) => t.joined).length >= 2) options.push('A growing country');
  if (top && top.years >= 32) options.push(`The ${party(top.party)} years`);
  if (facts.changes.length >= 6) options.push('Years of upheaval');
  if (top && second) options.push(`${party(top.party)} and ${party(second.party)}`);
  if (top) options.push(`The ${party(top.party)} years`);
  options.push(`${facts.from} to ${facts.to}`);
  return options;
}

/* ------------------------------------------------------------------ chapters */

function governing(facts: ChapterFacts): string {
  const span = facts.to - facts.from;
  const sentences: string[] = [];
  const [top, second] = facts.partyYears;
  if (facts.presidents.length === 1) {
    const p = facts.presidents[0]!;
    sentences.push(`${p.name} held the presidency through all ${span} years, under the ${list(p.parties.map(party))} banner.`);
  } else {
    sentences.push(`${capital(count(facts.presidents.length))} presidents served between ${facts.from} and ${facts.to}.`);
    if (top && top.years === span) sentences.push(`All of them came from ${theParty(top.party)}.`);
    else if (top) {
      sentences.push(`${capital(theParty(top.party))} held the White House for ${top.years} of the ${span} years${second
        ? `, ${theParty(second.party)} for ${second.years}` : ''}${facts.partyYears.length > 2 ? ` and ${count(facts.partyYears.length - 2)} other ${facts.partyYears.length === 3 ? 'party' : 'parties'} for the rest` : ''}.`);
    }
    const named = facts.presidents.map((p) => `${p.name} (${list(p.parties.map(party))}, ${years(p.from, p.to)})`);
    if (named.length <= 5) sentences.push(`In order, they were ${list(named)}.`);
    else {
      const longest = [...facts.presidents].sort((a, b) => (b.to - b.from) - (a.to - a.from) || a.number - b.number)[0]!;
      sentences.push(`The era opened with ${named[0]} and closed with ${named.at(-1)}. The longest in office was ${longest.name}, the ${ordinal(longest.number)} president, at ${longest.to - longest.from} years.`);
    }
  }
  return sentences.join(' ');
}

function elections(facts: ChapterFacts): string | null {
  if (!facts.elections.length) return null;
  const real = facts.elections.filter((e) => e > 1792);
  const sentences: string[] = [];
  if (!real.length) {
    sentences.push('The only election was the founding one, which had no real contest.');
  } else if (!facts.changes.length) {
    sentences.push(`The governing party never lost the White House in the ${count(real.length)} ${real.length === 1 ? 'election' : 'elections'} of these years.`);
  } else {
    sentences.push(`The White House changed parties ${times(facts.changes.length)}, in ${list(facts.changes.map(String))}.`);
  }
  if (facts.contingent.length) {
    sentences.push(`No party won a majority of the Electoral College in ${list(facts.contingent.map(String))}, so Congress chose the president.`);
  }
  if (facts.landslide && facts.closest && facts.landslide.election !== facts.closest.election) {
    sentences.push(`The biggest win came in ${facts.landslide.election}, when ${facts.landslide.name} (${party(facts.landslide.party)}) took ${percent(facts.landslide.share)} of the Electoral College; the narrowest was ${facts.closest.election}, won by ${facts.closest.name} with ${percent(facts.closest.share)}.`);
  } else if (facts.landslide) {
    sentences.push(`${facts.landslide.name} (${party(facts.landslide.party)}) took ${percent(facts.landslide.share)} of the Electoral College in ${facts.landslide.election}.`);
  }
  return sentences.join(' ');
}

function parties(facts: ChapterFacts): string | null {
  const sentences: string[] = [];
  const founding = facts.rose.filter((r) => r.election === 1792);
  const later = facts.rose.filter((r) => r.election !== 1792);
  if (founding.length) sentences.push(`The ${list(founding.map((r) => party(r.party)))} ${founding.length === 1 ? 'party' : 'parties'} contested the first election.`);
  for (const [year, group] of byYear(later, (r) => r.election)) {
    sentences.push(`${capital(theParties(group.map((r) => r.party)))} first won national support in ${year}.`);
  }
  if (facts.fell.length) {
    const fell = byYear(facts.fell, (f) => f.election).map(([year, group]) => `${theParties(group.map((f) => f.party))} after ${year}`);
    sentences.push(`${capital(list(fell))} never won national support again.`);
  }
  return sentences.length ? sentences.join(' ') : null;
}

function upheavals(facts: ChapterFacts): string | null {
  const sentences: string[] = [];
  if (facts.civilWars.length) {
    sentences.push(facts.civilWars.length === 1
      ? `Civil war broke out in the term that began in ${facts.civilWars[0]!.began}, under ${facts.civilWars[0]!.president}.`
      : `Civil war ran through the terms that began in ${list(facts.civilWars.map((c) => `${c.began} (${c.president})`))}.`);
  }
  if (facts.chaos.length) {
    sentences.push(`The ${facts.chaos.length === 1 ? 'term' : 'terms'} that began in ${list(facts.chaos.map((c) => String(c.began)))} collapsed into chaos.`);
  }
  if (facts.secession) {
    sentences.push(facts.secession.states === 1
      ? `One state seceded and sat out the ${facts.secession.election} election.`
      : `At the worst point, ${count(facts.secession.states)} states had seceded and sat out the ${facts.secession.election} election.`);
  }
  for (const d of facts.dictatorships) {
    sentences.push(`${d.name} of ${theParty(d.party)} ruled as a dictator from ${d.from} to ${d.to}.`);
  }
  for (const t of facts.territory) {
    const joined = t.joined.filter((x) => x !== 'westVirginia').map(placeName);
    if (joined.length) sentences.push(`${capital(list(joined))} ${joined.length === 1 ? 'had' : joined.length === 2 ? 'had both' : 'had all'} joined the country by the ${t.election} election.`);
    if (t.joined.includes('westVirginia')) sentences.push(`West Virginia split from Virginia before the ${t.election} election.`);
    const left = t.left.map(placeName);
    if (left.length) sentences.push(`${capital(list(left))} ${left.length === 1 && !left[0]!.endsWith('states') ? 'was' : 'were'} no longer part of the country by ${t.election}.`);
  }
  if (facts.events.length) {
    const shown = facts.events.slice(0, 4).map(eventPhrase);
    sentences.push(`${capital(sentences.length ? 'Otherwise, the' : 'The')} years brought ${list(shown)}.`);
  } else if (!sentences.length) {
    sentences.push('No president faced a major event.');
  }
  return sentences.join(' ');
}

export function writeStory(timeline: Timeline, rules: string): Story {
  const chapterCount = Math.ceil(servedTerms(timeline).length / CHAPTER_TERMS);
  const chapters: StoryChapter[] = [];
  for (let c = 0; c < chapterCount; c++) {
    const facts = chapterFacts(timeline, c);
    const paragraphs = [governing(facts), elections(facts), parties(facts), upheavals(facts)].filter((p): p is string => Boolean(p));
    chapters.push({ from: facts.from, to: facts.to, title: titleFor(facts, chapters.at(-1)?.title ?? null), paragraphs, facts });
  }
  const { summary, terms, finalPresident, seed } = timeline;
  const intro = `This is the history of seed ${seed} under ${rules}. Across ${terms.length} elections from ${terms[0]!.election} to ${terms.at(-1)!.election}, `
    + `${count(summary.governingParties)} ${summary.governingParties === 1 ? 'party' : 'parties'} held the presidency. `
    + `It scores ${summary.weirdness} on the weirdness scale, which counts as ${summary.weirdnessLabel.toLowerCase()}`
    + `${summary.civilWars || summary.dictatorships ? `, with ${list([
      ...(summary.civilWars ? [`${count(summary.civilWars)} ${summary.civilWars === 1 ? 'term' : 'terms'} of civil war`] : []),
      ...(summary.dictatorships ? [`${count(summary.dictatorships)} ${summary.dictatorships === 1 ? 'term' : 'terms'} of dictatorship`] : []),
    ])}` : ''}.`;
  const ending = `In ${finalPresident.termBegan}, ${finalPresident.name} of ${theParty(finalPresident.party)} was inaugurated, and the record ends there.`;
  return { intro, chapters, ending };
}

/** The story as plain text, for the download. */
export function storyText(story: Story, heading: string): string {
  const lines = [heading, '', story.intro, ''];
  for (const chapter of story.chapters) {
    lines.push(`${years(chapter.from, chapter.to)}: ${chapter.title}`, '', ...chapter.paragraphs.flatMap((p) => [p, '']));
  }
  lines.push(story.ending, '');
  return lines.join('\n');
}
