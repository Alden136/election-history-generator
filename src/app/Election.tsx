import { useState, type CSSProperties } from 'react';
import { ELECTIONS, partyName, STATES } from '../engine/data';
import { electoralTotals } from '../engine/states';
import { NO_VOTE, SECEDED, type Expansions, type Term } from '../engine/types';
import { ideologyLabel } from '../engine/util';
import type { Timeline } from '../engine/simulate';
import { Icon } from './Icon';
import { Party } from './Party';
import { decidedByCongress, NO_VOTE_COLOR, PARTY_COLORS, partyResults, percent, SECEDED_COLOR, signed } from './presentation';

const TERRITORIES: Record<keyof Expansions, string> = {
  texas: 'Texas', west: 'Western states', mexico: 'Northern Mexico', canada: 'Canada',
  quebec: 'Quebec', puertoRico: 'Puerto Rico', cuba: 'Cuba', westVirginia: 'West Virginia',
};

export function YearPicker({ year, chooseYear }: { year: number; chooseYear: (year: number) => void }) {
  const index = ELECTIONS.indexOf(year);
  return <div className="year-picker">
    <button className="icon-button" aria-label="Previous election" disabled={index === 0}
      onClick={() => chooseYear(ELECTIONS[index - 1]!)}><Icon name="left" /></button>
    <div className="year-select"><select aria-label="Election year" value={year}
      onChange={(event) => chooseYear(Number(event.target.value))}>
      {ELECTIONS.map((election) => <option key={election} value={election}>{election}</option>)}
    </select><Icon name="down" size={13} /></div>
    <button className="icon-button" aria-label="Next election" disabled={index === ELECTIONS.length - 1}
      onClick={() => chooseYear(ELECTIONS[index + 1]!)}><Icon name="right" /></button>
  </div>;
}

function stateResult(term: Term, index: number): string {
  const winner = term.grid.winners[index];
  if (winner === SECEDED) return 'Seceded';
  return winner === NO_VOTE || winner === undefined ? 'No vote' : partyName(winner);
}

export function ElectionMap({ term }: { term: Term }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const [focused, setFocused] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const active = hovered ?? focused ?? selected;
  const grid = term.grid;
  const totals = electoralTotals(grid);
  const parties = PARTY_COLORS.flatMap((color, party) =>
    grid.winners.includes(party) ? [{ color, label: partyName(party), kind: 'party' }] : []);
  const legend = [...parties, { color: NO_VOTE_COLOR, label: 'No vote', kind: 'absent' }];
  if (grid.winners.includes(SECEDED)) legend.push({ color: SECEDED_COLOR, label: 'Seceded', kind: 'seceded' });
  const activeState = active === null ? null : STATES[active]!;

  return <section className="panel map-panel" aria-labelledby="map-title">
    <div className="panel-header">
      <h2 id="map-title"><Icon name="map" /> Electoral map</h2>
      <span className="panel-count">{totals.votingStates} voting {totals.votingStates === 1 ? 'state' : 'states'}</span>
    </div>
    <div className="map-stage">
      <div className="tile-map" role="group" aria-label={`${term.election} election results by state`}>
        {STATES.map((state, i) => {
          const winner = grid.winners[i]!;
          const style = {
            gridColumn: state.tile.col + 1,
            gridRow: state.tile.row + 1,
            '--tile-color': PARTY_COLORS[winner] ?? (winner === SECEDED ? SECEDED_COLOR : NO_VOTE_COLOR),
          } as CSSProperties;
          return <button key={state.code} type="button" className="tile"
            data-kind={winner === SECEDED ? 'seceded' : winner === NO_VOTE ? 'absent' : 'party'}
            data-active={active === i} aria-pressed={selected === i} style={style}
            aria-label={`${state.name}: ${stateResult(term, i)}${term.index ? `, ${grid.votes[i]} electoral votes` : ''}`}
            onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)}
            onFocus={() => setFocused(i)} onBlur={() => setFocused(null)}
            onClick={() => setSelected(selected === i ? null : i)}>
            <span>{state.code}</span>
          </button>;
        })}
      </div>
    </div>
    <div className="map-legend" aria-label="Map legend">
      {legend.map(({ color, label, kind }) => <span key={label}><i data-kind={kind} style={{ '--tile-color': color } as CSSProperties} />{label}</span>)}
    </div>
    <div className="map-readout" aria-live="polite">
      {activeState && active !== null ? <>
        <strong>{activeState.name}</strong><span>{stateResult(term, active)}</span>
        {term.index > 0 && <span>{grid.votes[active]} EV{grid.winners[active] === SECEDED ? ' withheld' : ''}</span>}
        {term.index > 0 && grid.votes[active]! > 0 && <span>Lean {signed(grid.lean[active]!)}</span>}
      </> : <>{term.index === 0 ? 'The workbook records state winners only for 1792.' :
        `${totals.live} eligible electoral votes${totals.seceded ? ` · ${totals.seceded} withheld by secession` : ''}`}</>}
    </div>
  </section>;
}

