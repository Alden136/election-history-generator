import type { CSSProperties } from 'react';
import { partyName } from '../engine/data';
import type { Term } from '../engine/types';
import { ideologyLabel } from '../engine/util';
import { chambers, type Chamber } from './chambers';
import { bench, COLOR_LIMIT, ideologyColor } from './court';
import { Dot } from './Party';
import { inkOn, PARTY_COLORS, percent, signed } from './presentation';

interface Seat { x: number; y: number; party: number }

/**
 * A seating chart on a square grid. The seats fill the cells of a half-ring
 * (outer radius 1, inner radius 0.4), so they sit in straight rows and
 * columns. Parties fill whole columns from left to right, ordered from
 * left-wing to right-wing. The grid is symmetric about x = 0, so the middle
 * line splits the seats in half.
 */
const INNER = 0.4;

function gridCells(pitch: number) {
  const half = Math.ceil(1 / pitch);
  const cells: { x: number; y: number; r: number }[] = [];
  for (let i = -half; i < half; i++) {
    for (let j = 0; j < half; j++) {
      const x = (i + 0.5) * pitch;
      const y = (j + 0.5) * pitch;
      const r = Math.hypot(x, y);
      if (r >= INNER && r <= 1) cells.push({ x, y, r });
    }
  }
  return cells;
}

function seatLayout(seats: readonly number[], order: readonly number[]): { seats: Seat[]; size: number } {
  const total = seats.reduce((a, b) => a + b, 0);
  if (total === 0) return { seats: [], size: 0 };
  // The largest cells that still give enough seats.
  let pitch = 0.5;
  let cells = gridCells(pitch);
  while (cells.length < total) {
    pitch *= 0.99;
    cells = gridCells(pitch);
  }
  // Drop spare cells from the inner edge, alternating sides to stay symmetric.
  const left = cells.filter((c) => c.x < 0).sort((a, b) => a.r - b.r);
  const right = cells.filter((c) => c.x > 0).sort((a, b) => a.r - b.r);
  const drop = new Set<typeof cells[number]>();
  for (let n = 0; drop.size < cells.length - total; n++) drop.add((n % 2 === 0 ? left : right)[Math.floor(n / 2)]!);
  const kept = cells.filter((c) => !drop.has(c))
    // Column by column from left to right, each column from the top down.
    .sort((a, b) => a.x - b.x || b.y - a.y);

  const parties: number[] = [];
  for (const party of order) for (let n = 0; n < seats[party]!; n++) parties.push(party);

  return {
    size: pitch * 0.8,
    seats: kept.map(({ x, y }, i) => ({ x, y: -y, party: parties[i]! })),
  };
}

function ChamberPanel({ title, chamber, order }: { title: string; chamber: Chamber; order: readonly number[] }) {
  const { seats, size } = seatLayout(chamber.seats, order);
  const needed = Math.floor(chamber.size / 2) + 1;
  const parties = order.filter((party) => chamber.seats[party]! > 0);
  const scale = 100;
  const half = (size * scale) / 2;

  return <section className="panel chamber" aria-labelledby={`chamber-${title}`}>
    <div className="panel-header">
      <h3 id={`chamber-${title}`}>{title}</h3>
      <span className="panel-count chamber-count"><span>{chamber.size} seats</span> <span>{needed} for a majority</span></span>
    </div>
    <div className="chamber-body">
      <svg className="hemicycle" viewBox={`${-scale - half} ${-scale - half} ${2 * scale + 2 * half} ${scale + 2 * half}`}
        role="img" aria-label={`${title}: ${parties.map((p) => `${partyName(p)} ${chamber.seats[p]}`).join(', ')}`}>
        {seats.map((seat, i) => <rect key={i} x={seat.x * scale - half} y={seat.y * scale - half}
          width={half * 2} height={half * 2} fill={PARTY_COLORS[seat.party]} />)}
        <line className="majority-line" x1={0} y1={-scale - half} x2={0} y2={half} />
      </svg>
      <p className="chamber-control" data-control={chamber.majority === null ? 'none' : 'party'}
        style={{ '--control': chamber.majority === null ? undefined : PARTY_COLORS[chamber.majority] } as CSSProperties}>
        {chamber.majority === null ? 'No majority' : `${partyName(chamber.majority)} majority`}
      </p>
      <ul className="chamber-parties">
        {parties.map((party) => <li key={party}>
          <Dot party={party} /><span>{partyName(party)}</span>
          <strong>{chamber.seats[party]}</strong><small>{percent(chamber.seats[party]! / chamber.size)}</small>
        </li>)}
      </ul>
    </div>
  </section>;
}

