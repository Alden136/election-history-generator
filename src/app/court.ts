/**
 * The Supreme Court as the bench panel draws it: sitting justices ordered
 * from left-wing to right-wing, with the headline figures.
 * Display only; nothing here feeds back into the simulation.
 */

export interface Justice {
  /** Seat number on the court, 1 to 15. */
  seat: number;
  ideology: number;
}

export interface Bench {
  /** Sitting justices, most left-wing first. */
  justices: Justice[];
  /** Seats on the court, filled or not. */
  size: number;
  empty: number;
  average: number;
  /** The middle justice, or the midpoint of the middle two. */
  median: number;
  /** Justices left of centre (below zero) and right of centre (above zero). */
  left: number;
  right: number;
}

export function bench(court: readonly (number | null)[]): Bench {
  const justices = court.flatMap((ideology, i) => (ideology === null ? [] : [{ seat: i + 1, ideology }]))
    .sort((a, b) => a.ideology - b.ideology || a.seat - b.seat);
  const count = justices.length;
  const middle = count >> 1;
  return {
    justices,
    size: court.length,
    empty: court.length - count,
    average: count ? justices.reduce((total, { ideology }) => total + ideology, 0) / count : 0,
    median: !count ? 0 : count % 2 ? justices[middle]!.ideology : (justices[middle - 1]!.ideology + justices[middle]!.ideology) / 2,
    left: justices.filter(({ ideology }) => ideology < 0).length,
    right: justices.filter(({ ideology }) => ideology > 0).length,
  };
}

/** Ideology at which the bench colors stop getting stronger. Most justices fall inside it. */
export const COLOR_LIMIT = 4;
const CENTRE = [236, 232, 223];
const LEFT = [47, 111, 214];
const RIGHT = [214, 69, 65];

/** Blue for left-wing, red for right-wing, pale near the centre. */
export function ideologyColor(ideology: number): string {
  const strength = Math.min(1, Math.abs(ideology) / COLOR_LIMIT);
  const end = ideology < 0 ? LEFT : RIGHT;
  return '#' + CENTRE.map((c, i) => Math.round(c + (end[i]! - c) * strength).toString(16).padStart(2, '0')).join('');
}
