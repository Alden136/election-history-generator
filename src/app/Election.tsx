import { useEffect, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { P, partyName, STATES } from '../engine/data';
import { electoralTotals } from '../engine/states';
import { NO_VOTE, SECEDED, type Term } from '../engine/types';
import { ideologyLabel } from '../engine/util';
import type { Nominee } from '../engine/candidates';
import type { Timeline } from '../engine/simulate';
import { Icon } from './Icon';
import { geoBody, savePicture, tileBody, type Caption, type LegendItem, type MapShape, type MapShapes, type Picture } from './imageExport';
import { PartyLink, PresidentLink } from './People';
import { SaveImageButton } from './SaveImageButton';
import { useVoteDisplay, type VoteDisplay } from './voteDisplay';
import { CHARISMA_LABELS, EXPERIENCE_LABELS, popularVoteLeader, stateVoteText, successionText, traitEffects, approximateCount, compactCount, decidedByCongress, estimatedVotes, isMidtermYear, NO_VOTE_COLOR, PARTY_COLORS, partyResults, percent, SECEDED_COLOR, signed, estimatedWinnerVotes } from './presentation';
import { TERRITORIES, TERRITORY_NAMES } from './timelineFinder';
import { faithlessSummary, faithlessText, recountText } from './electionNotes';
import { justiceCount } from './court';

type MapStyle = 'map' | 'tiles';
const MAP_STYLE_KEY = 'election-simulator:map-style';

function readMapStyle(): MapStyle {
  try { return localStorage.getItem(MAP_STYLE_KEY) === 'tiles' ? 'tiles' : 'map'; } catch { return 'map'; }
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
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    if (!event.repeat) handlers(i).onClick!();
  };
  // Theme colours, so labels on states that did not vote stay readable in Night concrete.
  // Party states all get white labels; the outline in styles.css keeps them readable on light party colours.
  const textColor = (i: number) => kind(i) === 'absent' ? 'var(--absent-ink)' : '#f4f2ee';
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
        <text x={bx + bw / 2} y={by + bh / 2 + 4.5} fill={textColor(i)} data-kind={kind(i)}>{state.code}</text>
      </g>;
    })}
    {STATES.map((state, i) => {
      if (!drawn(state.code)) return null;
      const { label: at, labelOutside } = shapeOf(state.code);
      return at ? <text key={state.code} className="geo-label" x={at[0]} y={at[1] + 5} data-kind={labelOutside ? 'outside' : kind(i)}
        fill={labelOutside ? 'var(--text)' : textColor(i)}>{state.code}</text> : null;
    })}
    {/* The hovered or selected state, outlined on top of its neighbours. */}
    {active !== null && drawn(STATES[active]!.code) && <path className="geo-outline" d={shapeOf(STATES[active]!.code).d} />}
  </svg>;
}

export function YearPicker({ year, years, chooseYear }: {
  year: number;
  /** Every year to step through: presidential elections, and midterms when they are on. */
  years: readonly number[];
  chooseYear: (year: number) => void;
}) {
  const index = years.indexOf(year);
  return <div className="year-picker">
    <button className="icon-button" aria-label="Previous election" disabled={index === 0}
      onClick={() => chooseYear(years[index - 1]!)}><Icon name="left" /></button>
    <div className="year-select"><select aria-label="Election year" value={year}
      onChange={(event) => chooseYear(Number(event.target.value))}>
      {/* The heading says when a year is a midterm; the narrow picker shows only the year. */}
      {years.map((election) => <option key={election} value={election} aria-label={isMidtermYear(election) ? `${election} midterm` : undefined}>{election}</option>)}
    </select><Icon name="down" size={13} /></div>
    <button className="icon-button" aria-label="Next election" disabled={index === years.length - 1}
      onClick={() => chooseYear(years[index + 1]!)}><Icon name="right" /></button>
  </div>;
}

function stateResult(term: Term, index: number): string {
  const winner = term.grid.winners[index];
  if (winner === SECEDED) return 'Seceded';
  return winner === NO_VOTE || winner === undefined ? 'No vote' : partyName(winner);
}

const stateName = (code: string) => STATES.find((state) => state.code === code)?.name ?? code;

/** Hover text for a nominee: home state and traits. */
function nomineeTitle(nominee: Nominee, mate?: Nominee): string {
  return [nominee.home ? `From ${stateName(nominee.home)}` : 'No home state on record', CHARISMA_LABELS[nominee.charisma],
    EXPERIENCE_LABELS[nominee.experience], nominee.incumbent ? 'Incumbent' : null,
    mate ? `Running mate: ${mate.name}${mate.home ? ` (${stateName(mate.home)})` : ''}` : null].filter(Boolean).join(' · ');
}

