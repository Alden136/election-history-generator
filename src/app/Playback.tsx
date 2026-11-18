import { useEffect, useState } from 'react';
import { ELECTIONS } from '../engine/data';
import { Icon } from './Icon';
import { readKey, shortcutFor } from './shortcuts';

const first = ELECTIONS[0]!;
const last = ELECTIONS.at(-1)!;

export function Playback({ year, playing, setPlaying, chooseYear, advance }: {
  year: number;
  playing: boolean;
  setPlaying: (playing: boolean) => void;
  chooseYear: (year: number) => void;
  advance: (year: number) => void;
}) {
  const [delay, setDelay] = useState(1200);
  useEffect(() => {
    if (!playing || year >= last) return;
    const timer = window.setTimeout(() => {
      const next = year + 4;
      advance(next);
      if (next === last) setPlaying(false);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [advance, delay, playing, setPlaying, year]);

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
      } else if (shortcut === 'previous' && year > first) chooseYear(year - 4);
      else if (shortcut === 'next' && year < last) chooseYear(year + 4);
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
      <input id="playback-year" type="range" min={first} max={last} step={4} value={year}
        onChange={(event) => chooseYear(Number(event.target.value))} />
      <div><span>{first}</span><output htmlFor="playback-year">{year} · {ELECTIONS.indexOf(year) + 1}/{ELECTIONS.length}</output><span>{last}</span></div>
      <p className="playback-keys"><kbd>←</kbd><kbd>→</kbd> step through elections <kbd>Space</kbd> play or pause</p>
    </div>
    <label className="playback-speed">Speed
      <select value={delay} onChange={(event) => setDelay(Number(event.target.value))}>
        <option value={2400}>0.5×</option><option value={1200}>1×</option><option value={600}>2×</option>
      </select>
    </label>
  </section>;
}
