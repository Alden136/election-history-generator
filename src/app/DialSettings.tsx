import { useEffect, useRef, useState } from 'react';
import { DEFAULT_DIALS } from '../engine/data';
import type { Dials } from '../engine/types';
import { DIALS } from './dials';

export function DialSettings({ dials, apply, dismiss }: {
  dials: Dials;
  apply: (dials: Dials) => void;
  dismiss: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState(dials);

  useEffect(() => {
    if (dialog.current && !dialog.current.open) dialog.current.showModal();
  }, []);

  return <dialog className="rule-dialog dial-dialog" ref={dialog} aria-labelledby="dials-title" onClose={dismiss}>
    <form onSubmit={(event) => {
      event.preventDefault();
      apply(draft);
      dialog.current?.close();
    }}>
      <header className="rule-heading">
        <h2 id="dials-title">Simulation dials</h2>
        <p>Change the inputs for this seed. Share links include any adjusted values.</p>
      </header>
      <div className="rule-scroll" role="region" aria-label="Simulation sliders" tabIndex={0}>
        <div className="dial-list">
          {DIALS.map(({ key, label, detail, min, max, step }) => <div className="dial-row" key={key}>
            <div><label htmlFor={key}>{label}</label><output htmlFor={key}>{draft[key]}</output></div>
            <input id={key} type="range" min={min} max={max} step={step} value={draft[key]} aria-describedby={`${key}-detail`}
              onChange={(event) => setDraft({ ...draft, [key]: Number(event.target.value) })} />
            <small id={`${key}-detail`}>{detail} Default {DEFAULT_DIALS[key]}.</small>
          </div>)}
        </div>
      </div>
      <footer className="rule-actions">
        <button className="button secondary reset-dials" type="button" onClick={() => setDraft(DEFAULT_DIALS)}>Reset defaults</button>
        <button className="button secondary" type="button" onClick={() => dialog.current?.close()}>Cancel</button>
        <button className="button primary" type="submit">Apply dials</button>
      </footer>
    </form>
  </dialog>;
}
