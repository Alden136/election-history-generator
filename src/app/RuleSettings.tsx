import { useEffect, useRef, useState } from 'react';
import { activeAdditions, ELECTOR_RULE_LABELS, type AdditionSwitch, type Additions } from './presentation';
import { ELECTOR_RULES, type ElectorRule } from '../engine/electorRules';
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

/** Only the additions out of a timeline location. */
const pickAdditions = (a: Additions): Additions => ({
  midterms: a.midterms, traits: a.traits, primaries: a.primaries, runningMates: a.runningMates, popularVote: a.popularVote,
  spoilers: a.spoilers, recounts: a.recounts, faithless: a.faithless, turnout: a.turnout, electorRule: a.electorRule,
});

/** The additions' switches in the order the dialog lists them; needs says whether another addition must be on first. */
const ADDITION_ROWS: { key: AdditionSwitch; title: string; detail: string; needs?: (a: Additions) => boolean }[] = [
  { key: 'midterms', title: 'Midterm elections', detail: `Elect Congress again two years into each term, starting in 1794. The
    president's party usually loses ground, more so when the term is going badly. The new Congress shapes approval, the Supreme
    Court and deadlocked elections, so this gives a different history for the same seed. On by default; the spreadsheet has no
    midterms, so switch this off to match it exactly.` },
  { key: 'traits', title: 'Candidate traits', detail: `Every party picks a nominee before the vote. Their home state leans their
    way, charisma and experience move national support a little, and a sitting president running again gets an edge. Home
    states are real; charisma and experience are rolled for each timeline. On by default; switch this off to match the
    spreadsheet.` },
  { key: 'primaries', title: 'Primaries', needs: (a) => a.traits, detail: `Each party's moderate and ideologue wings fight for
    the nomination. The winner's position is what voters see, what a winning president governs from, and it pulls the party
    toward it. A close, bitter fight costs the nominee support in November, and a president whose term went badly can be
    challenged. Needs candidate traits. On by default; switch this off to match the spreadsheet.` },
  { key: 'runningMates', title: 'Running mates and succession', needs: (a) => a.traits, detail: `Every nominee picks a running
    mate, often their primary rival, whose home state leans a little toward the ticket. Each term the president may die, be
    assassinated or resign; the vice president then serves out the term and is the sitting president at the next election,
    with sympathy after a death and a hit after a resignation. Needs candidate traits. On by default; switch this off to match
    the spreadsheet.` },
  { key: 'spoilers', title: 'Spoiler candidates', needs: (a) => a.traits && a.primaries, detail: `Rarely, the loser of a bitter
    primary in a big party splits off and runs anyway as the Third Party's candidate, taking part of their old party's support
    with them, as Theodore Roosevelt did in 1912. Expect two or three in a timeline. Needs primaries. On by default; switch
    this off to match the spreadsheet.` },
  { key: 'popularVote', title: 'State popular vote', detail: `Every state counts its votes: each party's share comes from how
    close it is to the state, its national support, home states, the state's loyalty to last time's winner and some chance.
    The plurality wins the state, and the national popular vote adds the states up, so a president can win while losing the
    popular vote. On by default; switch this off to match the spreadsheet.` },
  { key: 'recounts', title: 'Close states and recounts', needs: (a) => a.popularVote, detail: `A state won by under half a point
    is counted again, and the closer it was, the likelier the recount flips it. When a recounted state could have changed who
    won the presidency, the result is contested, as in 1876 and 2000, and the winner starts their term less popular. Needs the
    state popular vote. On by default; switch this off to match the spreadsheet.` },
  { key: 'faithless', title: 'Faithless electors', needs: (a) => a.popularVote, detail: `Now and then one or two of a state's
    electors vote for the runner-up instead of the state's winner, and the results name them. This replaces the spreadsheet's
    unnamed stray electors. Needs the state popular vote. On by default; switch this off to match the spreadsheet.` },
  { key: 'turnout', title: 'Turnout and suffrage', detail: `Each ideology bloc turns out at its own rate: more after a close
    election and when a party stands near it, less for the president's side after a bad term. The vote widens when it did in
    real history (Black men in 1870, women in 1920, the Voting Rights Act in 1965, 18-year-olds in 1971), and new voters turn
    out less at first. On by default; switch this off to match the spreadsheet.` },
];

export function RuleSettings({ corrections, additions, voteDisplay, apply, dismiss }: {
  corrections: readonly Rule[];
  additions: Additions;
  voteDisplay: VoteDisplay;
  apply: (rules: readonly Rule[], voteDisplay: VoteDisplay, additions: Additions) => void;
  dismiss: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<readonly Rule[]>(corrections);
  const [display, setDisplay] = useState<VoteDisplay>(voteDisplay);
  const [chosen, setChosen] = useState<Additions>(() => pickAdditions(additions));
  const running = activeAdditions(chosen);
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
        apply(RULES.filter((rule) => draft.includes(rule)), display, chosen);
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
            {ADDITION_ROWS.map(({ key, title, detail, needs }) => {
              const available = needs ? needs(chosen) : true;
              return <label className="rule-row" key={key} data-disabled={!available || undefined}>
                <span><strong>{title}</strong><small id={`rule-${key}`}>{detail}</small></span>
                <input type="checkbox" role="switch" checked={available && running[key]} disabled={!available}
                  onChange={(event) => setChosen({ ...chosen, [key]: event.target.checked })} aria-label={title} aria-describedby={`rule-${key}`} />
              </label>;
            })}
            <label className="rule-row rule-choice" data-disabled={!chosen.popularVote || undefined}>
              <span><strong>How states choose electors</strong><small id="rule-elector-rule">Winner-take-all is how nearly every
                state does it and the only method the spreadsheet knows. By district gives the state's winner two electors and
                splits the rest by vote share, with a bonus for the leader. Proportional splits every elector by vote share.
                A national popular vote elects whoever wins the most votes nationwide. Every election also shows who would have
                won under each method. Needs the state popular vote.</small></span>
              <select value={running.electorRule} disabled={!chosen.popularVote} aria-describedby="rule-elector-rule"
                aria-label="How states choose electors" onChange={(event) => setChosen({ ...chosen, electorRule: event.target.value as ElectorRule })}>
                {ELECTOR_RULES.map((rule) => <option key={rule} value={rule}>{ELECTOR_RULE_LABELS[rule]}</option>)}
              </select>
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
