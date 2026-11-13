import { useLayoutEffect, useRef, useState } from 'react';
import { PARTIES, partyName } from '../engine/data';
import type { Term } from '../engine/types';
import { Dot, Party } from './Party';
import { Icon } from './Icon';
import { decidedByCongress, percent } from './presentation';

interface HistoryProps {
  terms: readonly Term[];
  year: number;
  chooseYear: (year: number) => void;
}

export function ElectionRail({ terms, year, chooseYear, openHistory }: HistoryProps & { openHistory: () => void }) {
  const selected = useRef<HTMLButtonElement>(null);
  const rail = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const list = rail.current;
    const active = selected.current;
    if (!list || !active) return;
    const center = () => {
      if (list.scrollWidth > list.clientWidth) {
        list.scrollLeft = active.offsetLeft - (list.clientWidth - active.offsetWidth) / 2;
      } else {
        list.scrollTop = active.offsetTop - (list.clientHeight - active.offsetHeight) / 2;
      }
    };
    center();
    const observer = new ResizeObserver(center);
    observer.observe(list);
    return () => observer.disconnect();
  }, [year]);

  return (
    <aside className="panel rail" aria-labelledby="rail-title">
      <div className="panel-header">
        <h2 id="rail-title">Elections</h2>
        <span className="panel-count">{terms.length}</span>
      </div>
      <div ref={rail} className="rail-list" aria-label="Election years">
        {terms.map((term) => (
          <button ref={term.election === year ? selected : undefined} key={term.election} className="rail-row"
            aria-current={term.election === year ? 'true' : undefined} onClick={() => chooseYear(term.election)}>
            <span className="rail-year">{term.election}</span>
            <Dot party={term.winnerParty} />
            <span className="rail-name">{term.winnerName}</span>
          </button>
        ))}
      </div>
      <button type="button" className="rail-footer" onClick={openHistory}>View full history <Icon name="arrow" /></button>
    </aside>
  );
}

export function History({ terms, year, chooseYear }: HistoryProps) {
  const [query, setQuery] = useState('');
  const [party, setParty] = useState('');
  const [latestFirst, setLatestFirst] = useState(false);
  const filtered = terms.filter((term) => (party === '' || term.winnerParty === Number(party)) &&
    `${term.election} ${term.winnerName} ${partyName(term.winnerParty)} ${term.descriptor}`
      .toLowerCase().includes(query.trim().toLowerCase()));
  if (latestFirst) filtered.reverse();

  return (
    <section className="panel history-panel" aria-labelledby="history-title">
      <div className="history-controls">
        <div><h2 id="history-title">Political history</h2><p>{filtered.length} of {terms.length} elections</p></div>
        <div className="filters">
          <label className="search"><Icon name="search" /><input type="search" aria-label="Search election history"
            placeholder="Search year or president" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
          <select aria-label="Filter by winning party" value={party} onChange={(event) => setParty(event.target.value)}>
            <option value="">All winning parties</option>
            {PARTIES.map((p, i) => <option key={p.id} value={i}>{p.name}</option>)}
          </select>
        </div>
      </div>
      <div className="table-scroll">
        <table className="history-table">
          <thead><tr>
            <th scope="col" aria-sort={latestFirst ? 'descending' : 'ascending'}>
              <button className="sort-button" onClick={() => setLatestFirst(!latestFirst)}>Election <Icon name="down" size={14} /></button>
            </th>
            <th scope="col">President elected</th><th scope="col">Winning party</th>
            <th scope="col" className="numeric">Popular vote</th><th scope="col" className="numeric">Electoral College</th>
            <th scope="col">Congress leader</th><th scope="col" className="numeric">Share</th>
          </tr></thead>
          <tbody>{filtered.map((term) => (
            <tr key={term.election} data-selected={term.election === year}>
              <th scope="row"><button className="text-button year-link" onClick={() => chooseYear(term.election)}>
                {term.election}<Icon name="arrow" size={14} />
              </button></th>
              <td>{term.winnerName}</td><td><Party party={term.winnerParty} /></td>
              <td className="numeric">{percent(term.winnerPopularShare)}</td>
              <td className="numeric">{percent(term.winnerElectoralShare)}{decidedByCongress(term) && (
                <small className="table-note">Contingent</small>
              )}</td>
              <td><Party party={term.congressLeader} /></td>
              <td className="numeric">{percent(term.congress[term.congressLeader]!)}</td>
            </tr>
          ))}</tbody>
        </table>
        {filtered.length === 0 && <p className="empty">No elections match these filters.</p>}
      </div>
    </section>
  );
}
