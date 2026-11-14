import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ELECTIONS } from '../engine/data';
import { simulate } from '../engine/simulate';
import { Charts } from './Charts';
import { DialSettings } from './DialSettings';
import { encodeDials, modifiedDials } from './dials';
import { downloadTimeline } from './export';
import { ElectionMap, ElectionResults, TermDetails, YearPicker } from './Election';
import { ElectionRail, History } from './History';
import { Icon } from './Icon';
import { Overview } from './Overview';
import { Playback } from './Playback';
import { Statistics } from './Statistics';
import { PRESET_LABELS, RuleSettings } from './RuleSettings';
import { MAX_SEED, parseSeed, readLocation, timelineUrl, type TimelineLocation } from './presentation';
import './styles.css';

const views = [
  { id: 'election', label: 'Election map', icon: 'map' },
  { id: 'history', label: 'Political history', icon: 'history' },
  { id: 'charts', label: 'Trends', icon: 'chart' },
  { id: 'statistics', label: 'Statistics', icon: 'stats' },
] as const;
type View = typeof views[number]['id'];

export function App() {
  const [location, setLocation] = useState(() => readLocation(window.location.search));
  const { seed, year, corrections, dials } = location;
  const [playing, setPlaying] = useState(false);
  const [dialsOpen, setDialsOpen] = useState(false);
  const dialsButton = useRef<HTMLButtonElement>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const rulesButton = useRef<HTMLButtonElement>(null);
  const [draft, setDraft] = useState(String(seed));
  const [view, setView] = useState<View>('election');
  const [error, setError] = useState('');
  const [shareStatus, setShareStatus] = useState<'idle' | 'copied' | 'manual'>('idle');
  const shareTimer = useRef<number | undefined>(undefined);
  const shareRequest = useRef(0);
  const main = useRef<HTMLElement>(null);
  const settings = useMemo(() => ({ dials, corrections }), [dials, corrections]);
  const timeline = useMemo(() => simulate(seed, settings), [seed, settings]);
  const adjusted = modifiedDials(dials).length;
  const timelineKey = `${seed}/${corrections.join(',')}/${encodeDials(dials)}`;
  const term = timeline.terms[ELECTIONS.indexOf(year)]!;
  const shareUrl = timelineUrl(window.location.href, location).href;

  useEffect(() => {
    const update = () => {
      const next = readLocation(window.location.search);
      setLocation(next);
      setPlaying(false);
      setDraft(String(next.seed));
      setError('');
      setShareStatus('idle');
      shareRequest.current++;
    };
    const initial = readLocation(window.location.search);
    const canonical = timelineUrl(window.location.href, initial);
    window.history.replaceState(null, '', canonical);
    window.addEventListener('popstate', update);
    return () => {
      window.removeEventListener('popstate', update);
      window.clearTimeout(shareTimer.current);
    };
  }, []);

  const navigate = useCallback((change: Partial<TimelineLocation>, replace = false) => {
    const nextLocation = { ...location, ...change };
    const next = timelineUrl(window.location.href, nextLocation);
    if (next.href !== window.location.href) {
      if (replace) window.history.replaceState(null, '', next);
      else window.history.pushState(null, '', next);
    }
    setLocation(nextLocation);
    setShareStatus('idle');
    shareRequest.current++;
    window.clearTimeout(shareTimer.current);
  }, [location]);

  const advance = useCallback((nextYear: number) => navigate({ year: nextYear }, true), [navigate]);

  function openView(next: View) {
    setView(next);
    setPlaying(false);
    if (main.current && main.current.getBoundingClientRect().top < 0) window.scrollTo(0, 0);
  }

  function chooseYear(nextYear: number) {
    setPlaying(false);
    navigate({ year: nextYear });
  }

  function openElection(nextYear: number) {
    chooseYear(nextYear);
    openView('election');
  }

  function loadSeed(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = parseSeed(draft);
    if (next === null) {
      setError(`Enter a whole number from 0 to ${MAX_SEED.toLocaleString('en-US')}.`);
      return;
    }
    setDraft(String(next));
    setError('');
    setPlaying(false);
    navigate({ seed: next });
  }

  function newTimeline() {
    const draw = new Uint32Array(1);
    do window.crypto.getRandomValues(draw); while (draw[0] === seed);
    const next = draw[0]!;
    setDraft(String(next));
    setError('');
    setPlaying(false);
    navigate({ seed: next });
  }

  async function share() {
    const request = ++shareRequest.current;
    window.clearTimeout(shareTimer.current);
    try {
      await navigator.clipboard.writeText(shareUrl);
      if (shareRequest.current !== request) return;
      setShareStatus('copied');
      shareTimer.current = window.setTimeout(() => setShareStatus('idle'), 2200);
    } catch {
      if (shareRequest.current === request) setShareStatus('manual');
    }
  }

  return <>
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="topbar">
      <div className="shell topbar-inner">
        <button className="brand" type="button" onClick={() => openView('election')}><span className="brand-icon"><Icon name="mark" size={19} /></span>
          <span>Election<span className="brand-accent"> Simulator</span></span></button>
        <nav aria-label="Main navigation">
          {views.map((item) => <button type="button" key={item.id} aria-current={view === item.id ? 'page' : undefined}
            onClick={() => openView(item.id)}><Icon name={item.icon} />{item.label}</button>)}
        </nav>
        <span className="topbar-range">1792 <i /> 2064</span>
      </div>
    </header>
    <main className="shell main" id="main" ref={main}>
      <div className="masthead">
        <div>
          <h1>Election History <em>Generator</em></h1>
        </div>
        <div className="seed-controls">
          <div className="seed-actions">
            <form className="seed-form" onSubmit={loadSeed}>
              <label htmlFor="seed">Seed</label>
              <input id="seed" inputMode="numeric" autoComplete="off" spellCheck={false} value={draft}
                aria-invalid={Boolean(error)} aria-describedby={error ? 'seed-error' : undefined}
                onChange={(event) => { setDraft(event.target.value); setError(''); }} />
              <button className="icon-button" type="submit" aria-label="Load seed" title="Load seed"><Icon name="arrow" size={16} /></button>
            </form>
            <button className="button primary" type="button" onClick={newTimeline}><Icon name="shuffle" />New timeline</button>
            <button className="button secondary share-button" type="button" onClick={share}>
              <Icon name={shareStatus === 'copied' ? 'check' : 'link'} />{shareStatus === 'copied' ? 'Copied' : 'Share link'}</button>
          </div>
          <div className="timeline-tools">
            <button ref={rulesButton} className="rules-button" type="button" aria-haspopup="dialog"
              onClick={() => { setPlaying(false); setRulesOpen(true); }}>
              <Icon name="rules" size={15} /><span>Rules</span><strong>{PRESET_LABELS[timeline.preset]}</strong><Icon name="down" size={12} />
            </button>
            <button ref={dialsButton} className="rules-button" type="button" aria-haspopup="dialog"
              onClick={() => { setPlaying(false); setDialsOpen(true); }}>
              <Icon name="rules" size={15} /><span>Dials</span>{adjusted > 0 && <strong>{adjusted} adjusted</strong>}
            </button>
            <button className="rules-button" type="button" onClick={() => downloadTimeline(timeline, dials)}>
              <Icon name="download" size={15} />Export CSV
            </button>
          </div>
          {error && <p className="seed-message error" role="alert" id="seed-error">{error}</p>}
          <span className="sr-only" role="status">{shareStatus === 'copied' ? 'Timeline link copied' : ''}</span>
          {shareStatus === 'manual' && <div className="share-fallback" role="group" aria-label="Copy timeline link">
            <label htmlFor="share-url">Copy this timeline link</label>
            <input id="share-url" value={shareUrl} readOnly autoFocus onFocus={(event) => event.target.select()} />
            <button className="text-button" type="button" onClick={() => setShareStatus('idle')}>Done</button>
          </div>}
        </div>
      </div>

      {view === 'election' && <>
        <div className="section-heading election-heading">
          <h2>The <span>{year}</span> election</h2>
          <YearPicker year={year} chooseYear={chooseYear} />
        </div>
        <Playback year={year} playing={playing} setPlaying={setPlaying} chooseYear={chooseYear} advance={advance} />
        <div className="election-layout">
          <ElectionRail terms={timeline.terms} year={year} chooseYear={chooseYear} openHistory={() => openView('history')} />
          <ElectionMap key={`${timelineKey}/${year}`} term={term} />
          <ElectionResults term={term} winnerIdeology={timeline.terms[term.index + 1]?.potusIdeology ?? timeline.finalPresident.ideology} />
        </div>
        <Overview timeline={timeline} openElection={openElection} />
        <TermDetails timeline={timeline} term={term} />
      </>}
      {view === 'history' && <History terms={timeline.terms} final={timeline.finalPresident} year={year} chooseYear={openElection} />}
      {view === 'charts' && <Charts terms={timeline.terms} year={year} chooseYear={chooseYear} />}
      <div hidden={view !== 'statistics'}>
        <Statistics key={timelineKey} seed={seed} settings={settings} preset={timeline.preset} />
      </div>
    </main>
    {rulesOpen && <RuleSettings corrections={corrections} apply={(selected) => navigate({ corrections: selected })}
      dismiss={() => { setRulesOpen(false); rulesButton.current?.focus(); }} />}
    {dialsOpen && <DialSettings dials={dials} apply={(next) => navigate({ dials: next })}
      dismiss={() => { setDialsOpen(false); dialsButton.current?.focus(); }} />}
    <footer className="shell footer">
      <span>Based on WWH’s <cite>Election History Generator</cite> spreadsheet.</span>
    </footer>
  </>;
}
