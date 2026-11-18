import type { CSSProperties } from 'react';
import { partyName } from '../engine/data';
import type { Chamber } from './chambers';
import type { MidtermSummary } from './midtermView';
import { seatChange } from './midtermView';
import { Icon } from './Icon';
import { PartyLink, PresidentLink } from './People';
import { PARTY_COLORS, percent } from './presentation';

const control = (chamber: Chamber) => (chamber.majority === null ? 'No majority' : `${partyName(chamber.majority)} majority`);

function headline({ party, houseChange }: MidtermSummary): string {
  const name = partyName(party);
  if (houseChange < 0) return `${name} lost ${-houseChange} House ${houseChange === -1 ? 'seat' : 'seats'}`;
  if (houseChange > 0) return `${name} gained ${houseChange} House ${houseChange === 1 ? 'seat' : 'seats'}`;
  return `${name} held its House seats`;
}

/**
 * A midterm election's page: there is no state-by-state vote at a midterm in
 * this simulation, so it shows the Congress result in place of the map.
 */
export function MidtermResults({ summary, began, openElection }: {
  summary: MidtermSummary;
  /** The year the president's term began, which identifies their presidency. */
  began: number;
  openElection: (year: number) => void;
}) {
  const { before, after } = summary;
  const flipped = (b: Chamber, a: Chamber) => b.majority !== a.majority;
  return <section className="panel midterm-results" aria-labelledby="midterm-title">
    <div className="panel-header"><h2 id="midterm-title"><Icon name="history" /> Midterm results</h2>
      <span className="panel-count">{summary.year} · Congress only</span></div>
    <div className="midterm-body">
      <div className="winner midterm-hero" style={{ '--winner': PARTY_COLORS[summary.party] } as CSSProperties}>
        <div className="winner-meta"><span>President <PresidentLink name={summary.president} began={began} /></span>
          <PartyLink party={summary.party} /></div>
        <h3>{headline(summary)}</h3>
        <p className="winner-ideology">{summary.houseChange < 0 ? 'A setback for the White House' : 'A good night for the White House'}{' '}
          <span>{percent(summary.dayOneApproval)} day-one approval</span></p>
        <dl className="winner-stats">
          <div><dt>House</dt><dd>{seatChange(summary.houseChange)}</dd><small className="winner-votes">{control(after.house)}
            {flipped(before.house, after.house) ? ' · changed hands' : ''}</small></div>
          <div><dt>Senate</dt><dd>{seatChange(summary.senateChange)}</dd><small className="winner-votes">{control(after.senate)}
            {flipped(before.senate, after.senate) ? ' · changed hands' : ''}</small></div>
        </dl>
      </div>
      <div className="midterm-table">
        <table className="results-table" aria-label="Seats before and after the midterm">
          <thead><tr><th scope="col">Party</th><th scope="col">House</th><th scope="col">Change</th>
            <th scope="col">Senate</th><th scope="col">Change</th></tr></thead>
          <tbody>{summary.rows.map((row) => <tr key={row.party}>
            <th scope="row"><PartyLink party={row.party} /></th>
            <td>{row.houseAfter}</td><td data-change={Math.sign(row.houseAfter - row.houseBefore)}>{seatChange(row.houseAfter - row.houseBefore)}</td>
            <td>{row.senateAfter}</td><td data-change={Math.sign(row.senateAfter - row.senateBefore)}>{seatChange(row.senateAfter - row.senateBefore)}</td>
          </tr>)}</tbody>
        </table>
        <p className="midterm-note">The simulation has no state-by-state vote at a midterm, so there is no map: the states stand as
          they voted in <button type="button" className="text-button" onClick={() => openElection(summary.year - 2)}>{summary.year - 2}</button>.
          Seats compare with the Congress elected that year.</p>
      </div>
    </div>
  </section>;
}
