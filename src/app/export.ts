import { partyName, STATES } from '../engine/data';
import type { Timeline } from '../engine/simulate';
import { SECEDED } from '../engine/types';
import { DIALS } from './dials';
import { decidedByCongress, type TimelineLocation } from './presentation';

function csvCell(value: string | number): string {
  if (typeof value === 'number') return String(value);
  return '"' + value.replaceAll('"', '""') + '"';
}

export function timelineCsv(timeline: Timeline, dials: TimelineLocation['dials']): string {
  const headers = [
    'Seed', 'Preset', 'Corrections', ...DIALS.map(({ label }) => label),
    'Election', 'President elected', 'Winning party', 'Popular vote (%)', 'Electoral College (%)',
    'Decided by Congress', 'Congress leader', 'Congress leader share (%)', 'Incumbent', 'Term began',
    'Term event', 'Election-day approval (%)', 'Supreme Court ideology', 'Eligible electors', 'Seceded electors',
    ...STATES.map(({ code, name }) => `${code} (${name})`),
  ];
  const metadata = [timeline.seed, timeline.preset, timeline.corrections.join(', '), ...DIALS.map(({ key }) => dials[key])];
  const rows = timeline.terms.map((term) => [
    ...metadata,
    term.election, term.winnerName, partyName(term.winnerParty), term.winnerPopularShare * 100,
    term.winnerElectoralShare * 100, decidedByCongress(term) ? 'Yes' : 'No', partyName(term.congressLeader),
    term.congress[term.congressLeader]! * 100, term.president, term.termBegan, term.descriptor,
    term.electionDayApproval * 100, term.courtAverage,
    term.index === 0 ? '' : term.grid.totalVotes - term.grid.secededVotes,
    term.index === 0 ? '' : term.grid.secededVotes,
    ...term.grid.winners.map((winner) => winner === SECEDED ? 'Seceded' : winner >= 0 ? partyName(winner) : 'No vote'),
  ]);
  return [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export function downloadTimeline(timeline: Timeline, dials: TimelineLocation['dials']) {
  const url = URL.createObjectURL(new Blob(['\ufeff', timelineCsv(timeline, dials)], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `election-timeline-${timeline.seed}.csv`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
