import { useEffect, useMemo, useRef, type CSSProperties } from 'react';
import { partyName, STATES } from '../engine/data';
import { NO_VOTE, SECEDED, type Term } from '../engine/types';
import { Icon } from './Icon';
import { Dot, Party } from './Party';
import { NO_VOTE_COLOR, PARTY_COLORS, percent, SECEDED_COLOR, signed } from './presentation';
import { stateHistory, stateStory, yearRange, type StateResult } from './stateHistory';

const TICKS = [1792, 1840, 1880, 1920, 1960, 2000, 2040];

const kind = (result: StateResult) => result.winner === SECEDED ? 'seceded' : result.winner === NO_VOTE ? 'absent' : 'party';
const outcome = (result: StateResult) =>
  result.winner === SECEDED ? 'Seceded' : result.winner === NO_VOTE ? 'No vote' : partyName(result.winner);
const color = (result: StateResult) =>
  PARTY_COLORS[result.winner] ?? (result.winner === SECEDED ? SECEDED_COLOR : NO_VOTE_COLOR);
const elections = (n: number) => `${n} ${n === 1 ? 'election' : 'elections'}`;

/** How one state voted in every election of the timeline. Opens when a state is clicked on the map. */
export function StatePanel({ terms, state, year, chooseYear, close }: {
  terms: readonly Term[];
  state: number;
  year: number;
  chooseYear: (year: number) => void;
  close: () => void;
}) {
  const panel = useRef<HTMLElement>(null);
  const { name, code } = STATES[state]!;
  const history = useMemo(() => stateHistory(terms, state), [terms, state]);
  const { results, parties, longestStreak, peak } = history;
  const now = results.find((result) => result.election === year)!;
  const favorite = parties[0];

  // Bring the panel into view when a state is picked; the page stays put if it already shows.
  useEffect(() => {
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    panel.current?.scrollIntoView({ block: 'nearest', behavior: smooth ? 'smooth' : 'auto' });
  }, [state]);

  const nowDetail = now.winner === SECEDED ? `${now.votes} electoral votes withheld`
    : now.votes > 0 ? `${now.votes} electoral votes · lean ${signed(now.lean)}`
    : now.winner >= 0 ? 'No electoral vote count for 1792'
    : history.firstVote === null ? 'Not a state in this timeline'
    : year < history.firstVote ? 'Not a state yet' : 'Did not vote';

  return <section className="panel state-panel" ref={panel} aria-labelledby="state-title">
    <div className="panel-header">
      <h2 id="state-title"><Icon name="map" /> {name}</h2>
      <div className="state-header-tools">
        <span className="panel-count">State history · {code}</span>
        <button className="icon-button" type="button" aria-label={`Close ${name} history`} title="Close" onClick={close}>
          <Icon name="close" size={15} /></button>
      </div>
    </div>
    <dl className="state-stats">
      <div><dt className="eyebrow">In {year}</dt>
        <dd>{now.winner >= 0 ? <Party party={now.winner} /> : outcome(now)}</dd><small>{nowDetail}</small></div>
      <div><dt className="eyebrow">First voted</dt>
        <dd>{history.firstVote ?? 'Never'}</dd><small>Voted in {history.voted} of {elections(results.length)}</small></div>
      <div><dt className="eyebrow">Backed the winner</dt>
        <dd>{history.voted ? `${history.backedWinner} of ${history.voted}` : '—'}</dd>
        <small>{history.voted ? `${percent(history.backedWinner / history.voted)} of its votes` : 'No votes cast'}</small></div>
      <div><dt className="eyebrow">Most often voted</dt>
        <dd>{favorite ? <Party party={favorite.party} /> : '—'}</dd>
        <small>{favorite ? elections(favorite.wins) : 'No votes cast'}</small></div>
      <div><dt className="eyebrow">Longest streak</dt>
        <dd>{longestStreak ? <Party party={longestStreak.party} /> : '—'}</dd>
        <small>{longestStreak ? `${yearRange(longestStreak.from, longestStreak.to)} · ${elections(longestStreak.elections)}` : 'No votes cast'}</small></div>
      <div><dt className="eyebrow">Most electoral votes</dt>
        <dd>{peak ? peak.votes : '—'}</dd><small>{peak ? `First reached in ${peak.election}` : 'Never had any'}</small></div>
    </dl>
    <div className="state-chart">
      <div className="state-chart-heading">
        <span className="eyebrow">How it voted, {results[0]!.election}–{results.at(-1)!.election}</span>
        <small>{peak ? `Bars show electoral votes, up to ${peak.votes}. ` : ''}Pick a year to open that election.</small>
      </div>
      <div className="state-columns" role="group" aria-label={`${name} results by election`}>
        {results.map((result) => {
          const label = `${result.election}: ${outcome(result)}${result.votes > 0 ? `, ${result.votes} electoral votes` : ''}` +
            (result.backedWinner ? ', backed the winner' : '');
          return <button key={result.election} type="button" className="state-col" aria-label={label} title={label}
            aria-current={result.election === year ? 'true' : undefined} onClick={() => chooseYear(result.election)}>
            <span className="state-bar" style={{ height: peak ? `${(result.votes / peak.votes) * 100}%` : 0 }} />
            <span className="state-cell" data-kind={kind(result)} style={{ '--tile-color': color(result) } as CSSProperties} />
          </button>;
        })}
      </div>
      <div className="state-axis" aria-hidden="true">
        {TICKS.map((tick) => <span key={tick} style={{ gridColumn: results.findIndex((r) => r.election === tick) + 1 }}>{tick}</span>)}
      </div>
      <ul className="state-legend" aria-label="Parties this state voted for">
        {parties.map(({ party, wins }) => <li key={party}><Dot party={party} />{partyName(party)} <strong>{wins}</strong></li>)}
        {results.some((r) => r.winner === NO_VOTE) && <li><i data-kind="absent" />No vote</li>}
        {results.some((r) => r.winner === SECEDED) && <li><i data-kind="seceded" />Seceded</li>}
      </ul>
    </div>
    <p className="term-ending">{stateStory(name, history).join(' ')}</p>
  </section>;
}
