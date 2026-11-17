import { useEffect, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { ELECTIONS, partyName, STATES } from '../engine/data';
import { electoralTotals } from '../engine/states';
import { NO_VOTE, SECEDED, type Term } from '../engine/types';
import { ideologyLabel } from '../engine/util';
import type { Timeline } from '../engine/simulate';
import { Icon } from './Icon';
import { Party } from './Party';
import { approximateCount, decidedByCongress, inkOn, NO_VOTE_COLOR, PARTY_COLORS, partyResults, percent, SECEDED_COLOR, signed, estimatedWinnerVotes } from './presentation';
import { TERRITORIES, TERRITORY_NAMES } from './timelineFinder';

type MapStyle = 'map' | 'tiles';
const MAP_STYLE_KEY = 'election-simulator:map-style';

function readMapStyle(): MapStyle {
  try { return localStorage.getItem(MAP_STYLE_KEY) === 'tiles' ? 'tiles' : 'map'; } catch { return 'map'; }
}

interface MapShape {
  d: string;
  label?: [number, number];
  labelOutside?: boolean;
  callout?: { box: [number, number, number, number]; line: [number, number, number, number] };
}
interface MapShapes {
  width: number;
  height: number;
  background: string;
  insets: [number, number, number, number][];
  states: Record<string, MapShape>;
  /** Virginia including West Virginia, drawn until West Virginia splits off. */
  wholeVirginia: MapShape;
}

/**
 * The shapes file is about 200 KB, so it loads as its own file the first time
 * the map is shown instead of slowing down the first page load.
 */
let shapesCache: MapShapes | null = null;
const shapesRequest = () => import('./map-shapes.json').then((m) => (shapesCache = m.default as unknown as MapShapes));

function useMapShapes(): MapShapes | null {
  const [shapes, setShapes] = useState(shapesCache);
  useEffect(() => {
    if (shapes) return;
    let live = true;
    shapesRequest().then((loaded) => { if (live) setShapes(loaded); }, () => { /* the tile map stays available */ });
    return () => { live = false; };
  }, [shapes]);
  return shapes;
}

/** A geographic map of all 64 possible states, from shapes built by tools/build-map.ts. */
function GeoMap({ term, active, selected, fill, kind, label, tooltip, handlers }: {
  term: Term;
  active: number | null;
  selected: number | null;
  fill: (i: number) => string;
  kind: (i: number) => string;
  label: (i: number) => string;
  tooltip: (i: number) => string;
  handlers: (i: number) => Record<string, () => void>;
}) {
  const keyboard = (i: number) => (event: KeyboardEvent<SVGElement>) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); handlers(i).onClick!(); }
  };
  const textColor = (i: number) => kind(i) === 'absent' ? '#4a4741' : kind(i) === 'seceded' ? '#f4f2ee' : inkOn(fill(i));
  const mapShapes = useMapShapes();
  if (!mapShapes) return <div className="geo-map geo-loading" role="status">Loading map…</div>;
  // West Virginia only exists once Virginia has seceded; until then Virginia is drawn whole.
  const undivided = !term.grid.expansions.westVirginia;
  const shapeOf = (code: string): MapShape =>
    undivided && code === 'VA' ? mapShapes.wholeVirginia : mapShapes.states[code]!;
  const drawn = (code: string) => !(undivided && code === 'WV');

  return <svg className="geo-map" viewBox={`0 0 ${mapShapes.width} ${mapShapes.height}`}
    role="group" aria-label={`${term.election} election results by state`}>
    <defs>
      <pattern id="seceded-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="6" height="6" fill={SECEDED_COLOR} /><rect width="2.5" height="6" fill="#2b2a27" />
      </pattern>
    </defs>
    <path className="geo-background" d={mapShapes.background} />
    {mapShapes.insets.map(([x, y, w, h], n) =>
      <rect key={n} className="geo-inset" x={x} y={y} width={w} height={h} />)}
    {STATES.map((state, i) => {
      if (!drawn(state.code)) return null;
      const shape = shapeOf(state.code);
      return <path key={state.code} className="geo-state" d={shape.d} data-kind={kind(i)}
        fill={kind(i) === 'seceded' ? 'url(#seceded-hatch)' : kind(i) === 'absent' ? undefined : fill(i)}
        role="button" tabIndex={0} aria-label={label(i)} aria-pressed={selected === i}
        onKeyDown={keyboard(i)} {...handlers(i)}><title>{tooltip(i)}</title></path>;
    })}
    {/* Small states: a leader line and a box in the Atlantic. */}
    {STATES.map((state, i) => {
      const callout = shapeOf(state.code).callout;
      if (!callout) return null;
      const [x1, y1, x2, y2] = callout.line;
      const [bx, by, bw, bh] = callout.box;
      return <g key={state.code} className="geo-callout" data-kind={kind(i)} data-active={active === i}
        aria-hidden="true" {...handlers(i)}>
        <title>{tooltip(i)}</title>
        <line x1={x1} y1={y1} x2={x2} y2={y2} />
        <rect x={bx} y={by} width={bw} height={bh}
          fill={kind(i) === 'seceded' ? 'url(#seceded-hatch)' : kind(i) === 'absent' ? undefined : fill(i)} />
        <text x={bx + bw / 2} y={by + bh / 2 + 4.5} fill={textColor(i)}>{state.code}</text>
      </g>;
    })}
    {STATES.map((state, i) => {
      if (!drawn(state.code)) return null;
      const { label: at, labelOutside } = shapeOf(state.code);
      return at ? <text key={state.code} className="geo-label" x={at[0]} y={at[1] + 5}
        fill={labelOutside ? 'var(--muted)' : textColor(i)}>{state.code}</text> : null;
    })}
    {/* The hovered or selected state, outlined on top of its neighbours. */}
    {active !== null && drawn(STATES[active]!.code) && <path className="geo-outline" d={shapeOf(STATES[active]!.code).d} />}
  </svg>;
}

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

