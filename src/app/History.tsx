import { useLayoutEffect, useRef, useState } from 'react';
import { PARTIES, partyName } from '../engine/data';
import type { FinalPresident } from '../engine/summary';
import type { Term } from '../engine/types';
import { ideologyLabel } from '../engine/util';
import { Dot } from './Party';
import { PartyLink, PresidentLink } from './People';
import { Icon } from './Icon';
import { approximateCount, compactCount, decidedByCongress, estimatedWinnerVotes, percent, signed } from './presentation';
import { electoralTotals } from '../engine/states';
import { useVoteDisplay } from './voteDisplay';
import { midtermSummary, seatChange, type MidtermSummary } from './midtermView';

interface HistoryProps {
  terms: readonly Term[];
  year: number;
  chooseYear: (year: number) => void;
  /** When midterms are on, each one is listed after the election before it. */
  midterms: boolean;
}

/** The midterm two years after each election, when midterms are on. */
const midtermsOf = (terms: readonly Term[], on: boolean) =>
  new Map(on ? terms.flatMap((term) => {
    const summary = midtermSummary(term, terms[term.index + 1]);
    return summary ? [[term.election, summary] as const] : [];
  }) : []);

export function ElectionRail({ terms, year, chooseYear, openHistory, midterms }: HistoryProps & { openHistory: () => void }) {
  const selected = useRef<HTMLButtonElement>(null);
  const midtermRows = midtermsOf(terms, midterms);
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
        <span className="panel-count">{terms.length + midtermRows.size}</span>
      </div>
      <div ref={rail} className="rail-list" aria-label="Election years">
        {terms.map((term) => {
          const midterm = midtermRows.get(term.election);
          return [
            <button ref={term.election === year ? selected : undefined} key={term.election} className="rail-row"
              aria-current={term.election === year ? 'true' : undefined} onClick={() => chooseYear(term.election)}>
              <span className="rail-year">{term.election}</span>
              <Dot party={term.winnerParty} />
              <span className="rail-name">{term.winnerName}</span>
            </button>,
            midterm && <button ref={midterm.year === year ? selected : undefined} key={midterm.year} className="rail-row rail-midterm"
              aria-current={midterm.year === year ? 'true' : undefined} onClick={() => chooseYear(midterm.year)}
              aria-label={`${midterm.year} midterm: ${partyName(midterm.party)} ${seatChange(midterm.houseChange)} House seats`}>
              <span className="rail-year">{midterm.year}</span>
              <Dot party={midterm.party} />
              <span className="rail-name">Midterm · {seatChange(midterm.houseChange)} House</span>
            </button>,
          ];
        })}
      </div>
      <button type="button" className="rail-footer" onClick={openHistory}>View full history <Icon name="arrow" /></button>
    </aside>
  );
}

/** Statistics for the term won in an election: the next row's term, or the final 2065 term. */
interface WonTerm {
  began: number;
  ideology: number;
  descriptor: string;
  dayOneApproval?: number;
  performance?: number;
  stability?: number;
  electionDayApproval?: number;
  courtAverage?: number;
}

function wonTerm(terms: readonly Term[], term: Term, final: FinalPresident): WonTerm {
  const next = terms[term.index + 1];
  if (!next) return { began: final.termBegan, ideology: final.ideology, descriptor: final.descriptor };
  return {
    began: next.termBegan, ideology: next.potusIdeology, descriptor: next.descriptor,
    dayOneApproval: next.dayOneApproval, performance: next.performance, stability: next.stability,
    electionDayApproval: next.electionDayApproval, courtAverage: next.courtAverage,
  };
}

const ideology = (score: number) => <>{signed(score)} <small className="table-sub">{ideologyLabel(score)}</small></>;
const maybe = (value: number | undefined, format: (n: number) => string) => value === undefined ? '—' : format(value);

