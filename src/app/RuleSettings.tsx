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

export function RuleSettings({ corrections, midterms, traits, primaries, runningMates, popularVote, spoilers, voteDisplay, apply, dismiss }: {
  corrections: readonly Rule[];
  midterms: boolean;
  traits: boolean;
  primaries: boolean;
  runningMates: boolean;
  popularVote: boolean;
  spoilers: boolean;
  voteDisplay: VoteDisplay;
  apply: (rules: readonly Rule[], voteDisplay: VoteDisplay, midterms: boolean, traits: boolean, primaries: boolean, runningMates: boolean,
    popularVote: boolean, spoilers: boolean) => void;
  dismiss: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<readonly Rule[]>(corrections);
  const [display, setDisplay] = useState<VoteDisplay>(voteDisplay);
  const [withMidterms, setWithMidterms] = useState(midterms);
  const [withTraits, setWithTraits] = useState(traits);
  const [withPrimaries, setWithPrimaries] = useState(primaries);
  const [withRunningMates, setWithRunningMates] = useState(runningMates);
  const [withPopularVote, setWithPopularVote] = useState(popularVote);
  const [withSpoilers, setWithSpoilers] = useState(spoilers);
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
        apply(RULES.filter((rule) => draft.includes(rule)), display, withMidterms, withTraits, withPrimaries, withRunningMates, withPopularVote, withSpoilers);
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
            <legend className="rule-section">Additions</legend>
            <label className="rule-row">
              <span><strong>Midterm elections</strong><small id="rule-midterms">Elect Congress again two years into each term,
                starting in 1794. The president's party usually loses ground, more so when the term is going badly. The new
                Congress shapes approval, the Supreme Court and deadlocked elections, so this gives a different history for the
                same seed. On by default; the spreadsheet has no midterms, so switch this off to match it exactly.</small></span>
              <input type="checkbox" role="switch" checked={withMidterms} onChange={(event) => setWithMidterms(event.target.checked)}
                aria-label="Midterm elections" aria-describedby="rule-midterms" />
            </label>
            <label className="rule-row">
              <span><strong>Candidate traits</strong><small id="rule-traits">Every party picks a nominee before the vote. Their home
                state leans their way, charisma and experience move national support a little, and a sitting president running
                again gets an edge. Home states are real; charisma and experience are rolled for each timeline. On by default;
                switch this off to match the spreadsheet.</small></span>
              <input type="checkbox" role="switch" checked={withTraits} onChange={(event) => setWithTraits(event.target.checked)}
                aria-label="Candidate traits" aria-describedby="rule-traits" />
            </label>
            <label className="rule-row" data-disabled={!withTraits || undefined}>
              <span><strong>Primaries</strong><small id="rule-primaries">Each party's moderate and ideologue wings fight for the
                nomination. The winner's position is what voters see, what a winning president governs from, and it pulls the
                party toward it. A close, bitter fight costs the nominee support in November, and a president whose term went
                badly can be challenged. Needs candidate traits. On by default; switch this off to match the spreadsheet.</small></span>
              <input type="checkbox" role="switch" checked={withTraits && withPrimaries} disabled={!withTraits}
                onChange={(event) => setWithPrimaries(event.target.checked)} aria-label="Primaries" aria-describedby="rule-primaries" />
            </label>
            <label className="rule-row" data-disabled={!withTraits || undefined}>
              <span><strong>Running mates and succession</strong><small id="rule-running-mates">Every nominee picks a running mate,
                often their primary rival, whose home state leans a little toward the ticket. Each term the president may die,
                be assassinated or resign; the vice president then serves out the term and is the sitting president at the next
                election, with sympathy after a death and a hit after a resignation. Needs candidate traits. On by default;
                switch this off to match the spreadsheet.</small></span>
              <input type="checkbox" role="switch" checked={withTraits && withRunningMates} disabled={!withTraits}
                onChange={(event) => setWithRunningMates(event.target.checked)} aria-label="Running mates and succession"
                aria-describedby="rule-running-mates" />
            </label>
            <label className="rule-row" data-disabled={!(withTraits && withPrimaries) || undefined}>
              <span><strong>Spoiler candidates</strong><small id="rule-spoilers">Rarely, the loser of a bitter primary in a big
                party bolts and runs anyway as the Third Party's candidate, taking part of their old party's support with them,
                as Theodore Roosevelt did in 1912. Expect two or three in a timeline. Needs primaries. On by default; switch this
                off to match the spreadsheet.</small></span>
              <input type="checkbox" role="switch" checked={withTraits && withPrimaries && withSpoilers} disabled={!(withTraits && withPrimaries)}
                onChange={(event) => setWithSpoilers(event.target.checked)} aria-label="Spoiler candidates" aria-describedby="rule-spoilers" />
            </label>
            <label className="rule-row">
              <span><strong>State popular vote</strong><small id="rule-popular-vote">Every state counts its votes: each party's
                share comes from how close it is to the state, its national support, home states, the state's loyalty to last
                time's winner and some chance. The plurality wins the state, and the national popular vote adds the states up,
                so a president can win while losing the popular vote. On by default; switch this off to match the
                spreadsheet.</small></span>
              <input type="checkbox" role="switch" checked={withPopularVote} onChange={(event) => setWithPopularVote(event.target.checked)}
                aria-label="State popular vote" aria-describedby="rule-popular-vote" />
            </label>
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
