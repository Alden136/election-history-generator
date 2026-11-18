import { useEffect, useState } from 'react';
import { Icon } from './Icon';
import { readKey, shortcutFor } from './shortcuts';

export function Playback({ year, years, playing, setPlaying, chooseYear, advance }: {
  year: number;
  /** Every year to step through: presidential elections, and midterms when they are on. */
  years: readonly number[];
  playing: boolean;
  setPlaying: (playing: boolean) => void;
  chooseYear: (year: number) => void;
  advance: (year: number) => void;
}) {
  const [delay, setDelay] = useState(1200);
  const first = years[0]!;
  const last = years.at(-1)!;
  const index = Math.max(0, years.indexOf(year));
  useEffect(() => {
    if (!playing || year >= last) return;
    const timer = window.setTimeout(() => {
      const next = years[years.indexOf(year) + 1] ?? last;
      advance(next);
      if (next === last) setPlaying(false);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [advance, delay, playing, setPlaying, year, years, last]);

  function togglePlayback() {
    if (playing) { setPlaying(false); return; }
    if (year === last) chooseYear(first);
    setPlaying(true);
  }

  // Left and right arrows step through elections; space plays or pauses.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.defaultPrevented) return;
      const shortcut = shortcutFor(readKey(event));
      if (!shortcut) return;
      event.preventDefault();
      if (shortcut === 'toggle') {
        if (!event.repeat) togglePlayback();
      } else if (shortcut === 'previous' && index > 0) chooseYear(years[index - 1]!);
      else if (shortcut === 'next' && index < years.length - 1) chooseYear(years[index + 1]!);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return <section className="panel playback" aria-label="Timeline playback">
    <div className="playback-buttons">
      <button className="button secondary" type="button" aria-keyshortcuts="Space" title="Space plays or pauses" onClick={togglePlayback}>
        <Icon name={playing ? 'pause' : 'play'} />{playing ? 'Pause' : 'Play timeline'}
      </button>
      <button className="icon-button" type="button" aria-label="Restart at 1792" title="Restart at 1792"
        onClick={() => chooseYear(first)}><Icon name="restart" /></button>
    </div>
    <div className="playback-track">
      <label className="sr-only" htmlFor="playback-year">Playback year</label>
      <input id="playback-year" type="range" min={0} max={years.length - 1} step={1} value={index}
        aria-valuetext={String(year)} onChange={(event) => chooseYear(years[Number(event.target.value)]!)} />
      <div><span>{first}</span><output htmlFor="playback-year">{year} · {index + 1}/{years.length}</output><span>{last}</span></div>
      <p className="playback-keys"><kbd>←</kbd><kbd>→</kbd> step through elections <kbd>Space</kbd> play or pause</p>
    </div>
    <label className="playback-speed">Speed
      <select value={delay} onChange={(event) => setDelay(Number(event.target.value))}>
        <option value={2400}>0.5×</option><option value={1200}>1×</option><option value={600}>2×</option>
      </select>
    </label>
  </section>;
}