export function ElectionMap({ term, selected, select }: {
  term: Term;
  /** The state whose history panel is open, if any. */
  selected: number | null;
  select: (state: number | null) => void;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const [focused, setFocused] = useState<number | null>(null);
  const active = hovered ?? focused ?? selected;
  const [style, setStyle] = useState<MapStyle>(readMapStyle);
  const chooseStyle = (next: MapStyle) => {
    setStyle(next);
    try { localStorage.setItem(MAP_STYLE_KEY, next); } catch { /* storage unavailable: keep it for this visit */ }
  };
  const grid = term.grid;
  const totals = electoralTotals(grid);
  const parties = PARTY_COLORS.flatMap((color, party) =>
    grid.winners.includes(party) ? [{ color, label: partyName(party), kind: 'party' }] : []);
  const legend = [...parties, { color: NO_VOTE_COLOR, label: 'No vote', kind: 'absent' }];
  if (grid.winners.includes(SECEDED)) legend.push({ color: SECEDED_COLOR, label: 'Seceded', kind: 'seceded' });

  const fill = (i: number) => {
    const winner = grid.winners[i]!;
    return PARTY_COLORS[winner] ?? (winner === SECEDED ? SECEDED_COLOR : NO_VOTE_COLOR);
  };
  const kind = (i: number) => grid.winners[i] === SECEDED ? 'seceded' : grid.winners[i] === NO_VOTE ? 'absent' : 'party';
  const label = (i: number) =>
    `${STATES[i]!.name}: ${stateResult(term, i)}${term.index ? `, ${grid.votes[i]} electoral votes` : ''}`;
  /** Hover text: the state's result, electoral votes and lean (when it has electoral votes). */
  const tooltip = (i: number) =>
    `${label(i)}${term.index > 0 && grid.votes[i]! > 0 ? `, lean ${signed(grid.lean[i]!)}` : ''}`;
  const handlers = (i: number) => ({
    onMouseEnter: () => setHovered(i), onMouseLeave: () => setHovered(null),
    onFocus: () => setFocused(i), onBlur: () => setFocused(null),
    onClick: () => select(selected === i ? null : i),
  });

  return <section className="panel map-panel" aria-labelledby="map-title">
    <div className="panel-header">
      <h2 id="map-title"><Icon name="map" /> Electoral map</h2>
      <div className="map-header-tools">
        <div className="segmented map-style" role="group" aria-label="Map style">
          <button type="button" aria-pressed={style === 'map'} onClick={() => chooseStyle('map')}>Map</button>
          <button type="button" aria-pressed={style === 'tiles'} onClick={() => chooseStyle('tiles')}>Tiles</button>
        </div>
        <span className="panel-count">{totals.votingStates} voting {totals.votingStates === 1 ? 'state' : 'states'}</span>
      </div>
    </div>
    <div className="map-stage" data-style={style}>
      {style === 'map'
        ? <GeoMap term={term} active={active} selected={selected} fill={fill} kind={kind} label={label} tooltip={tooltip} handlers={handlers} />
        : <div className="tile-map" role="group" aria-label={`${term.election} election results by state`}>
          {STATES.map((state, i) => {
            const tileStyle = {
              gridColumn: state.tile.col + 1,
              gridRow: state.tile.row + 1,
              '--tile-color': fill(i),
              '--tile-ink': kind(i) === 'party' ? inkOn(fill(i)) : undefined,
            } as CSSProperties;
            return <button key={state.code} type="button" className="tile" data-kind={kind(i)}
              data-active={active === i} aria-pressed={selected === i} style={tileStyle} aria-label={label(i)} title={tooltip(i)} {...handlers(i)}>
              <span>{state.code}</span>
            </button>;
          })}
        </div>}
    </div>
    <div className="map-legend" aria-label="Map legend">
      {legend.map(({ color, label, kind }) => <span key={label}><i data-kind={kind} style={{ '--tile-color': color } as CSSProperties} />{label}</span>)}
    </div>
  </section>;
}

export function ElectionResults({ term, winnerIdeology }: { term: Term; winnerIdeology: number }) {
  const results = partyResults(term);
  // Electoral votes still cast (seceded states excluded). The sheet records none for 1792.
  const live = electoralTotals(term.grid).live;
  return <section className="panel results" aria-labelledby="results-title">
    <div className="panel-header"><h2 id="results-title">Election results</h2></div>
    <div className="winner" style={{ '--winner': PARTY_COLORS[term.winnerParty] } as CSSProperties}>
      <div className="winner-meta"><Party party={term.winnerParty} />
        <span>{term.index === 0 ? 'Founding election' : decidedByCongress(term) ? 'Decided by Congress' : 'Electoral majority'}</span>
      </div>
      <h3>{term.winnerName}</h3>
      <p className="winner-ideology">{ideologyLabel(winnerIdeology)} <span>{signed(winnerIdeology)}</span></p>
      <dl className="winner-stats">
        <div><dt>Electoral votes</dt><dd>{live > 0
          ? <>{Math.round(term.winnerElectoralShare * live)}<small className="winner-of"> of {live}</small></>
          : percent(term.winnerElectoralShare)}</dd></div>
        <div><dt>Popular vote</dt><dd>{percent(term.winnerPopularShare)}</dd>
          <small className="winner-votes" title="Estimated from real US turnout for this year, scaled to this timeline's electoral votes">
            ≈ {approximateCount(estimatedWinnerVotes(term, live))} votes</small></div>
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
  const territories = TERRITORIES.filter((territory) => expansions[territory]).map((territory) => TERRITORY_NAMES[territory]);
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
