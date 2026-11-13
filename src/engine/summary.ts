/**
 * The headline panel: weirdness score and noteworthy presidents.
 * Sheet cells B5-R10.
 */
import type { Rule } from './rules';
import { countExpansions } from './states';
import type { Expansions, Term } from './types';
import { ideologyLabel } from './util';

export interface NotablePresident {
  name: string;
  party: number;
  termStart: number;
  termEnd: number | null;
  info: string;
  terms?: readonly { start: number; end: number }[];
}

export interface FinalPresident {
  name: string;
  party: number;
  ideology: number;
  termBegan: number;
  descriptor: string;
}

export interface Summary {
  weirdness: number;
  weirdnessLabel: string;
  dictatorships: number;
  civilWars: number;
  expansions: number;
  /** Number of different parties that held the presidency. */
  governingParties: number;
  /** The president whose term began in 2025. */
  current: NotablePresident;
  best: NotablePresident;
  worst: NotablePresident;
  radical: NotablePresident;
  longest: NotablePresident;
}

function weirdnessLabel(score: number): string {
  if (score > 20) return 'INSANE';
  if (score > 15) return 'UNSETTLING';
  if (score > 12) return 'UNCOMFORTABLE';
  if (score > 8) return 'ODD';
  if (score > 3) return 'RELAXING';
  return 'PEACEFUL';
}

type SummaryTerm = Pick<Term,
  'termBegan' | 'president' | 'potusParty' | 'potusIdeology' | 'descriptor' | 'performance' | 'winnerName' | 'winnerParty'
>;

export function summarise(
  terms: readonly SummaryTerm[],
  final: FinalPresident,
  finalExpansions: Expansions,
  corrections?: ReadonlySet<Rule>,
): Summary {
  const correctedTenure = corrections?.has('presidential-tenure');
  const termsServed = (name: string): number => terms.filter((t) => t.president === name).length;
  const stints = new Map<string, { start: number; end: number }[]>();
  if (correctedTenure) {
    for (const term of terms) {
      const ranges = stints.get(term.president) ?? [];
      const previous = ranges.at(-1);
      if (previous?.end === term.termBegan) previous.end = term.termBegan + 4;
      else ranges.push({ start: term.termBegan, end: term.termBegan + 4 });
      stints.set(term.president, ranges);
    }
  }
  const stintAt = (name: string, year: number) => stints.get(name)?.find(({ start, end }) => start <= year && year < end);
  // QUIRK: the displayed end year adds every scored term, including
  // nonconsecutive ones, to the selected start year and excludes 2065.
  const endYear = (name: string, start: number): number => {
    if (!correctedTenure) return start + termsServed(name) * 4;
    return stintAt(name, start)?.end ?? start;
  };
  const notable = (term: SummaryTerm, info: string): NotablePresident => ({
    name: term.president,
    party: term.potusParty,
    termStart: term.termBegan,
    termEnd: endYear(term.president, term.termBegan),
    info,
  });

  const descriptors = [...terms.map((t) => t.descriptor), final.descriptor];
  const dictatorships = descriptors.filter((d) => d === 'DICTATORSHIP').length;
  const civilWars = descriptors.filter((d) => d === 'Civil War').length;
  const expansions = countExpansions(finalExpansions);
  const governingParties = new Set([...terms.map((t) => t.potusParty), final.party]).size;
  const weirdness = expansions + governingParties + 0.5 * dictatorships + civilWars;

  // Washington's first term has no performance score, so it is not ranked.
  const ranked = terms.slice(1);
  const best = ranked.reduce((a, b) => (b.performance > a.performance ? b : a));
  const worst = ranked.reduce((a, b) => (b.performance < a.performance ? b : a));

  // Most extreme ideology among election winners.
  const winners = terms.map((t, i) => {
    const next = terms[i + 1];
    return {
      term: t,
      ideology: next ? next.potusIdeology : final.ideology,
      start: next ? next.termBegan : final.termBegan,
      end: correctedTenure && !next ? null : endYear(t.winnerName, next?.termBegan ?? final.termBegan),
    };
  });
  const mostRadical = winners.reduce((a, b) => (Math.abs(b.ideology) > Math.abs(a.ideology) ? b : a));

  // Longest-serving: most terms in total, earliest president on a tie.
  const order: string[] = [];
  for (const t of terms) if (!order.includes(t.president)) order.push(t.president);
  const longestName = order.reduce((a, b) => (termsServed(b) > termsServed(a) ? b : a));
  const longestFirst = terms.find((t) => t.president === longestName)!;

  const currentTerm = terms.find((t) => t.termBegan === 2025)!;
  // P6 searches AD53:AD73, beginning with the term that started in 1985.
  const currentStart = stintAt(currentTerm.president, 2025)?.start;
  const currentFirst = terms.find((t) => currentStart === undefined
    ? t.termBegan >= 1985 && t.president === currentTerm.president
    : t.termBegan === currentStart)!;
  const longestYears = termsServed(longestName) * 4;

  return {
    weirdness,
    weirdnessLabel: weirdnessLabel(weirdness),
    dictatorships,
    civilWars,
    expansions,
    governingParties,
    current: { ...notable(currentFirst, currentTerm.descriptor), party: currentTerm.potusParty },
    best: notable(best, best.descriptor),
    worst: notable(worst, worst.descriptor),
    radical: {
      name: mostRadical.term.winnerName,
      party: mostRadical.term.winnerParty,
      termStart: mostRadical.start,
      termEnd: mostRadical.end,
      info: ideologyLabel(mostRadical.ideology),
    },
    longest: {
      name: longestName,
      party: longestFirst.potusParty,
      termStart: longestFirst.termBegan,
      termEnd: endYear(longestName, longestFirst.termBegan),
      info: `${longestYears} years`,
      ...(correctedTenure && { terms: stints.get(longestName)! }),
    },
  };
}