export function ElectionResults({ term, winnerIdeology }: { term: Term; winnerIdeology: number }) {
  const results = partyResults(term);
  return <section className="panel results" aria-labelledby="results-title">
    <div className="panel-header"><h2 id="results-title">Election results</h2></div>
    <div className="winner" style={{ '--winner': PARTY_COLORS[term.winnerParty] } as CSSProperties}>
      <div className="winner-meta"><Party party={term.winnerParty} />
        <span>{term.index === 0 ? 'Founding election' : decidedByCongress(term) ? 'Decided by Congress' : 'Electoral majority'}</span>
      </div>
      <h3>{term.winnerName}</h3>
      <p className="winner-ideology">{ideologyLabel(winnerIdeology)} <span>{signed(winnerIdeology)}</span></p>
      <dl className="winner-stats">
        <div><dt>Electoral College</dt><dd>{percent(term.winnerElectoralShare)}</dd></div>
        <div><dt>Popular vote</dt><dd>{percent(term.winnerPopularShare)}</dd></div>
      </dl>
    </div>
    <div className="results-parties">
      <table className="results-table" aria-label="Party results">
        <thead><tr><th scope="col">Party</th><th scope="col"><abbr title="Electoral College">EC</abbr></th>
          <th scope="col"><abbr title="Popular vote">PV</abbr></th><th scope="col">Ideology</th></tr></thead>
        <tbody>{results.map((party) => (
          <tr key={party.index}>
            <th scope="row"><Party party={party.index} /></th>
            <td>{percent(party.electoral)}</td>
            <td>{party.popular === null ? <span aria-label="Popular vote not recorded">—</span> : percent(party.popular)}</td>
            <td>{party.support > 0 || party.won ? <>{signed(party.ideology)}<span>{ideologyLabel(party.ideology)}</span></> : '—'}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
    <div className="results-congress">
      <span className="eyebrow">Congress leader</span>
      <div><Party party={term.congressLeader} /><strong>{percent(term.congress[term.congressLeader]!)}</strong></div>
    </div>
  </section>;
}

/**
 * The term won in the selected election: the winner's four years in office,
 * which the next election's row describes. The last election (2064) has no
 * later row, so that term shows only what the engine computes for it.
 */
export function TermDetails({ timeline, term }: { timeline: Timeline; term: Term }) {
  const next = timeline.terms[term.index + 1];
  const final = timeline.finalPresident;
  const began = next?.termBegan ?? final.termBegan;
  const expansions = next?.grid.expansions ?? timeline.finalExpansions;
  const territories = (Object.keys(TERRITORIES) as (keyof Expansions)[])
    .filter((territory) => expansions[territory]).map((territory) => TERRITORIES[territory]);
  const ideology = next?.potusIdeology ?? final.ideology;
  const descriptor = next ? next.descriptor : final.descriptor;
  const ending = next
    ? `Ends with the ${next.election} election: ${next.result === 'WIN' ? `${partyName(next.potusParty)} kept the White House` : `${partyName(next.winnerParty)} took over`}`
    : 'The simulation ends after 2064';

  return <section className="panel term-details" aria-labelledby="term-title">
    <div className="panel-header"><h2 id="term-title">Their term in office</h2>
      <span className="panel-count">{began}–{began + 4}</span></div>
    <div className="term-grid">
      <div><span className="eyebrow">President</span><strong>{term.winnerName}</strong><Party party={term.winnerParty} /></div>
      <div><span className="eyebrow">Term event</span><strong>{descriptor || 'No major event'}</strong>
        <small>{ideologyLabel(ideology)} · {signed(ideology)}</small></div>
      <div><span className="eyebrow">Election-day approval</span>
        <strong>{next ? percent(next.electionDayApproval) : '—'}</strong>
        <small>{next ? `${percent(next.dayOneApproval)} on day one` : 'No election after 2064'}</small></div>
      <div><span className="eyebrow">Supreme Court ideology</span>
        <strong>{next ? signed(next.courtAverage) : '—'}</strong>
        <small>{next ? `${next.court.filter((seat) => seat !== null).length} of ${next.court.length} seats filled` : 'Not simulated after 2064'}</small></div>
      <div><span className="eyebrow">Territorial expansions</span><strong>{territories.length}</strong>
        <small>{territories.length ? territories.join(', ') : 'None recorded'}</small></div>
    </div>
    <p className="term-ending">{ending}.</p>
  </section>;
}
