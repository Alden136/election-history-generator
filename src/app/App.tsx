import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ELECTIONS, PARTIES } from '../engine/data';
import { simulate } from '../engine/simulate';
import { Charts } from './Charts';
import { Congress } from './Congress';
import { DialSettings } from './DialSettings';
import { encodeDials, modifiedDials } from './dials';
import { downloadTimeline } from './export';
import { ElectionMap, ElectionResults, TermDetails, YearPicker } from './Election';
import { Finder } from './Finder';
import { ElectionRail, History } from './History';
import { Icon } from './Icon';
import { Overview } from './Overview';
import { Parties, Presidents, ProfileLinksContext } from './People';
import { Playback } from './Playback';
import { partyProfiles, presidencies, presidencyAt } from './profiles';
import { StatePanel } from './StatePanel';
import { SavedTimelines } from './SavedTimelines';
import { readVoteDisplay, storeVoteDisplay, VoteDisplayContext } from './voteDisplay';
import { addSaved, loadSaved, locationOf, removeSaved, SAVED_KEY, writeSaved, type SavedTimeline } from './saved';
import { Statistics } from './Statistics';
import { PRESET_LABELS, RuleSettings } from './RuleSettings';
import { MAX_SEED, parseSeed, readLocation, timelineUrl, type TimelineLocation } from './presentation';
import './styles.css';

const views = [
  { id: 'election', label: 'Election map', short: 'Map', icon: 'map' },
  { id: 'history', label: 'Political history', short: 'History', icon: 'history' },
  { id: 'charts', label: 'Trends', short: 'Trends', icon: 'chart' },
  { id: 'statistics', label: 'Statistics', short: 'Stats', icon: 'stats' },
  { id: 'finder', label: 'Finder', short: 'Finder', icon: 'search' },
] as const;
type View = typeof views[number]['id'];
const historyTabs = [
  { id: 'elections', label: 'Elections' },
  { id: 'presidents', label: 'Presidents' },
  { id: 'parties', label: 'Parties' },
] as const;
type HistoryTab = typeof historyTabs[number]['id'];

