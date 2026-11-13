import { useEffect, useRef, useState, type FormEvent } from 'react';
import { PARTIES } from '../engine/data';
import type { Preset } from '../engine/rules';
import { TIMELINE_METRICS, type BatchStatistics } from '../engine/statistics';
import type { Settings } from '../engine/types';
import { modifiedDials } from './dials';
import { Party } from './Party';
import { percent } from './presentation';
import { PRESET_LABELS } from './RuleSettings';
import type { BatchMessage, BatchRequest } from './simulation.worker';

interface Run {
  count: number;
  completed: number;
  stats?: BatchStatistics;
  message?: string;
}

export function Statistics({ seed, settings, preset }: { seed: number; settings: Settings; preset: Preset }) {
  const [count, setCount] = useState(1000);
  const [run, setRun] = useState<Run>();
  const worker = useRef<Worker | null>(null);
  const running = run !== undefined && !run.stats && !run.message;

  useEffect(() => () => worker.current?.terminate(), []);

  function start(event: FormEvent) {
    event.preventDefault();
    if (worker.current) return;
    setRun({ count, completed: 0 });
    try {
      const job = new Worker(new URL('./simulation.worker.ts', import.meta.url), { type: 'module' });
      worker.current = job;
      const finish = () => {
        job.terminate();
        if (worker.current === job) worker.current = null;
      };
      job.onmessage = ({ data }: MessageEvent<BatchMessage>) => {
        if (worker.current !== job) return;
        if (data.type === 'progress') setRun({ count, completed: data.completed });
        else {
          finish();
          setRun(data.type === 'complete' ? { count, completed: count, stats: data.stats } :
            { count, completed: 0, message: data.message });
        }
      };
      job.onerror = () => {
        if (worker.current !== job) return;
        finish();
        setRun({ count, completed: 0, message: 'The batch worker failed. Reload the app and try again.' });
      };
      job.postMessage({ seed, count, settings } satisfies BatchRequest);
    } catch {
      worker.current?.terminate();
      worker.current = null;
      setRun({ count, completed: 0, message: 'The browser could not start the batch worker.' });
    }
  }

  function cancel() {
    worker.current?.terminate();
    worker.current = null;
    setRun((current) => current && { ...current, message: 'Batch canceled.' });
  }

  const changed = modifiedDials(settings.dials).length;
  return <section className="panel batch-panel" aria-labelledby="batch-title">
    <div className="history-controls">
      <div><h2 id="batch-title">Simulation statistics</h2>
        <p>{PRESET_LABELS[preset]} · {changed ? `${changed} adjusted dials` : 'Default dials'} · Starting seed {seed}</p></div>
      <form className="batch-controls" onSubmit={start}>
        <label>Timelines <select value={count} disabled={running} onChange={(event) => setCount(Number(event.target.value))}>
          {[100, 1000, 5000, 10000].map((n) => <option value={n} key={n}>{n.toLocaleString('en-US')}</option>)}
        </select></label>
        <button className="button primary" disabled={running}>Run batch</button>
        {running && <button className="button secondary" type="button" onClick={cancel}>Cancel batch</button>}
      </form>
    </div>
    <div className="batch-body">
      {!run && <p className="muted">Each run uses consecutive seeds and the active rules and dials. Election rates cover 1796–2064.</p>}
      {running && <div className="batch-progress">
        <progress aria-label="Batch progress" max={run.count} value={run.completed} />
        <span role="status">{run.completed.toLocaleString('en-US')} of {run.count.toLocaleString('en-US')} timelines</span>
      </div>}
      {run?.message && <p role="status">{run.message}</p>}
      {run?.stats && <BatchResults count={run.count} stats={run.stats} />}
    </div>
  </section>;
}

function BatchResults({ count, stats }: { count: number; stats: BatchStatistics }) {
  const mean = (key: string) => stats.means[TIMELINE_METRICS.indexOf(key)]!;
  const ranked = PARTIES.map((party, index) => ({ index, share: mean(party.name) })).sort((a, b) => b.share - a.share);
  const headline = [
    ['Timelines with a dictatorship', percent(stats.withDictatorship)],
    ['Timelines with a civil war', percent(stats.withCivilWar)],
    ['Elections decided by Congress', percent(mean('contingent'))],
    ['Average winner EC share', percent(mean('winnerEc'))],
    ['Average winner popular vote', percent(mean('winnerPv'))],
    ['Average weirdness', mean('weirdness').toFixed(2)],
  ];
  return <>
    <p className="batch-complete" role="status">{count.toLocaleString('en-US')} timelines simulated. Election rates cover 1796–2064.</p>
    <dl className="batch-headlines">
      {headline.map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value}</dd></div>)}
    </dl>
    <div className="batch-results">
      <div><h3>Election wins by party</h3>
        <ul className="batch-bars">{ranked.map(({ index, share }) => <li key={index}>
          <Party party={index} /><meter min={0} max={1} value={share} aria-label={PARTIES[index]!.name} /><strong>{percent(share)}</strong>
        </li>)}</ul>
      </div>
      <div><h3>Timeline outcomes</h3>
        <ul className="batch-bars">{stats.outcomes.map(({ label, count: n }) => <li key={label}>
          <span>{label.toLowerCase()}</span><meter min={0} max={1} value={n / count} aria-label={label} /><strong>{percent(n / count)}</strong>
        </li>)}</ul>
        <dl className="batch-averages">
          {([['Dictatorships', 'dictatorships'], ['Civil wars', 'civilWars'], ['Expansions', 'expansions'],
            ['Governing parties', 'governingParties']] as const).map(([label, key]) =>
            <div key={key}><dt>{label} per timeline</dt><dd>{mean(key).toFixed(2)}</dd></div>)}
        </dl>
      </div>
    </div>
  </>;
}
