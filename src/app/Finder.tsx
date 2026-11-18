import { useEffect, useRef, useState, type FormEvent, type MouseEvent } from 'react';
import { ELECTIONS, PARTIES } from '../engine/data';
import type { Preset } from '../engine/rules';
import type { Settings } from '../engine/types';
import { modifiedDials } from './dials';
import { collectFinderResults, hasConditions, NO_CONDITIONS, TERRITORIES, TERRITORY_NAMES, type FinderConditions, type FinderMatch } from './timelineFinder';
import type { FinderMessage, FinderRequest } from './finder.worker';
import { Party } from './Party';
import { timelineUrl, type TimelineLocation } from './presentation';
import { PRESET_LABELS } from './RuleSettings';

const AT_LEAST = [0, 1, 2, 3];
/** Weirdness is a multiple of 0.5, and each label starts just above a whole number (see summary.ts). */
const WEIRDNESS = [
  { min: 0, label: 'Any' }, { min: 8.5, label: 'Odd or weirder' }, { min: 12.5, label: 'Uncomfortable or weirder' },
  { min: 15.5, label: 'Unsettling or weirder' }, { min: 20.5, label: 'Insane' },
];
const SEARCH_SIZES = [1000, 10000, 50000];
const MATCH_LIMITS = [10, 25, 50];

interface Run {
  conditions: FinderConditions;
  settings: Settings;
  preset: Preset;
  start: number;
  count: number;
  limit: number;
  searched: number;
  found: FinderMatch[];
  state: 'running' | 'done' | 'full' | 'canceled' | 'error';
  message?: string;
}

const randomSeed = () => window.crypto.getRandomValues(new Uint32Array(1))[0]!;
const number = (n: number) => n.toLocaleString('en-US');

/** Searches many seeds, in background workers, for timelines that meet the chosen conditions. */
export function Finder({ settings, preset, year, openTimeline }: {
  settings: Settings;
  preset: Preset;
  /** The year a result opens at when no winning year was asked for. */
  year: number;
  openTimeline: (location: TimelineLocation) => void;
}) {
  const [conditions, setConditions] = useState<FinderConditions>(NO_CONDITIONS);
  const [count, setCount] = useState(10000);
  const [limit, setLimit] = useState(25);
  const [run, setRun] = useState<Run>();
  const workers = useRef<Worker[]>([]);
  const running = run?.state === 'running';

  useEffect(() => () => stopWorkers(), []);

  function stopWorkers() {
    for (const worker of workers.current) worker.terminate();
    workers.current = [];
  }

  function search(start: number, base: Pick<Run, 'conditions' | 'settings' | 'preset' | 'limit' | 'count'>) {
    stopWorkers();
    const total = Math.min(base.count, 2 ** 32);
    const fresh: Run = { ...base, start, count: total, searched: 0, found: [], state: 'running' };
    setRun(fresh);
    // Leave a core for the page; more than four workers gains little for the memory it costs.
    const size = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1));
    const collect = collectFinderResults(start, total, base.limit, size);
    let current = fresh;
    const fail = (message: string) => {
      stopWorkers();
      setRun({ ...current, state: 'error', message });
    };
    try {
      for (let index = 0; index < size; index++) {
        const worker = new Worker(new URL('./finder.worker.ts', import.meta.url), { type: 'module' });
        workers.current.push(worker);
        worker.onmessage = ({ data }: MessageEvent<FinderMessage>) => {
          if (!workers.current.includes(worker)) return;
          if (data.type === 'error') { fail(data.message); return; }
          current = { ...current, ...collect(index, data.checked, data.found) };
          if (current.state !== 'running') stopWorkers();
          setRun(current);
        };
        worker.onerror = () => {
          if (workers.current.includes(worker)) fail('The search worker failed. Reload the app and try again.');
        };
        worker.postMessage({ start, count: total, index, workers: size, settings: base.settings, conditions: base.conditions } satisfies FinderRequest);
      }
    } catch {
      fail('The browser could not start the search.');
    }
  }

  function start(event: FormEvent) {
    event.preventDefault();
    if (!hasConditions(conditions) || running) return;
    search(randomSeed(), { conditions, settings, preset, limit, count });
  }

  function cancel() {
    stopWorkers();
    setRun((current) => current && { ...current, state: 'canceled' });
  }

  const set = (change: Partial<FinderConditions>) => setConditions((current) => ({ ...current, ...change }));
  const toggleTerritory = (territory: FinderConditions['territories'][number]) => set({
    territories: conditions.territories.includes(territory)
      ? conditions.territories.filter((t) => t !== territory)
      : TERRITORIES.filter((t) => t === territory || conditions.territories.includes(t)),
  });
  const changed = modifiedDials(settings.dials).length;

  return <section className="panel batch-panel finder" aria-labelledby="finder-title">
    <div className="history-controls">
      <div><h2 id="finder-title">Timeline finder</h2>
        <p>{PRESET_LABELS[preset]}{settings.midterms ? ' · Midterms' : ''}{settings.candidateTraits ? ' · Traits' : ''} · {changed ? `${changed} adjusted dials` : 'Default dials'} · Random starting seed</p></div>
    </div>
    <form className="finder-form" onSubmit={start}>
      <fieldset disabled={running}>
        <legend className="sr-only">Conditions</legend>
        <div className="finder-conditions">
          <label>Civil wars
            <select value={conditions.civilWars} onChange={(event) => set({ civilWars: Number(event.target.value) })}>
              {AT_LEAST.map((n) => <option key={n} value={n}>{n ? `At least ${n}` : 'Any'}</option>)}
            </select></label>
          <label>Dictatorships
            <select value={conditions.dictatorships} onChange={(event) => set({ dictatorships: Number(event.target.value) })}>
              {AT_LEAST.map((n) => <option key={n} value={n}>{n ? `At least ${n}` : 'Any'}</option>)}
            </select></label>
          <label>Weirdness
            <select value={conditions.minWeirdness} onChange={(event) => set({ minWeirdness: Number(event.target.value) })}>
              {WEIRDNESS.map(({ min, label }) => <option key={min} value={min}>{label}</option>)}
            </select></label>
          <div className="finder-winner" role="group" aria-labelledby="finder-winner-label">
            <span id="finder-winner-label">Wins the presidency</span>
            <div>
              <select aria-label="Party" value={conditions.winner?.party ?? -1}
                onChange={(event) => {
                  const party = Number(event.target.value);
                  set({ winner: party < 0 ? null : { party, year: conditions.winner?.year ?? year } });
                }}>
                <option value={-1}>Any party</option>
                {PARTIES.map((party, index) => <option key={party.name} value={index}>{party.name}</option>)}
              </select>
              <span>in</span>
              <select aria-label="Election year" value={conditions.winner?.year ?? year} disabled={!conditions.winner}
                onChange={(event) => conditions.winner && set({ winner: { ...conditions.winner, year: Number(event.target.value) } })}>
                {ELECTIONS.map((election) => <option key={election} value={election}>{election}</option>)}
              </select>
            </div>
          </div>
        </div>
        <div className="finder-territories" role="group" aria-labelledby="finder-territories-label">
          <span id="finder-territories-label">Has joined the country by 2065</span>
          <div>{TERRITORIES.map((territory) => <label key={territory}>
            <input type="checkbox" checked={conditions.territories.includes(territory)} onChange={() => toggleTerritory(territory)} />
            {TERRITORY_NAMES[territory]}</label>)}</div>
        </div>
        <div className="finder-actions batch-controls">
          <label>Search <select value={count} onChange={(event) => setCount(Number(event.target.value))}>
            {SEARCH_SIZES.map((n) => <option key={n} value={n}>{number(n)} seeds</option>)}
          </select></label>
          <label>Stop after <select value={limit} onChange={(event) => setLimit(Number(event.target.value))}>
            {MATCH_LIMITS.map((n) => <option key={n} value={n}>{n} matches</option>)}
          </select></label>
          <button className="button primary" disabled={!hasConditions(conditions)}>Find timelines</button>
          {hasConditions(conditions)
            ? <button className="text-button" type="button" onClick={() => setConditions(NO_CONDITIONS)}>Clear conditions</button>
            : <span className="muted">Pick at least one condition.</span>}
        </div>
      </fieldset>
      {running && <button className="button secondary finder-cancel" type="button" onClick={cancel}>Cancel search</button>}
    </form>
    <div className="batch-body">
      {!run && <p className="muted">Every match is checked against the full timeline, using the rules and dials above.
        Results open in the Election map.</p>}
      {run && <FinderResults run={run} year={year} openTimeline={openTimeline}
        more={() => search((run.start + run.searched) >>> 0, run)} />}
    </div>
  </section>;
}

