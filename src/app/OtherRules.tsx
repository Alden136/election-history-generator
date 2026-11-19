import { partyName } from '../engine/data';
import type { Timeline } from '../engine/simulate';
import type { Term } from '../engine/types';
import { otherRules } from './electionNotes';
import { PartyLink } from './People';
import { ELECTOR_RULE_LABELS, percent } from './presentation';

/**
 * Who would have won this election under each way of choosing electors,
 * worked out from the same state votes. Changes nothing: the timeline runs
 * under the method chosen in Rules. Shown only with the state popular vote on.
 */
export function OtherRulesPanel({ timeline, term }: { timeline: Timeline; term: Term }) {
  const rows = otherRules(timeline.terms, term, new Set(timeline.corrections));
  if (!rows) return null;
  const differ = rows.filter((row) => row.party !== term.winnerParty).length;

  return <section className="panel other-rules" aria-labelledby="other-rules-title">
    <div className="panel-header">
      <h3 id="other-rules-title">Under other rules</h3>
      <span className="panel-count">{differ ? `${differ} of ${rows.length} methods change the winner` : 'Every method agrees'}</span>
    </div>
    <ol className="other-rules-grid">
      {rows.map((row) => <li key={row.rule} data-current={row.rule === timeline.electorRule || undefined} data-differs={row.party !== term.winnerParty || undefined}>
        <span className="eyebrow">{ELECTOR_RULE_LABELS[row.rule]}{row.rule === timeline.electorRule ? ' · this timeline' : ''}</span>
        <strong><PartyLink party={row.party} /></strong>
        <small>{row.electors
          ? `${row.electors.winner} of ${row.electors.live} electors (${partyName(row.electors.runnerUpParty)} ${row.electors.runnerUp})${row.byCongress ? ' · no majority, Congress chose' : ''}`
          : `${percent(row.share)} of the national vote`}</small>
      </li>)}
    </ol>
    <p className="other-rules-note">Worked out from this election's state votes. Only the method chosen in Rules changes history.
      {term.faithless?.length ? ' The actual result also counts faithless electors.' : ''}</p>
  </section>;
}
