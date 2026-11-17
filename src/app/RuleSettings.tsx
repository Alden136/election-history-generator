import { useEffect, useRef, useState } from 'react';
import { RULES, rulePreset, type Preset, type Rule } from '../engine/rules';
import type { VoteDisplay } from './voteDisplay';

export const PRESET_LABELS: Record<Preset, string> = { faithful: 'Faithful', corrected: 'Corrected', custom: 'Custom' };

const descriptions: Record<Rule, { title: string; detail: string }> = {
  'populist-authoritarian': {
    title: 'Populist Authoritarian votes',
    detail: 'Size and cap these votes using the Authoritarian bloc.',
  },
  'largest-voter-bloc': {
    title: 'Largest voter bloc',
    detail: 'Compare only the seven blocs when calculating ideology drift for Whig, Agrarian, Union, Socialist and Liberal.',
  },
  'republican-loyalty': {
    title: 'L. Republican state loyalty',
    detail: 'Allow states to stay with L. Republican when the party has support.',
  },
  'whig-loyalty': {
    title: 'Whig state loyalty',
    detail: 'Use Whig support to determine whether states can stay with the party.',
  },
  'american-party-trigger': {
    title: 'American party formation',
    detail: 'After 1847, a Whig president following a failed term can trigger the American party’s formation. ' +
      'This is a best guess: the sheet names a party called “BLUR”, which does not exist.',
  },
  'failed-president-penalty': {
    title: 'Failed presidency penalty',
    detail: 'Below −0.30 performance, subtract a random amount up to 0.14 from the governing named party’s strength.',
  },
  'liberal-winner-bonus': {
    title: 'Liberal election winner bonus',
    detail: 'Award the Third Party strength bonus when Liberal won the previous election.',
  },
  'canada-annexation': {
    title: 'Canada annexation',
    detail: 'Allow annexation when the previous president’s ideology is below −7 or above +7.',
  },
  'presidential-bloc-shift': {
    title: 'Liberal and Authoritarian approval shifts',
    detail: 'Apply the approval-driven bloc size changes under Liberal and Authoritarian presidents.',
  },
  'neutral-party-eligibility': {
    title: 'Neutral parties on the state ballot',
    detail: 'Let a party compete for states when it has support, including parties with ideology zero.',
  },
  'agrarian-liberal': {
    title: 'Agrarian Liberal votes',
    detail: 'Scale these votes by the Liberal bloc size.',
  },
  'bloc-size-floor': {
    title: 'Bloc size floor',
    detail: 'Keep bloc sizes at or above one after the state lean adjustment.',
  },
  'congress-rounding': {
    title: 'Congressional rounding',
    detail: 'Calculate Third Party’s seat share directly so rounding cannot create influence from zero raw seats.',
  },
  'presidential-tenure': {
    title: 'Presidential tenure dates',
    detail: 'Show actual stretches in office and sum the years served across separate stretches.',
  },
  'contingent-eligibility': {
    title: 'Contingent election eligibility',
    detail: 'When electoral votes are cast, Congress can choose only among the top-ranked parties that received them.',
  },
};

export function RuleSettings({ corrections, voteDisplay, apply, dismiss }: {
  corrections: readonly Rule[];
  voteDisplay: VoteDisplay;
  apply: (rules: readonly Rule[], voteDisplay: VoteDisplay) => void;
  dismiss: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<readonly Rule[]>(corrections);
  const [display, setDisplay] = useState<VoteDisplay>(voteDisplay);
  const preset = rulePreset(draft);

  useEffect(() => {
    if (dialog.current && !dialog.current.open) dialog.current.showModal();
  }, []);

  function toggle(rule: Rule) {
    setDraft((current) => current.includes(rule) ? current.filter((item) => item !== rule) : [...current, rule]);
  }

  return (
    <dialog className="rule-dialog" ref={dialog} aria-labelledby="rules-title" onClose={dismiss}>
      <form onSubmit={(event) => {
        event.preventDefault();
        apply(RULES.filter((rule) => draft.includes(rule)), display);
        dialog.current?.close();
      }}>
        <header className="rule-heading">
          <h2 id="rules-title">Simulation rules</h2>
          <p>Apply a preset or choose which spreadsheet quirks to correct.</p>
          <p className="rule-note">Changing any rule gives a different history for the same seed. A small change in
            one election snowballs through every later one, so this is not the same timeline with one thing fixed.
            The corrections also shift long-run results: Liberal and Agrarian win far less often, and expansions
            become more common.</p>
          <div className="rule-presets" role="group" aria-label="Rules presets">
            <button className="button secondary" type="button" autoFocus aria-pressed={preset === 'faithful'}
              onClick={() => setDraft([])}>Faithful</button>
            <button className="button secondary" type="button" aria-pressed={preset === 'corrected'}
              onClick={() => setDraft(RULES)}>Corrected</button>
            <span aria-live="polite">{PRESET_LABELS[preset]} · {draft.length} of {RULES.length} corrections</span>
          </div>
        </header>
        <div className="rule-scroll" role="region" aria-labelledby="corrections-label" tabIndex={0}>
          <fieldset className="rule-list">
            <legend className="rule-section" id="corrections-label">Corrections</legend>
            {RULES.map((rule) => <label className="rule-row" key={rule}>
              <span><strong>{descriptions[rule].title}</strong><small id={`rule-${rule}`}>{descriptions[rule].detail}</small></span>
              <input type="checkbox" role="switch" checked={draft.includes(rule)} onChange={() => toggle(rule)}
                aria-label={descriptions[rule].title} aria-describedby={`rule-${rule}`} />
            </label>)}
          </fieldset>
          <fieldset className="rule-list">
            <legend className="rule-section">Display</legend>
            <label className="rule-row">
              <span><strong>Popular vote as a percentage</strong><small id="rule-vote-display">Show each party's share of the
                popular vote instead of an estimated number of votes. The estimate scales real US turnout for that year to
                this timeline's electoral votes. This changes only what is shown, not the simulation.</small></span>
              <input type="checkbox" role="switch" checked={display === 'percent'}
                onChange={(event) => setDisplay(event.target.checked ? 'percent' : 'count')}
                aria-label="Popular vote as a percentage" aria-describedby="rule-vote-display" />
            </label>
          </fieldset>
        </div>
        <footer className="rule-actions">
          <button type="button" className="button secondary" onClick={() => dialog.current?.close()}>Cancel</button>
          <button type="submit" className="button primary">Apply rules</button>
        </footer>
      </form>
    </dialog>
  );
}
