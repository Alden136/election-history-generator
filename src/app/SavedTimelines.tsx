import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import type { TimelineLocation } from './presentation';
import { describeSaved, MAX_NAME, sameTimeline, suggestedName, type SavedTimeline } from './saved';

const savedDate = (time: number) =>
  new Date(time).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/** Save the timeline on screen under a name, or reopen or delete one saved earlier. */
export function SavedTimelines({ saved, location, save, open, remove, restore, dismiss }: {
  saved: readonly SavedTimeline[];
  location: TimelineLocation;
  /** Each returns false when the browser would not store the change. */
  save: (name: string) => boolean;
  open: (item: SavedTimeline) => void;
  remove: (id: string) => boolean;
  restore: (item: SavedTimeline, index: number) => boolean;
  dismiss: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState('');
  const [status, setStatus] = useState<{ text: string; undo?: { item: SavedTimeline; index: number } } | null>(null);
  const existing = saved.find((item) => sameTimeline(item, location));
  const suggestion = suggestedName(location);

  useEffect(() => {
    if (dialog.current && !dialog.current.open) dialog.current.showModal();
  }, []);

  const failed = 'This browser would not store it. Private windows and blocked site data stop saving; use Share link instead.';

  return (
    <dialog className="rule-dialog saved-dialog" ref={dialog} aria-labelledby="saved-title" onClose={dismiss}>
      <div className="saved-layout">
        <header className="rule-heading">
          <h2 id="saved-title">Saved timelines</h2>
          <p>Kept in this browser on this device only. To move one to another device, use Share link.</p>
          <form className="saved-form" onSubmit={(event) => {
            event.preventDefault();
            const ok = save(name);
            setStatus({ text: ok ? `Saved “${name.trim().slice(0, MAX_NAME) || suggestion}”.` : failed });
            if (ok) setName('');
          }}>
            <label htmlFor="saved-name">Name this timeline</label>
            <div>
              <input id="saved-name" autoFocus autoComplete="off" maxLength={MAX_NAME} value={name}
                placeholder={suggestion} onChange={(event) => setName(event.target.value)} />
              <button className="button primary" type="submit"><Icon name="bookmark" />Save</button>
            </div>
            {existing && <small>This timeline is already saved as “{existing.name}”.</small>}
          </form>
        </header>
        <div className="rule-scroll" role="region" aria-label="Saved timelines list" tabIndex={0}>
          {saved.length === 0
            ? <p className="saved-empty">Nothing saved yet. Name the timeline on screen above and press Save.</p>
            : <ul className="saved-list">
              {saved.map((item, index) => <li key={item.id} aria-current={item === existing ? 'true' : undefined}>
                <div>
                  <strong>{item.name}</strong>
                  <small>{describeSaved(item)}</small>
                  <small>Saved {savedDate(item.savedAt)}</small>
                </div>
                <button className="button secondary" type="button" onClick={() => { open(item); dialog.current?.close(); }}>
                  Open</button>
                <button className="icon-button" type="button" aria-label={`Delete ${item.name}`} title="Delete"
                  onClick={() => {
                    const ok = remove(item.id);
                    setStatus(ok ? { text: `Deleted “${item.name}”.`, undo: { item, index } } : { text: failed });
                  }}><Icon name="close" size={15} /></button>
              </li>)}
            </ul>}
        </div>
        <footer className="rule-actions saved-actions">
          <p role="status">{status?.text}
            {status?.undo && <button className="text-button" type="button" onClick={() => {
              const ok = restore(status.undo!.item, status.undo!.index);
              setStatus({ text: ok ? `Restored “${status.undo!.item.name}”.` : failed });
            }}>Undo</button>}
          </p>
          <button type="button" className="button secondary" onClick={() => dialog.current?.close()}>Close</button>
        </footer>
      </div>
    </dialog>
  );
}