/**
 * The Supreme Court as the winner of this election leaves it: one square per
 * seat, justices from left-wing to right-wing, then the empty seats.
 */
function CourtPanel({ court, sitting }: { court: readonly (number | null)[] | undefined; sitting: string }) {
  if (!court) {
    return <section className="panel court" aria-labelledby="court-title">
      <div className="panel-header"><h3 id="court-title">Supreme Court</h3></div>
      <p className="court-note">The simulation ends after 2064, so the court this term leaves behind is not worked out.</p>
    </section>;
  }
  const { justices, size, empty, average, median, left, right } = bench(court);
  const lean = left === right ? 'Evenly split' : `Leans ${left > right ? 'left' : 'right'} ${Math.max(left, right)}–${Math.min(left, right)}`;

  return <section className="panel court" aria-labelledby="court-title">
    <div className="panel-header">
      <h3 id="court-title">Supreme Court</h3>
      <span className="panel-count chamber-count"><span>{justices.length} of {size} seats filled</span> <span>End of the {sitting} term</span></span>
    </div>
    <div className="court-body">
      <div>
        <ol className="bench" aria-label="Justices from left-wing to right-wing, then empty seats">
          {justices.map(({ seat, ideology }) => {
            const fill = ideologyColor(ideology);
            const label = `Seat ${seat}: ${ideologyLabel(ideology)}, ${signed(ideology)}`;
            return <li key={seat} title={label} aria-label={label} style={{ background: fill, color: inkOn(fill) }}>
              <strong aria-hidden="true">{signed(ideology)}</strong>
            </li>;
          })}
          {Array.from({ length: empty }, (_, i) => <li key={`empty-${i}`} data-empty title="Empty seat" aria-label="Empty seat">
            <small aria-hidden="true">Empty</small></li>)}
        </ol>
        <div className="bench-scale" aria-hidden="true">
          <span>Left-wing −{COLOR_LIMIT}</span><i /><span>+{COLOR_LIMIT} Right-wing</span>
        </div>
      </div>
      <div className="court-side">
        <p className="chamber-control" data-control={left === right ? 'none' : 'party'}
          style={{ '--control': left === right ? undefined : ideologyColor(left > right ? -3 : 3) } as CSSProperties}>{lean}</p>
        <ul className="chamber-parties court-figures">
          <li><span>Average</span><strong>{signed(average)}</strong><small>{ideologyLabel(average)}</small></li>
          <li><span>Middle justice</span><strong>{signed(median)}</strong><small>{ideologyLabel(median)}</small></li>
          <li><span>Left of centre</span><strong>{left}</strong><small /></li>
          <li><span>Right of centre</span><strong>{right}</strong><small /></li>
        </ul>
      </div>
    </div>
  </section>;
}

export function Congress({ term, court }: { term: Term; court: readonly (number | null)[] | undefined }) {
  const { house, senate } = chambers(term);
  // Seat parties from left-wing to right-wing, as in a real chamber.
  const order = term.shownIdeology.map((ideology, party) => ({ ideology, party }))
    .sort((a, b) => a.ideology - b.ideology || a.party - b.party).map(({ party }) => party);
  // The simulation elects Congress only with each presidential election, so it sits four years.
  const sitting = term.index === 0 ? '1789–1793' : `${term.election + 1}–${term.election + 5}`;

  return <section className="congress" aria-labelledby="congress-title">
    <div className="section-heading">
      <h2 id="congress-title">Congress and the Court</h2>
      <span className="eyebrow">{term.index === 0 ? `Founding Congress · sits ${sitting}` : `Elected ${term.election} · sits ${sitting}`}</span>
    </div>
    <div className="chambers">
      <ChamberPanel title="House of Representatives" chamber={house} order={order} />
      <ChamberPanel title="Senate" chamber={senate} order={order} />
      <CourtPanel court={court} sitting={sitting} />
    </div>
  </section>;
}