/** The winner strip shared by every saved picture of an election. */
export function pictureWinner(term: Term, display: VoteDisplay): Picture['winner'] {
  const live = electoralTotals(term.grid).live;
  const electoral = live > 0 ? `${Math.round(term.winnerElectoralShare * live)} of ${live} electoral votes` : `${percent(term.winnerElectoralShare)} of the Electoral College`;
  const how = term.index === 0 ? 'Founding election' : decidedByCongress(term) ? 'Decided by Congress' : null;
  return {
    name: term.winnerName, party: term.winnerParty,
    detail: [how, electoral, display === 'percent' ? `${percent(term.winnerPopularShare)} of the popular vote`
      : `about ${approximateCount(estimatedWinnerVotes(term, live))} popular votes`].filter(Boolean).join(' · '),
  };
}

export function ElectionMap({ term, selected, select, caption }: {
  term: Term;
  /** Seed, rules and link printed on a saved picture. */
  caption: Caption;
  /** The state whose history panel is open, if any. */
  selected: number | null;
  select: (state: number | null) => void;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const [focused, setFocused] = useState<number | null>(null);
  const active = hovered ?? focused ?? selected;
  const [style, setStyle] = useState<MapStyle>(readMapStyle);
  const voteDisplay = useVoteDisplay();
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
  const tooltip = (i: number) => {
    const extra = [stateVoteText(term, i), recountText(term, i), faithlessText(term, i)].filter(Boolean);
    return `${label(i)}${term.index > 0 && grid.votes[i]! > 0 ? `, lean ${signed(grid.lean[i]!)}` : ''}${extra.map((line) => `\n${line}`).join('')}`;
  };
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
        <SaveImageButton what="the map" save={async () => {
          const shapes = style === 'map' ? shapesCache ?? await shapesRequest() : null;
          await savePicture({
            kicker: style === 'map' ? 'Electoral map' : 'Electoral map · tiles',
            year: term.election, titleBefore: 'The ', titleAfter: ' election',
            winnerLabel: 'Winner', winner: pictureWinner(term, voteDisplay),
            body: shapes ? geoBody(term, shapes) : tileBody(term),
            legend: legend as LegendItem[], caption,
          }, `election-${term.election}-seed-${caption.seed}-${style}.png`);
        }} />
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
              '--tile-ink': kind(i) === 'party' ? '#f4f2ee' : undefined,
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

export function ElectionResults({ term, winnerIdeology, winnerBegan }: {
  term: Term;
  winnerIdeology: number;
  /** The year the winner's term begins, which identifies their presidency. */
  winnerBegan: number;
}) {
  const results = partyResults(term);
  const display = useVoteDisplay();
  // Each party's nominee when candidate traits are on.
  const nomineeOf = (party: number) => term.nominees?.find((nominee) => nominee.party === party);
  const winnerNominee = nomineeOf(term.winnerParty);
  const pvLeader = popularVoteLeader(term);
  const mateOf = (party: number) => term.runningMates?.find((mate) => mate.party === party);
  const winnerMate = mateOf(term.winnerParty);
  // Electoral votes still cast (seceded states excluded). The sheet records none for 1792.
  const live = electoralTotals(term.grid).live;
  return <section className="panel results" aria-labelledby="results-title">
    <div className="panel-header"><h2 id="results-title">Election results</h2></div>
    <div className="winner" style={{ '--winner': PARTY_COLORS[term.winnerParty] } as CSSProperties}>
      <div className="winner-meta"><PartyLink party={term.winnerParty} />
        <span>{term.index === 0 ? 'Founding election' : decidedByCongress(term) ? 'Decided by Congress' : 'Electoral majority'}</span>
      </div>
      <h3><PresidentLink name={term.winnerName} began={winnerBegan} /></h3>
      {pvLeader !== null && pvLeader !== term.winnerParty && <p className="winner-split">Lost the popular vote to {partyName(pvLeader)}</p>}
      {term.contested && <p className="winner-split" title="A recount in a state that could have changed the result">Contested result</p>}
      {term.spoiler && term.winnerParty === P.THIRD && <p className="winner-split">Spoiler · split from {partyName(term.spoiler.party)}</p>}
      <p className="winner-ideology">{ideologyLabel(winnerIdeology)} <span>{signed(winnerIdeology)}</span></p>
      {/* Each tag shows a pop-up with the trait's effect on hover, or on focus for keyboards and touch. */}
      {winnerNominee && <p className="winner-traits" aria-label="Candidate traits">
        {traitEffects(winnerNominee, term.primaries?.find((primary) => primary.party === term.winnerParty)).map(({ label, effect }, i) => <span key={label} className="trait" tabIndex={0}
          aria-describedby={`trait-effect-${i}`}>{label}<span className="trait-effect" role="tooltip" id={`trait-effect-${i}`}>
            <strong>{label}</strong>{effect}</span></span>)}
      </p>}
      {winnerMate && <p className="winner-mate">Running mate <strong>{winnerMate.name}</strong>
        {winnerMate.home && <span> · From {stateName(winnerMate.home)}</span>}</p>}
      {term.turnout && <p className="winner-mate">Turnout <strong>{percent(term.turnout.overall)}</strong>
        {term.suffrage && <span> · {term.suffrage.label}</span>}</p>}
      <dl className="winner-stats">
        <div><dt>Electoral votes</dt><dd>{live > 0
          ? <>{Math.round(term.winnerElectoralShare * live)}<small className="winner-of"> of {live}</small></>
          : percent(term.winnerElectoralShare)}</dd></div>
        {display === 'percent'
          ? <div><dt>Popular vote</dt><dd>{percent(term.winnerPopularShare)}</dd>
            <small className="winner-votes" title="Estimated from real US turnout for this year, scaled to this timeline's electoral votes">
              ≈ {approximateCount(estimatedWinnerVotes(term, live))} votes</small></div>
          : <div><dt>Popular vote</dt><dd title="Estimated from real US turnout for this year, scaled to this timeline's electoral votes">{compactCount(estimatedWinnerVotes(term, live))}</dd>
            <small className="winner-votes">{percent(term.winnerPopularShare)} of the vote · estimated</small></div>}
      </dl>
    </div>
    <div className="results-parties">
      <table className="results-table" aria-label="Party results">
        <thead><tr><th scope="col">Party</th><th scope="col"><abbr title="Electoral College">EC</abbr></th>
          <th scope="col"><abbr title={display === 'percent' ? 'Popular vote' : 'Popular votes, estimated from real US turnout'}>PV</abbr></th><th scope="col">Ideology</th></tr></thead>
        <tbody>{results.map((party) => (
          <tr key={party.index}>
            <th scope="row"><PartyLink party={party.index} />{nomineeOf(party.index) && <small className="nominee"
              title={nomineeTitle(nomineeOf(party.index)!, mateOf(party.index))}>{nomineeOf(party.index)!.name}
              {mateOf(party.index) && ` / ${mateOf(party.index)!.name}`}</small>}
            {term.spoiler && party.index === P.THIRD && <small className="nominee spoiler-note">Split from {partyName(term.spoiler.party)}</small>}</th>
            <td>{percent(party.electoral)}</td>
            {/* The hover text sits on the cell: this table styles any span as a faint sub-label. */}
            <td title={party.popular === null || display === 'percent' ? undefined
              : `${percent(party.popular)} · ≈ ${approximateCount(estimatedVotes(term, party.popular, live))} votes`}>
              {party.popular === null ? <span aria-label="Popular vote not recorded">—</span>
                : display === 'percent' ? percent(party.popular) : compactCount(estimatedVotes(term, party.popular, live))}</td>
            <td>{party.support > 0 || party.won ? <>{signed(party.ideology)}<span>{ideologyLabel(party.ideology)}</span></> : '—'}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
    {faithlessSummary(term) && <p className="results-note">Faithless electors: {faithlessSummary(term)}.</p>}
    {term.grid.recounts?.length ? <p className="results-note">Recounts: {term.grid.recounts.map((r) =>
      `${STATES[r.state]!.name} (${r.flipped ? 'flipped' : 'held'})`).join(', ')}.</p> : null}
    <div className="results-congress">
      <span className="eyebrow">Congress leader</span>
      <div><PartyLink party={term.congressLeader} /><strong>{percent(term.congress[term.congressLeader]!)}</strong></div>
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
      <div><span className="eyebrow">President</span><strong><PresidentLink name={term.winnerName} began={began} /></strong>
        <PartyLink party={term.winnerParty} />
        {next?.succession ? <small className="term-succession">{successionText(next.succession)}</small>
          : next?.vicePresident && <small>Vice president {next.vicePresident}</small>}</div>
      <div><span className="eyebrow">Term event</span><strong>{descriptor || 'No major event'}</strong>
        <small>{ideologyLabel(ideology)} · {signed(ideology)}</small></div>
      <div><span className="eyebrow">Election-day approval</span>
        <strong>{next ? percent(next.electionDayApproval) : '—'}</strong>
        <small>{next ? `${percent(next.dayOneApproval)} on day one` : 'No election after 2064'}</small></div>
      <div><span className="eyebrow">Supreme Court ideology</span>
        <strong>{next ? signed(next.courtAverage) : '—'}</strong>
        <small>{next ? justiceCount(next.court.filter((seat) => seat !== null).length) : 'Not simulated after 2064'}</small></div>
      <div><span className="eyebrow">Territorial expansions</span><strong>{territories.length}</strong>
        <small>{territories.length ? territories.join(', ') : 'None recorded'}</small></div>
    </div>
    <p className="term-ending">{ending}.</p>
  </section>;
}
