/**
 * A midterm election as the app shows it: the House and Senate before and
 * after, and how the president's party did. Display only.
 */
import type { Term } from '../engine/types';
import { chambers, midtermChambers, type Chambers } from './chambers';

export interface MidtermRow {
  party: number;
  houseBefore: number;
  houseAfter: number;
  senateBefore: number;
  senateAfter: number;
}

export interface MidtermSummary {
  year: number;
  /** The president in office at the midterm, and their party. */
  president: string;
  party: number;
  dayOneApproval: number;
  /** How far the president's party's support was scaled: below 1 is a loss. */
  swing: number;
  before: Chambers;
  after: Chambers;
  /** Every party with seats before or after, largest House delegation after first. */
  rows: MidtermRow[];
  /** Seats the president's party gained (positive) or lost (negative). */
  houseChange: number;
  senateChange: number;
}

/**
 * The midterm held two years after `election`, which falls in the next term
 * (`during`). Null when midterms are off or after 2064, which is not simulated.
 */
export function midtermSummary(election: Term, during: Term | undefined): MidtermSummary | null {
  const midterm = during?.midterm;
  if (!during || !midterm) return null;
  const before = chambers(election);
  const after = midtermChambers(election, midterm);
  const party = during.potusParty;
  const rows = before.house.seats.map((_, p) => ({
    party: p,
    houseBefore: before.house.seats[p]!, houseAfter: after.house.seats[p]!,
    senateBefore: before.senate.seats[p]!, senateAfter: after.senate.seats[p]!,
  })).filter((row) => row.houseBefore || row.houseAfter || row.senateBefore || row.senateAfter)
    .sort((a, b) => b.houseAfter - a.houseAfter || b.senateAfter - a.senateAfter || a.party - b.party);
  return {
    year: midterm.election,
    president: during.president,
    party,
    dayOneApproval: during.dayOneApproval,
    swing: midterm.swing,
    before, after, rows,
    houseChange: after.house.seats[party]! - before.house.seats[party]!,
    senateChange: after.senate.seats[party]! - before.senate.seats[party]!,
  };
}

/** "+12", "−3", "±0" */
export const seatChange = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '±0');