export function History({ terms, final, year, chooseYear, midterms }: HistoryProps & { final: FinalPresident }) {
  const [query, setQuery] = useState('');
  const [party, setParty] = useState('');
  const [latestFirst, setLatestFirst] = useState(false);
  const display = useVoteDisplay();
  const midtermRows = midtermsOf(terms, midterms);
  const needle = query.trim().toLowerCase();
  type Row = { kind: 'election'; term: Term; won: WonTerm } | { kind: 'midterm'; term: Term; midterm: MidtermSummary };
  const rows: Row[] = terms.flatMap((term): Row[] => {
    const midterm = midtermRows.get(term.election);
    return [{ kind: 'election', term, won: wonTerm(terms, term, final) }, ...(midterm ? [{ kind: 'midterm' as const, term, midterm }] : [])];
  });
  const filtered = rows.filter((row) => row.kind === 'election'
    ? (party === '' || row.term.winnerParty === Number(party)) &&
      `${row.term.election} ${row.term.winnerName} ${partyName(row.term.winnerParty)} ${row.won.descriptor}`.toLowerCase().includes(needle)
    : (party === '' || row.midterm.party === Number(party)) &&
      `${row.midterm.year} midterm ${row.midterm.president} ${partyName(row.midterm.party)}`.toLowerCase().includes(needle));
  if (latestFirst) filtered.reverse();
  const shown = filtered.length;
  const total = rows.length;

  return (
    <section className="panel history-panel" aria-labelledby="history-title">
      <div className="history-controls">
        <div><h2 id="history-title">Political history</h2><p>{shown} of {total} elections{midterms ? ` · ${midtermRows.size} midterms` : ''}</p></div>
        <div className="filters">
          <label className="search"><Icon name="search" /><input type="search" aria-label="Search election history"
            placeholder="Search year, president or event" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
          <select aria-label="Filter by winning party" value={party} onChange={(event) => setParty(event.target.value)}>
            <option value="">All winning parties</option>
            {PARTIES.map((p, i) => <option key={p.id} value={i}>{p.name}</option>)}
          </select>
        </div>
      </div>
      <div className="table-scroll">
        <table className="history-table">
          <thead>
            <tr className="history-groups">
              <th scope="colgroup" colSpan={8}>The election</th>
              <th scope="colgroup" colSpan={9} className="group-start">The term it started</th>
            </tr>
            <tr>
              <th scope="col" aria-sort={latestFirst ? 'descending' : 'ascending'}>
                <button className="sort-button" onClick={() => setLatestFirst(!latestFirst)}>Election <Icon name="down" size={14} /></button>
              </th>
              <th scope="col">President elected</th><th scope="col">Winning party</th>
              <th scope="col" className="numeric" title={display === 'percent' ? undefined : 'Estimated from real US turnout for each year'}>Popular vote</th><th scope="col" className="numeric">Electoral College</th>
              <th scope="col" title="Whether the party already in the White House kept it">Incumbent party</th>
              <th scope="col">Congress leader</th><th scope="col" className="numeric">Share</th>
              <th scope="col" className="group-start">Term</th>
              <th scope="col" className="numeric">President ideology</th>
              <th scope="col" className="numeric">Congress ideology</th>
              <th scope="col" className="numeric">Court ideology</th>
              <th scope="col" className="numeric">Day-one approval</th>
              <th scope="col" className="numeric" title="Random score for how the term went; it decides the term event">Performance</th>
              <th scope="col">Term event</th>
              <th scope="col" className="numeric" title="National stability, 0.1 to 1. Low stability makes civil war possible">Stability</th>
              <th scope="col" className="numeric">Election-day approval</th>
            </tr>
          </thead>
          <tbody>{filtered.map((row) => row.kind === 'midterm' ? <MidtermRow key={row.midterm.year} summary={row.midterm}
            term={row.term} selected={row.midterm.year === year} chooseYear={chooseYear} /> : (({ term, won }) => (
            <tr key={term.election} data-selected={term.election === year}>
              <th scope="row"><button className="text-button year-link" onClick={() => chooseYear(term.election)}>
                {term.election}<Icon name="arrow" size={14} />
              </button></th>
              <td><PresidentLink name={term.winnerName} began={won.began} /></td><td><PartyLink party={term.winnerParty} /></td>
              <td className="numeric">{display === 'percent' ? percent(term.winnerPopularShare) : (() => {
                const votes = estimatedWinnerVotes(term, electoralTotals(term.grid).live);
                return <span title={`${percent(term.winnerPopularShare)} · ≈ ${approximateCount(votes)} votes`}>{compactCount(votes)}</span>;
              })()}</td>
              <td className="numeric">{percent(term.winnerElectoralShare)}{decidedByCongress(term) && (
                <small className="table-note">Contingent</small>
              )}</td>
              <td>{term.index === 0 ? '—' : term.result === 'WIN' ? 'Kept' : <span className="table-lost">Lost</span>}</td>
              <td><PartyLink party={term.congressLeader} /></td>
              <td className="numeric">{percent(term.congress[term.congressLeader]!)}</td>
              <td className="group-start">{won.began}–{won.began + 4}</td>
              <td className="numeric">{ideology(won.ideology)}</td>
              <td className="numeric">{signed(term.congressIdeology)}</td>
              <td className="numeric">{maybe(won.courtAverage, signed)}</td>
              <td className="numeric">{maybe(won.dayOneApproval, percent)}</td>
              <td className="numeric">{maybe(won.performance, signed)}</td>
              <td>{won.descriptor || 'No major event'}</td>
              <td className="numeric">{maybe(won.stability, (n) => n.toFixed(2))}</td>
              <td className="numeric">{maybe(won.electionDayApproval, percent)}</td>
            </tr>
          ))(row))}</tbody>
        </table>
        {filtered.length === 0 && <p className="empty">No elections match these filters.</p>}
      </div>
      <p className="history-footnote">Term figures describe the four years after each election, the term that election
        started.{midterms ? ' Midterm rows show the House and Senate seats the president\'s party gained or lost, and who led Congress afterwards.' : ''} The 2065 term has no election after it, so the simulation does not score its approval, performance,
        stability or court.</p>
    </section>
  );
}

/** A midterm in the elections table: the Congress result, with the term columns left to the election before it. */
function MidtermRow({ summary, term, selected, chooseYear }: {
  summary: MidtermSummary; term: Term; selected: boolean; chooseYear: (year: number) => void;
}) {
  const leader = summary.after.house.majority;
  return <tr className="midterm-row" data-selected={selected}>
    <th scope="row"><button className="text-button year-link" onClick={() => chooseYear(summary.year)}>
      {summary.year}<Icon name="arrow" size={14} /></button><small className="table-note">Midterm</small></th>
    <td colSpan={2}><span className="midterm-president">{summary.president} · <PartyLink party={summary.party} /></span></td>
    <td className="numeric" colSpan={2}>{seatChange(summary.houseChange)} House · {seatChange(summary.senateChange)} Senate</td>
    <td>{summary.houseChange < 0 ? <span className="table-lost">Lost seats</span> : 'Held or gained'}</td>
    <td>{leader === null ? 'No majority' : <PartyLink party={leader} />}</td>
    <td className="numeric">{leader === null ? '—' : percent(summary.after.house.seats[leader]! / summary.after.house.size)}</td>
    <td className="group-start muted" colSpan={9}>Two years into the {term.election + 1}–{term.election + 5} term</td>
  </tr>;
}
