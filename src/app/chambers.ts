/**
 * House and Senate seats for the Congress elected in an election.
 *
 * The simulation, like the spreadsheet, computes one combined Congress
 * ("Senate, House Combined" in the sheet). This splits it into the two
 * chambers for display, without changing the simulation:
 *
 * - Size: each state with electoral votes has 2 senators and (electoral
 *   votes - 2) representatives, so annexed states add seats and seceded
 *   states leave. DC has electoral votes but no seats. 1792 uses the sheet's
 *   own starting Congress: 105 representatives and 30 senators.
 * - Party split: the House leans toward each party's national support and
 *   the Senate toward the share of states it carried. The two lean by equal
 *   and opposite amounts, so they average back to the simulated Congress,
 *   and a party with no seats in the simulated Congress has none in either.
 */
import { PARTY_COUNT, P, STATES } from '../engine/data';
import { SECEDED, type Term } from '../engine/types';

export interface Chamber {
  size: number;
  /** Seats by party index (15 entries). */
  seats: number[];
  /** Party with more than half the seats, or null. */
  majority: number | null;
}

export interface Chambers {
  house: Chamber;
  senate: Chamber;
}

const DC = STATES.findIndex((state) => state.code === 'DC');

/** The sheet's 1792 Congress: Federalists 51 of 105 representatives and 18 of 30 senators. */
const FOUNDING = {
  house: { size: 105, federalist: 51 },
  senate: { size: 30, federalist: 18 },
};

/** Largest-remainder apportionment of `size` seats by `shares`. */
export function apportion(shares: readonly number[], size: number): number[] {
  const total = shares.reduce((a, b) => a + Math.max(0, b), 0);
  if (total <= 0 || size <= 0) return shares.map(() => 0);
  const exact = shares.map((share) => (Math.max(0, share) / total) * size);
  const seats = exact.map(Math.floor);
  let left = size - seats.reduce((a, b) => a + b, 0);
  const order = exact.map((value, i) => ({ i, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    seats[i]! += 1;
    left -= 1;
  }
  return seats;
}

function chamber(seats: number[]): Chamber {
  const size = seats.reduce((a, b) => a + b, 0);
  const top = seats.indexOf(Math.max(...seats));
  return { size, seats, majority: seats[top]! * 2 > size ? top : null };
}

export function chambers(term: Term): Chambers {
  if (term.index === 0) {
    const split = (size: number, federalist: number) => {
      const seats = new Array<number>(PARTY_COUNT).fill(0);
      seats[P.FEDERALIST] = federalist;
      seats[P.J_REPUBLICAN] = size - federalist;
      return chamber(seats);
    };
    return {
      house: split(FOUNDING.house.size, FOUNDING.house.federalist),
      senate: split(FOUNDING.senate.size, FOUNDING.senate.federalist),
    };
  }

  const { grid } = term;
  let houseSize = 0;
  let senateSize = 0;
  const statesWon = new Array<number>(PARTY_COUNT).fill(0);
  let representedStates = 0;
  grid.winners.forEach((winner, i) => {
    const votes = grid.votes[i]!;
    if (i === DC || votes === 0 || winner === SECEDED) return;
    houseSize += votes - 2;
    senateSize += 2;
    representedStates += 1;
    if (winner >= 0) statesWon[winner]! += 1;
  });

  // The simulated Congress is half last term's Congress and half this election
  // (national support and states won, equally). Only that new half leans: the
  // House toward support, the Senate toward states won.
  const lean = term.congress.map((_, p) => {
    const stateShare = representedStates > 0 ? statesWon[p]! / representedStates : 0;
    return (term.support[p]! - stateShare) / 4;
  });
  // A party with no seats in the simulated Congress gets none in either chamber.
  const houseShares = term.congress.map((share, p) => (share > 0 ? Math.max(0, share + lean[p]!) : 0));
  const senateShares = term.congress.map((share, p) => (share > 0 ? Math.max(0, share - lean[p]!) : 0));

  return {
    house: chamber(apportion(houseShares, houseSize)),
    senate: chamber(apportion(senateShares, senateSize)),
  };
}