export function App() {
  const [location, setLocation] = useState(() => readLocation(window.location.search));
  const { seed, year, corrections, dials } = location;
  const [playing, setPlaying] = useState(false);
  const [dialsOpen, setDialsOpen] = useState(false);
  const dialsButton = useRef<HTMLButtonElement>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const rulesButton = useRef<HTMLButtonElement>(null);
  const [savedOpen, setSavedOpen] = useState(false);
  const savedButton = useRef<HTMLButtonElement>(null);
  const [saved, setSaved] = useState(() => loadSaved());
  // Popular votes as estimated counts (the default) or percentages; a display choice kept in this browser.
  const [voteDisplay, setVoteDisplay] = useState(readVoteDisplay);
  const [draft, setDraft] = useState(String(seed));
  const [view, setView] = useState<View>('election');
  const [historyTab, setHistoryTab] = useState<HistoryTab>('elections');
  // The party page and president row to show; links from elsewhere in the app set these.
  const [focusParty, setFocusParty] = useState<number | null>(null);
  const [focusPresident, setFocusPresident] = useState<number | null>(null);
  // The state whose history panel is open. It stays open while the year or seed changes.
  const [selectedState, setSelectedState] = useState<number | null>(null);
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
  const people = useMemo(() => {
    const list = presidencies(timeline.terms, timeline.finalPresident);
    return { list, parties: partyProfiles(timeline.terms, list, PARTIES.length) };
  }, [timeline]);
  const shareUrl = timelineUrl(window.location.href, location).href;
  const caption = { seed, url: shareUrl,
    rules: `${PRESET_LABELS[timeline.preset]} rules${adjusted ? ` · ${adjusted} ${adjusted === 1 ? 'dial' : 'dials'} adjusted` : ''}` };

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

  // Keep the saved list in step when another tab changes it.
  useEffect(() => {
    const sync = (event: StorageEvent) => { if (event.key === SAVED_KEY || event.key === null) setSaved(loadSaved()); };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);

  /** Stores a new saved list; the list on screen changes either way, but false means it will not last. */
  function storeSaved(next: SavedTimeline[]): boolean {
    setSaved(next);
    return writeSaved(next);
  }

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

  function openHistoryTab(tab: HistoryTab) {
    setHistoryTab(tab);
    openView('history');
  }

  const profileLinks = {
    openParty: (party: number) => { setFocusParty(party); openHistoryTab('parties'); },
    openPresident: (began: number) => {
      setFocusPresident(presidencyAt(people.list, began)?.number ?? null);
      openHistoryTab('presidents');
    },
  };

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

  function openSaved(item: SavedTimeline) {
    const next = locationOf(item);
    setDraft(String(next.seed));
    setError('');
    setPlaying(false);
    navigate(next);
  }

  function openFound(next: TimelineLocation) {
    setDraft(String(next.seed));
    setError('');
    setPlaying(false);
    navigate(next);
    openView('election');
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
            aria-label={item.label} onClick={() => openView(item.id)}><Icon name={item.icon} />
            <span className="nav-full">{item.label}</span><span className="nav-short">{item.short}</span></button>)}
        </nav>
        <span className="topbar-range">1792 <i /> 2064</span>
      </div>
    </header>
    <VoteDisplayContext.Provider value={voteDisplay}>
    <ProfileLinksContext.Provider value={profileLinks}>
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
            <button ref={savedButton} className="rules-button" type="button" aria-haspopup="dialog"
              onClick={() => { setPlaying(false); setSavedOpen(true); }}>
              <Icon name="bookmark" size={15} /><span>Saved</span>{saved.length > 0 && <strong>{saved.length}</strong>}
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
          <ElectionRail terms={timeline.terms} year={year} chooseYear={chooseYear} openHistory={() => openHistoryTab('elections')} />
          <ElectionMap key={`${timelineKey}/${year}`} term={term} caption={caption} selected={selectedState} select={setSelectedState} />
          {selectedState !== null && <StatePanel terms={timeline.terms} state={selectedState} year={year}
            chooseYear={chooseYear} close={() => setSelectedState(null)} />}
          <ElectionResults term={term} winnerIdeology={timeline.terms[term.index + 1]?.potusIdeology ?? timeline.finalPresident.ideology}
            winnerBegan={timeline.terms[term.index + 1]?.termBegan ?? timeline.finalPresident.termBegan} />
        </div>
        <Overview timeline={timeline} openElection={openElection} />
        <Congress term={term} court={timeline.terms[term.index + 1]?.court} caption={caption} />
        <TermDetails timeline={timeline} term={term} />
      </>}
      {view === 'history' && <>
        <div className="segmented history-tabs" role="group" aria-label="Political history">
          {historyTabs.map((tab) => <button key={tab.id} type="button" aria-pressed={historyTab === tab.id}
            onClick={() => { setHistoryTab(tab.id); setFocusPresident(null); }}>{tab.label}</button>)}
        </div>
        {historyTab === 'elections' && <History terms={timeline.terms} final={timeline.finalPresident} year={year} chooseYear={openElection} />}
        {historyTab === 'presidents' && <Presidents list={people.list} focus={focusPresident} openElection={openElection} />}
        {historyTab === 'parties' && <Parties profiles={people.parties} list={people.list} focus={focusParty} setFocus={setFocusParty}
          openPresident={(n) => { setFocusPresident(n); setHistoryTab('presidents'); window.scrollTo(0, 0); }} openElection={openElection} />}
      </>}
      {view === 'charts' && <Charts terms={timeline.terms} year={year} chooseYear={chooseYear} />}
      <div hidden={view !== 'statistics'}>
        <Statistics key={timelineKey} seed={seed} settings={settings} preset={timeline.preset} />
      </div>
      {/* Kept mounted so a search carries on while another page is open. */}
      <div hidden={view !== 'finder'}>
        <Finder settings={settings} preset={timeline.preset} year={year} openTimeline={openFound} />
      </div>
    </main>
    </ProfileLinksContext.Provider>
    </VoteDisplayContext.Provider>
    {rulesOpen && <RuleSettings corrections={corrections} voteDisplay={voteDisplay} apply={(selected, display) => {
      navigate({ corrections: selected });
      setVoteDisplay(display);
      storeVoteDisplay(display);
    }}
      dismiss={() => { setRulesOpen(false); rulesButton.current?.focus(); }} />}
    {dialsOpen && <DialSettings dials={dials} apply={(next) => navigate({ dials: next })}
      dismiss={() => { setDialsOpen(false); dialsButton.current?.focus(); }} />}
    {savedOpen && <SavedTimelines saved={saved} location={location}
      save={(name) => storeSaved(addSaved(saved, name, location))}
      open={openSaved}
      remove={(id) => storeSaved(removeSaved(saved, id))}
      restore={(item, index) => storeSaved([...saved.slice(0, index), item, ...saved.slice(index)])}
      dismiss={() => { setSavedOpen(false); savedButton.current?.focus(); }} />}
    <footer className="shell footer">
      <span>Based on WWH’s <cite>Election History Generator</cite> spreadsheet.</span>
    </footer>
  </>;
}
