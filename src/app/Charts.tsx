import { useState } from 'react';
import { BLOC_NAMES, PARTIES } from '../engine/data';
import type { Term } from '../engine/types';
import { BLOC_COLORS, ideologyChartBounds, PARTY_COLORS, percent, signed } from './presentation';

type Metric = 'support' | 'electoral' | 'congress' | 'blocShares' | 'shownIdeology' | 'turnout';
const metrics = [
  { id: 'support', label: 'Party support' },
  { id: 'electoral', label: 'Electoral College' },
  { id: 'congress', label: 'Congress' },
  { id: 'blocShares', label: 'Ideology blocs' },
  { id: 'shownIdeology', label: 'Party ideology' },
  { id: 'turnout', label: 'Turnout' },
] as const;
/** Short names for the widenings of the vote, marked on the turnout chart. */
const SUFFRAGE_MARKS: Record<number, string> = { 1872: 'Black men', 1920: 'Women', 1968: 'Voting Rights Act', 1972: '18-year-olds' };
const xTicks = [1792, 1840, 1880, 1920, 1960, 2000, 2040, 2064];
const width = 1120;
const height = 330;
const left = 52;
const right = width - 24;
const top = 18;
const bottom = height - 42;

export function Charts({ terms, year, chooseYear }: {
  terms: readonly Term[]; year: number; chooseYear: (year: number) => void;
}) {
  const [chosenMetric, setMetric] = useState<Metric>('support');
  // Turnout is charted only when the turnout addition is on.
  const hasTurnout = terms.some((term) => term.turnout);
  const shownMetrics = metrics.filter((item) => item.id !== 'turnout' || hasTurnout);
  const metric: Metric = chosenMetric === 'turnout' && !hasTurnout ? 'support' : chosenMetric;
  const isTurnout = metric === 'turnout';
  /** A series value: bloc turnout, the whole electorate's (the last series), or the metric's entry. NaN where there is none. */
  const valueOf = (term: Term, i: number): number => isTurnout
    ? (i === BLOC_NAMES.length ? term.turnout?.overall : term.turnout?.blocs[i]) ?? NaN
    : term[metric][i]!;
  const [hoverYear, setHoverYear] = useState<number | null>(null);
  const [hidden, setHidden] = useState<Partial<Record<Metric, Set<number>>>>({});
  // A series the pointer or keyboard is on, and one the user clicked to keep highlighted.
  const [hovered, setHovered] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);
  const names = isTurnout ? [...BLOC_NAMES, 'All voters'] : metric === 'blocShares' ? BLOC_NAMES : PARTIES.map((party) => party.name);
  const colors = isTurnout ? [...BLOC_COLORS, 'var(--text)'] : metric === 'blocShares' ? BLOC_COLORS : PARTY_COLORS;
  const hiddenSeries = hidden[metric];
  const current = terms.find((term) => term.election === (hoverYear ?? year))!;
  const label = shownMetrics.find((item) => item.id === metric)!.label;
  const first = terms[0]!.election;
  const last = terms.at(-1)!.election;
  const series = names.map((name, i) => ({ name, i, color: colors[i]!, values: terms.map((term) => valueOf(term, i)) }));
  const active = series.filter(({ i, values }) => !hiddenSeries?.has(i) && values.some((value) => Math.abs(value) > 1e-9));
  const values = active.flatMap((line) => line.values).filter(Number.isFinite);
  const isIdeology = metric === 'shownIdeology';
  const step = isIdeology ? 5 : 0.2;
  const { min, max } = isIdeology ? ideologyChartBounds(values) : {
    min: Math.min(0, Math.floor(Math.min(...values, 0) * 5) / 5),
    max: Math.max(0.2, Math.ceil(Math.max(...values, 0) * 5) / 5),
  };
  const x = (value: number) => left + (value - first) / (last - first) * (right - left);
  const y = (value: number) => bottom - (value - min) / (max - min) * (bottom - top);
  const yTicks = Array.from({ length: Math.round((max - min) / step) + 1 }, (_, i) => min + i * step);
  const ranking = [...active].sort((a, b) => (valueOf(current, b.i) || 0) - (valueOf(current, a.i) || 0));
  const isBlocs = metric === 'blocShares' || isTurnout;
  const highlight = [hovered, pinned].find((i) => i !== null && active.some((line) => line.i === i)) ?? null;
  // Draw the highlighted line last so it sits on top of the others.
  const drawOrder = highlight === null ? active : [...active.filter((l) => l.i !== highlight), ...active.filter((l) => l.i === highlight)];
  const seriesClass = (i: number) => highlight === null ? undefined : i === highlight ? 'highlighted' : 'dimmed';

  /** Parties that reached 20% national support at some point. */
  const majorParties = new Set(PARTIES.map((_, i) => i).filter((i) => terms.some((term) => term.support[i]! >= 0.2)));

  function nearestYear(clientX: number, element: SVGSVGElement): number {
    const rect = element.getBoundingClientRect();
    const position = ((clientX - rect.left) * width / rect.width - left) / (right - left);
    const index = Math.round(Math.max(0, Math.min(1, position)) * (terms.length - 1));
    return terms[index]!.election;
  }

  function toggleSeries(index: number) {
    const next = new Set(hiddenSeries);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    setHidden({ ...hidden, [metric]: next });
  }

  function showOnly(keep: (index: number) => boolean) {
    setHidden({ ...hidden, [metric]: new Set(series.map((line) => line.i).filter((i) => !keep(i))) });
  }

  const togglePin = (index: number) => setPinned((current) => current === index ? null : index);

  return <section className="panel charts-panel" aria-labelledby="charts-title">
    <div className="history-controls">
      <div><h2 id="charts-title">Trends over time</h2><p>{first}–{last}</p></div>
      <div className="segmented" role="group" aria-label="Chart metric">
        {shownMetrics.map((item) => <button key={item.id} type="button" aria-pressed={metric === item.id}
          onClick={() => { setMetric(item.id); setHoverYear(null); setHovered(null); }}>{item.label}</button>)}
      </div>
    </div>
    <div className="chart-body">
      <div className="chart-plot">
        <svg className="plot" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${label} from ${first} to ${last}`}
          onPointerMove={(event) => { if (event.pointerType !== 'touch') setHoverYear(nearestYear(event.clientX, event.currentTarget)); }}
          onPointerLeave={() => setHoverYear(null)} onClick={(event) => {
            chooseYear(nearestYear(event.clientX, event.currentTarget)); setHoverYear(null);
          }}>
          {yTicks.map((value) => <g key={value}><line x1={left} x2={right} y1={y(value)} y2={y(value)} />
            <text x={left - 10} y={y(value) + 4} textAnchor="end">{isIdeology ? value : `${Math.round(value * 100)}%`}</text></g>)}
          {xTicks.map((tick) => <g key={tick}><line x1={x(tick)} x2={x(tick)} y1={top} y2={bottom} />
            <text x={x(tick)} y={height - 12} textAnchor="middle">{tick}</text></g>)}
          {drawOrder.map((line) => <polyline key={line.name} className={seriesClass(line.i)} fill="none" stroke={line.color}
            points={line.values.flatMap((value, i) => (Number.isFinite(value) ? [`${x(terms[i]!.election)},${y(value)}`] : [])).join(' ')} />)}
          {isTurnout && Object.entries(SUFFRAGE_MARKS).map(([at, mark]) => <g key={at} className="chart-mark">
            <line x1={x(Number(at))} x2={x(Number(at))} y1={top} y2={bottom} />
            <text x={x(Number(at)) + 4} y={top + 12 + (Number(at) === 1972 ? 14 : 0)}>{mark}</text></g>)}
          <line className="chart-cursor" x1={x(current.election)} x2={x(current.election)} y1={top} y2={bottom} />
          {drawOrder.filter((line) => Number.isFinite(valueOf(current, line.i))).map((line) => <circle key={line.name} className={seriesClass(line.i)} cx={x(current.election)}
            cy={y(valueOf(current, line.i))} r={line.i === highlight ? 5 : 4} fill={line.color} />)}
        </svg>
        <label className="chart-year">Election year <input type="range" min={first} max={last} step={4} value={year}
          onChange={(event) => { chooseYear(Number(event.target.value)); setHoverYear(null); }} /><output>{year}</output></label>
        <div className="chart-filters" role="group" aria-label="Show series">
          <button type="button" className="text-button" onClick={() => showOnly(() => true)}>Show all</button>
          {!isBlocs && <button type="button" className="text-button" onClick={() => showOnly((i) => majorParties.has(i))}>
            Major parties only</button>}
          <span className="muted">Hover a name to highlight it; click a name on the right to keep it highlighted.</span>
        </div>
        <div className="chart-legend" aria-label="Visible chart series" onPointerLeave={() => setHovered(null)}>
          {series.map((line) => <button type="button" key={line.name} aria-pressed={!hiddenSeries?.has(line.i)} onClick={() => toggleSeries(line.i)}
            onPointerEnter={() => setHovered(line.i)} onFocus={() => setHovered(line.i)} onBlur={() => setHovered(null)}>
            <span className="dot" style={{ backgroundColor: line.color }} />{line.name}
          </button>)}
        </div>
      </div>
      <div className="chart-values" aria-label={`${label} in ${current.election}`}>
        <span className="eyebrow">{label}</span><h3>{current.election}</h3>
        {ranking.length ? <ul onPointerLeave={() => setHovered(null)}>{ranking.map((line) => <li key={line.name}>
          <button type="button" className={seriesClass(line.i)} aria-pressed={pinned === line.i}
            onClick={() => togglePin(line.i)} onPointerEnter={() => setHovered(line.i)}
            onFocus={() => setHovered(line.i)} onBlur={() => setHovered(null)}>
            <span className="dot" style={{ backgroundColor: line.color }} /><span>{line.name}</span>
            <strong>{!Number.isFinite(valueOf(current, line.i)) ? '—' : isIdeology ? signed(valueOf(current, line.i)) : percent(valueOf(current, line.i))}</strong>
          </button>
        </li>)}</ul> : <p className="muted">No active series selected.</p>}
      </div>
    </div>
  </section>;
}
