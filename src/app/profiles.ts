/**
 * Presidents and parties across a whole timeline: a numbered list of
 * presidencies and a record for every party that took part.
 * Display only; nothing here feeds back into the simulation.
 */
import type { FinalPresident } from '../engine/summary';
import type { Departure } from '../engine/succession';
import type { Term } from '../engine/types';

/** One four-year term served by a president. */
export interface ServedTerm {
  began: number;
  party: number;
  ideology: number;
  /** Term event, '' for none. */
  event: string;
  /** Null for the 2065 term, which the simulation does not score. */
  dayOneApproval: number | null;
  electionDayApproval: number | null;
  /** The election that won this term; null for the founding term that began in 1789 and for a vice president who took over. */
  electedIn: number | null;
  /** The year this stretch ended: four years on, or earlier when the president left office. */
  end: number;
  /** Set when the president left office before the term was up. */
  left?: { year: number; cause: Departure };
  /** Set when a vice president took over: whom they replaced and why. */
  tookOver?: { from: string; cause: Departure };
}

/** An unbroken stretch in office, numbered like real presidencies (a return later counts again). */
export interface Presidency {
  /** 1 for the first president. */
  number: number;
  name: string;
  /** Parties in the order the president served under them; more than one after a switch. */
  parties: number[];
  from: number;
  /** The year the last term ended; the 2065 term runs to 2069. */
  to: number;
  terms: ServedTerm[];
  /** Other presidencies by someone of the same name. */
  alsoServed: number[];
  /** True when still in office as the simulation ends. */
  last: boolean;
  /** Set when this presidency began with a vice president taking over. */
  tookOver?: { from: string; cause: Departure };
  /** Set when this presidency ended with the president leaving office early. */
  left?: { year: number; cause: Departure };
}

type ProfileTerm = Pick<Term,
  'election' | 'termBegan' | 'president' | 'potusParty' | 'potusIdeology' | 'descriptor' | 'dayOneApproval' |
  'electionDayApproval' | 'winnerParty' | 'support' | 'shownIdeology' | 'congressLeader'
> & Partial<Pick<Term, 'succession'>> & { grid: Pick<Term['grid'], 'winners'> };

export function presidencies(terms: readonly ProfileTerm[], final: FinalPresident): Presidency[] {
  const served: (ServedTerm & { name: string })[] = terms.flatMap((term, k): (ServedTerm & { name: string })[] => {
    const elected: ServedTerm & { name: string } = {
      name: term.president,
      began: term.termBegan,
      end: term.termBegan + 4,
      party: term.potusParty,
      ideology: term.potusIdeology,
      event: term.descriptor,
      dayOneApproval: term.dayOneApproval,
      electionDayApproval: term.electionDayApproval,
      electedIn: k > 0 ? terms[k - 1]!.election : null,
    };
    const s = term.succession;
    if (!s) return [elected];
    // The vice president serves out the term and faces its election-day approval.
    return [
      { ...elected, end: s.year, electionDayApproval: null, left: { year: s.year, cause: s.cause } },
      { ...elected, name: s.successor, began: s.year, party: s.party, dayOneApproval: null, electedIn: null,
        tookOver: { from: s.president, cause: s.cause } },
    ];
  });
  served.push({
    name: final.name, began: final.termBegan, end: final.termBegan + 4, party: final.party, ideology: final.ideology, event: final.descriptor,
    dayOneApproval: null, electionDayApproval: null, electedIn: terms.at(-1)?.election ?? null,
  });

  const list: Presidency[] = [];
  for (const { name, ...term } of served) {
    const current = list.at(-1);
    if (current?.name === name) {
      current.terms.push(term);
      current.to = term.end;
      current.left = term.left;
      if (current.parties.at(-1) !== term.party) current.parties.push(term.party);
    } else {
      list.push({ number: list.length + 1, name, parties: [term.party], from: term.began, to: term.end, terms: [term], alsoServed: [], last: false,
        ...(term.tookOver && { tookOver: term.tookOver }), ...(term.left && { left: term.left }) });
    }
  }
  list.at(-1)!.last = true;
  for (const presidency of list) {
    presidency.alsoServed = list.filter((other) => other.name === presidency.name && other !== presidency).map((other) => other.number);
  }
  return list;
}

/** The presidency serving in a term that began in `year`. */
export const presidencyAt = (list: readonly Presidency[], year: number): Presidency | undefined =>
  list.find((presidency) => presidency.terms.some((term) => term.began === year));

export interface PartyProfile {
  party: number;
  /** Stretches of elections in which the party had national support. */
  active: { from: number; to: number }[];
  /** Highest national support, and the first election it was reached. */
  peak: { support: number; election: number } | null;
  /** Elections the party won. */
  wins: number[];
  /** State wins added up over every election. */
  statesWon: number;
  /** Most states won in one election. */
  bestStates: { states: number; election: number } | null;
  /** Presidency numbers in which the president served under this party. */
  presidents: number[];
  /** Elections in which the party led Congress. */
  congressLeads: number;
  /** National support in every election, 0 when absent. */
  support: { election: number; value: number }[];
  /** Ideology as voters saw it, only in elections where the party had support. */
  ideology: { election: number; value: number }[];
}

export function partyProfiles(terms: readonly ProfileTerm[], list: readonly Presidency[], partyCount: number): PartyProfile[] {
  const profiles: PartyProfile[] = [];
  for (let party = 0; party < partyCount; party++) {
    const support = terms.map((term) => ({ election: term.election, value: term.support[party] ?? 0 }));
    const active: PartyProfile['active'] = [];
    support.forEach(({ election, value }, k) => {
      if (value <= 0) return;
      const last = active.at(-1);
      if (last && terms[k - 1]?.election === last.to) last.to = election;
      else active.push({ from: election, to: election });
    });
    const states = terms.map((term) => term.grid.winners.filter((winner) => winner === party).length);
    const statesWon = states.reduce((total, n) => total + n, 0);
    const best = Math.max(0, ...states);
    const peak = Math.max(0, ...support.map(({ value }) => value));
    const wins = terms.filter((term) => term.winnerParty === party).map((term) => term.election);
    const presidents = list.filter((presidency) => presidency.parties.includes(party)).map((presidency) => presidency.number);
    if (!active.length && !statesWon && !wins.length && !presidents.length) continue;
    profiles.push({
      party,
      active,
      peak: peak > 0 ? { support: peak, election: support.find(({ value }) => value === peak)!.election } : null,
      wins,
      statesWon,
      bestStates: best > 0 ? { states: best, election: terms[states.indexOf(best)]!.election } : null,
      presidents,
      congressLeads: terms.filter((term) => term.congressLeader === party).length,
      support,
      ideology: terms.flatMap((term) => (term.support[party] ?? 0) > 0 ? [{ election: term.election, value: term.shownIdeology[party]! }] : []),
    });
  }
  return profiles;
}

/** "1st", "2nd", "23rd", "111th". */
export function ordinal(n: number): string {
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
  return `${n}${suffix}`;
}