function FinderResults({ run, year, openTimeline, more }: {
  run: Run; year: number; openTimeline: (location: TimelineLocation) => void; more: () => void;
}) {
  const location = (seed: number): TimelineLocation => ({
    seed, year: run.conditions.winner?.year ?? year, corrections: run.settings.corrections ?? [], dials: run.settings.dials,
    midterms: run.settings.midterms ?? false,
    traits: run.settings.candidateTraits ?? false,
  });
  const open = (event: MouseEvent<HTMLAnchorElement>, seed: number) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    openTimeline(location(seed));
  };
  const share = run.searched ? run.found.length / run.searched : 0;
  const summary = {
    running: `Searched ${number(run.searched)} of ${number(run.count)} seeds · ${run.found.length} found`,
    full: `Found ${run.found.length} matches in ${number(run.searched)} seeds`,
    done: run.found.length
      ? `Searched all ${number(run.count)} seeds · ${run.found.length} found (${(share * 100).toFixed(share < 0.01 ? 2 : 1)}%)`
      : `No matches in ${number(run.count)} seeds. Try fewer conditions or search more seeds.`,
    canceled: `Search canceled after ${number(run.searched)} seeds · ${run.found.length} found`,
    error: run.message ?? 'The search failed.',
  }[run.state];

  return <>
    {run.state === 'running'
      ? <div className="batch-progress">
        <progress aria-label="Search progress" max={run.count} value={run.searched} />
        <span role="status">{summary}</span>
      </div>
      : <div className="finder-summary">
        <p className="batch-complete" role="status">{summary}</p>
        {run.state !== 'error' && <button className="text-button" type="button" onClick={more}>
          Search the next {number(run.count)} seeds</button>}
      </div>}
    {run.found.length > 0 && <ol className="finder-results">
      {run.found.map((match) => <li key={match.seed}>
        <a href={timelineUrl(window.location.href, location(match.seed)).href} onClick={(event) => open(event, match.seed)}>
          Seed {match.seed}</a>
        <span className="finder-weird" data-label={match.weirdnessLabel}>{match.weirdness} · {match.weirdnessLabel.toLowerCase()}</span>
        <small>{[
          match.civilWars && `${match.civilWars} civil ${match.civilWars === 1 ? 'war' : 'wars'}`,
          match.dictatorships && `${match.dictatorships} ${match.dictatorships === 1 ? 'dictatorship' : 'dictatorships'}`,
          match.territories.length ? match.territories.map((t) => TERRITORY_NAMES[t]).join(', ') : 'No expansions',
        ].filter(Boolean).join(' · ')}</small>
        <span className="finder-2024"><span className="muted">2024</span> <Party party={match.winner2024} /></span>
      </li>)}
    </ol>}
  </>;
}
