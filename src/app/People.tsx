import { createContext, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { partyName } from '../engine/data';
import { ideologyLabel } from '../engine/util';
import { Icon } from './Icon';
import { Dot, Party } from './Party';
import { DEPARTURE_LABELS, ideologyChartBounds, PARTY_COLORS, percent, signed } from './presentation';
import { ordinal, type PartyProfile, type Presidency } from './profiles';
import type { Departure } from '../engine/succession';

/* ------------------------------------------------------------------ links */

interface ProfileLinks {
  openParty: (party: number) => void;
  /** Opens the president serving in the term that began in `began`. */
  openPresident: (began: number) => void;
}

export const ProfileLinksContext = createContext<ProfileLinks | null>(null);

/** A party name that opens its party page. Plain text where no page can open. */
export function PartyLink({ party }: { party: number }) {
  const links = useContext(ProfileLinksContext);
  if (!links || party < 0) return <Party party={party} />;
  return <button type="button" className="text-button profile-link" title={`Open the ${partyName(party)} party page`}
    onClick={() => links.openParty(party)}><Party party={party} /></button>;
}

/** A president's name that opens their entry in the list of presidents. */
export function PresidentLink({ name, began, children }: { name: string; began: number; children?: ReactNode }) {
  const links = useContext(ProfileLinksContext);
  if (!links) return <>{children ?? name}</>;
  return <button type="button" className="text-button profile-link" title={`Open ${name} in the list of presidents`}
    onClick={() => links.openPresident(began)}>{children ?? name}</button>;
}

/* ------------------------------------------------------------------ presidents */

const years = (from: number, to: number) => `${from}–${to}`;
const terms = (n: number) => `${n} ${n === 1 ? 'term' : 'terms'}`;

function events(presidency: Presidency): string {
  const counts = new Map<string, number>();
  for (const { event } of presidency.terms) if (event) counts.set(event, (counts.get(event) ?? 0) + 1);
  return Array.from(counts, ([event, n]) => `${event === 'DICTATORSHIP' ? 'Dictatorship' : event}${n > 1 ? ` ×${n}` : ''}`).join(', ');
}

/** "Took over on William H. Harrison's death" */
function tookOverText({ from, cause }: { from: string; cause: Departure }): string {
  if (cause === 'resignation') return `Took over when ${from} resigned`;
  return `Took over on ${from}'s ${cause === 'assassination' ? 'assassination' : 'death'}`;
}

function approval(presidency: Presidency): string {
  // A president who left early has no election day; one who took over had no day one.
  const start = presidency.terms.find((term) => term.dayOneApproval !== null)?.dayOneApproval ?? null;
  const end = [...presidency.terms].reverse().find((term) => term.electionDayApproval !== null)?.electionDayApproval ?? null;
  if (start === null && end === null) return 'Not scored';
  if (end === null) return `${percent(start!)} on day one`;
  if (start === null) return `${percent(end)} on election day`;
  return `${percent(start)} → ${percent(end)}`;
}

/** "2 terms", or with a cut-short or taken-over term, "2 terms + 3 years". */
export function servedText(presidency: Presidency): string {
  const partial = presidency.terms.filter((term) => term.left || term.tookOver);
  const full = presidency.terms.length - partial.length;
  if (!partial.length) return terms(full);
  const years = partial.reduce((total, term) => total + term.end - term.began, 0);
  const extra = years ? `${years} ${years === 1 ? 'year' : 'years'}` : 'under a year';
  return full ? `${terms(full)} + ${extra}` : capitalise(extra);
}

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** Every presidency in order, numbered like real presidents. */
export function Presidents({ list, focus, openElection }: {
  list: readonly Presidency[];
  /** Presidency number to bring into view and highlight. */
  focus: number | null;
  openElection: (year: number) => void;
}) {
  const [query, setQuery] = useState('');
  const focused = useRef<HTMLTableRowElement>(null);
  const people = new Set(list.map((presidency) => presidency.name)).size;
  const needle = query.trim().toLowerCase();
  const shown = list.filter((presidency) => !needle ||
    `${ordinal(presidency.number)} ${presidency.name} ${presidency.parties.map(partyName).join(' ')} ${events(presidency)}`.toLowerCase().includes(needle));

  useEffect(() => {
    if (focus === null) return;
    setQuery('');
    focused.current?.scrollIntoView({ block: 'center' });
  }, [focus]);

  return <section className="panel history-panel" aria-labelledby="presidents-title">
    <div className="history-controls">
      <div><h2 id="presidents-title">Presidents</h2>
        <p>{list.length} presidencies · {people} {people === 1 ? 'person' : 'people'}</p></div>
      <div className="filters">
        <label className="search"><Icon name="search" /><input type="search" aria-label="Search presidents"
          placeholder="Search name, party or event" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      </div>
    </div>
    <div className="table-scroll">
      <table className="history-table presidents-table">
        <thead><tr>
          <th scope="col">No.</th><th scope="col">President</th><th scope="col">Party</th>
          <th scope="col">In office</th><th scope="col">Elected in</th><th scope="col">Term events</th>
          <th scope="col" className="numeric" title="Day-one approval in the first term, then election-day approval at the end of the last scored term">Approval</th>
        </tr></thead>
        <tbody>{shown.map((presidency) => <tr key={presidency.number} id={`president-${presidency.number}`}
          ref={presidency.number === focus ? focused : undefined} data-selected={presidency.number === focus}>
          <th scope="row" className="president-number">{ordinal(presidency.number)}</th>
          <td><strong className="president-name">{presidency.name}</strong>
            {presidency.alsoServed.length > 0 && <small className="table-sub">Also the {presidency.alsoServed.map(ordinal).join(', ')}</small>}
            {presidency.tookOver && <small className="president-succession">{tookOverText(presidency.tookOver)}</small>}
            {presidency.left && <small className="president-succession">{DEPARTURE_LABELS[presidency.left.cause]} in {presidency.left.year}</small>}</td>
          <td><span className="president-parties">{presidency.parties.map((party, i) => <span key={party}>
            {i > 0 && <span aria-label="then">→</span>}<PartyLink party={party} /></span>)}</span></td>
          <td>{years(presidency.from, presidency.to)}<small className="table-sub">
            {presidency.last ? `${servedText(presidency)} · in office as the simulation ends` : servedText(presidency)}</small></td>
          <td><span className="president-elections">{presidency.terms.map(({ electedIn, tookOver }) => electedIn === null
            ? <span key={tookOver ? 'succeeded' : 'founding'} className="muted">{tookOver ? 'Succeeded' : 'Founding'}</span>
            : <button key={electedIn} type="button" className="text-button year-chip" onClick={() => openElection(electedIn)}>{electedIn}</button>)}</span></td>
          <td>{events(presidency) || <span className="muted">No major event</span>}</td>
          <td className="numeric">{approval(presidency)}</td>
        </tr>)}</tbody>
      </table>
      {shown.length === 0 && <p className="empty">No presidents match this search.</p>}
    </div>
    <p className="history-footnote">A president who leaves and later returns is numbered again, as Grover Cleveland was.
      People are matched by name, so two different people who share a name count as the same person. The term that
      begins in 2065 has no election after it, so its approval is not scored.</p>
  </section>;
}

/* ------------------------------------------------------------------ parties */

const width = 560;
const height = 150;
const pad = { left: 42, right: 12, top: 12, bottom: 24 };
const AXIS_YEARS = [1800, 1850, 1900, 1950, 2000, 2050];

/** One party, one measure over time: a thin line in the party's color, with a hover readout. */
function SeriesChart({ title, points, min, max, ticks, format, tickFormat = format, color, first, last }: {
  title: string;
  points: { election: number; value: number | null }[];
  min: number; max: number; ticks: number[];
  format: (value: number) => string;
  tickFormat?: (value: number) => string;
  color: string; first: number; last: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const x = (year: number) => pad.left + (year - first) / (last - first) * (width - pad.left - pad.right);
  const y = (value: number) => height - pad.bottom - (value - min) / (max - min) * (height - pad.top - pad.bottom);
  // Break the line wherever the party had no support.
  const path = points.reduce((d, point, i) => point.value === null ? d
    : `${d}${i > 0 && points[i - 1]!.value !== null ? 'L' : 'M'}${x(point.election).toFixed(1)},${y(point.value).toFixed(1)}`, '');
  const shown = points.find((point) => point.election === hover) ?? null;
  const known = points.filter((point) => point.value !== null);

  return <figure className="series-chart">
    <figcaption><span className="eyebrow">{title}</span>
      <span className="series-readout" aria-live="polite">{shown
        ? `${shown.election}: ${shown.value === null ? 'not active' : format(shown.value)}` : 'Hover for a year'}</span></figcaption>
    <svg viewBox={`0 0 ${width} ${height}`} role="img"
      aria-label={`${title}, ${known.length ? `${format(Math.min(...known.map((p) => p.value!)))} to ${format(Math.max(...known.map((p) => p.value!)))}` : 'no data'}`}
      onPointerMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const year = first + ((event.clientX - rect.left) * width / rect.width - pad.left) / (width - pad.left - pad.right) * (last - first);
        setHover(points.reduce((best, point) => Math.abs(point.election - year) < Math.abs(best.election - year) ? point : best).election);
      }}
      onPointerLeave={() => setHover(null)}>
      {ticks.map((tick) => <g key={tick} className="series-grid">
        <line x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} data-zero={tick === 0 || undefined} />
        <text x={pad.left - 7} y={y(tick) + 4} textAnchor="end">{tickFormat(tick)}</text></g>)}
      {AXIS_YEARS.filter((year) => year > first && year < last).map((year) =>
        <text key={year} className="series-axis" x={x(year)} y={height - 6} textAnchor="middle">{year}</text>)}
      <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {shown && <g className="series-cursor">
        <line x1={x(shown.election)} x2={x(shown.election)} y1={pad.top} y2={height - pad.bottom} />
        {shown.value !== null && <circle cx={x(shown.election)} cy={y(shown.value)} r={4.5} fill={color} />}
      </g>}
    </svg>
  </figure>;
}

function activeText(active: PartyProfile['active']): string {
  return active.length ? active.map(({ from, to }) => from === to ? String(from) : years(from, to)).join(', ') : 'Never had national support';
}

/** One page per party that took part in the timeline, picked from a list. */
export function Parties({ profiles, list, focus, setFocus, openPresident, openElection }: {
  profiles: readonly PartyProfile[];
  list: readonly Presidency[];
  focus: number | null;
  setFocus: (party: number) => void;
  openPresident: (number: number) => void;
  openElection: (year: number) => void;
}) {
  const fallback = useMemo(() => [...profiles].sort((a, b) => b.wins.length - a.wins.length)[0]?.party ?? null, [profiles]);
  const profile = profiles.find((p) => p.party === focus) ?? profiles.find((p) => p.party === fallback);
  const detail = useRef<HTMLDivElement>(null);
  if (!profile) return null;

  const first = profile.support[0]!.election;
  const last = profile.support.at(-1)!.election;
  const peak = Math.max(0.1, ...profile.support.map(({ value }) => value));
  const supportMax = Math.ceil(peak * 10) / 10;
  const supportTicks = Array.from({ length: Math.round(supportMax / 0.1 / (supportMax > 0.5 ? 2 : 1)) + 1 }, (_, i) => i * (supportMax > 0.5 ? 0.2 : 0.1))
    .filter((tick) => tick <= supportMax + 1e-9);
  const { min, max } = ideologyChartBounds(profile.ideology.map(({ value }) => value));
  const ideologyByYear = new Map(profile.ideology.map(({ election, value }) => [election, value]));
  const color = PARTY_COLORS[profile.party]!;
  const average = profile.ideology.length ? profile.ideology.reduce((t, { value }) => t + value, 0) / profile.ideology.length : null;

  const choose = (party: number) => {
    setFocus(party);
    // On a phone the list sits above the page, so bring the page into view.
    if (detail.current && detail.current.getBoundingClientRect().top < 0 || window.matchMedia('(max-width: 900px)').matches) {
      detail.current?.scrollIntoView({ block: 'start' });
    }
  };

  return <section className="panel parties-panel" aria-labelledby="parties-title">
    <div className="history-controls">
      <div><h2 id="parties-title">Parties</h2><p>{profiles.length} parties took part in this timeline</p></div>
    </div>
    <div className="parties-body">
      <nav className="party-list" aria-label="Parties">
        {profiles.map((p) => <button type="button" key={p.party} aria-current={p.party === profile.party ? 'true' : undefined}
          onClick={() => choose(p.party)}>
          <Dot party={p.party} /><span>{partyName(p.party)}</span>
          <small>{p.wins.length ? `${p.wins.length} ${p.wins.length === 1 ? 'win' : 'wins'}` : 'No wins'}</small>
        </button>)}
      </nav>
      <div className="party-page" ref={detail} style={{ '--party': color } as CSSProperties}>
        <header>
          <h3>{partyName(profile.party)}</h3>
          <p>Active {activeText(profile.active)}</p>
        </header>
        <dl className="party-stats">
          <div><dt className="eyebrow">Presidential wins</dt><dd>{profile.wins.length}</dd>
            <small>{profile.wins.length ? `First ${profile.wins[0]}, last ${profile.wins.at(-1)}` : 'Never won the presidency'}</small></div>
          <div><dt className="eyebrow">Presidents</dt><dd>{profile.presidents.length}</dd>
            <small>{new Set(profile.presidents.map((n) => list[n - 1]!.name)).size} different people</small></div>
          <div><dt className="eyebrow">Peak support</dt><dd>{profile.peak ? percent(profile.peak.support) : '—'}</dd>
            <small>{profile.peak ? `In ${profile.peak.election}` : 'No national support'}</small></div>
          <div><dt className="eyebrow">Most states won</dt><dd>{profile.bestStates?.states ?? 0}</dd>
            <small>{profile.bestStates ? `In ${profile.bestStates.election} · ${profile.statesWon} state wins in all` : 'Never won a state'}</small></div>
          <div><dt className="eyebrow">Led Congress</dt><dd>{profile.congressLeads}</dd>
            <small>{profile.congressLeads === 1 ? 'election' : 'elections'}</small></div>
          <div><dt className="eyebrow">Average ideology</dt><dd>{average === null ? '—' : signed(average)}</dd>
            <small>{average === null ? 'Never active' : ideologyLabel(average)}</small></div>
        </dl>
        <div className="party-charts">
          <SeriesChart title="National support" color={color} first={first} last={last} min={0} max={supportMax}
            ticks={supportTicks} format={(v) => `${Math.round(v * 100)}%`} points={profile.support} />
          <SeriesChart title="Ideology, while active" color={color} first={first} last={last} min={min} max={max}
            ticks={Array.from({ length: (max - min) / 5 + 1 }, (_, i) => min + i * 5)}
            format={signed} tickFormat={(v) => (v > 0 ? `+${v}` : String(v))}
            points={profile.support.map(({ election }) => ({ election, value: ideologyByYear.get(election) ?? null }))} />
        </div>
        <div className="party-lists">
          <div><h4>Presidents</h4>
            {profile.presidents.length ? <ol className="party-presidents">{profile.presidents.map((n) => {
              const presidency = list[n - 1]!;
              return <li key={n}><button type="button" className="text-button" onClick={() => openPresident(n)}>
                <span className="muted">{ordinal(n)}</span> {presidency.name}</button>
                <small>{years(presidency.from, presidency.to)}{presidency.parties.length > 1 ? ' · switched party' : ''}</small></li>;
            })}</ol> : <p className="muted">No president served under this party.</p>}</div>
          <div><h4>Elections won</h4>
            {profile.wins.length ? <div className="party-wins">{profile.wins.map((year) =>
              <button key={year} type="button" className="text-button year-chip" onClick={() => openElection(year)}>{year}</button>)}</div>
              : <p className="muted">No presidential election won.</p>}</div>
        </div>
      </div>
    </div>
  </section>;
}
