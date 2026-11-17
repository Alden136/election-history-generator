import { ELECTIONS } from '../engine/data';
import type { Timeline } from '../engine/simulate';
import { PartyLink, PresidentLink } from './People';
import { Icon } from './Icon';

export function Overview({ timeline, openElection }: { timeline: Timeline; openElection: (year: number) => void }) {
  const { summary, terms } = timeline;
  const metrics = [
    ['Weirdness score', summary.weirdness, summary.weirdnessLabel.toLowerCase()],
    ['Dictatorships', summary.dictatorships, ''],
    ['Civil wars', summary.civilWars, ''],
    ['Expansions', summary.expansions, ''],
    ['Governing parties', summary.governingParties, ''],
  ] as const;
  const notable = [
    ['In office in 2025', summary.current],
    ['Best performance', summary.best],
    ['Worst performance', summary.worst],
    ['Most radical', summary.radical],
    ['Longest-serving', summary.longest],
  ] as const;

  return (
    <section className="overview" aria-labelledby="overview-title">
      <div className="section-heading">
        <h2 id="overview-title">Timeline overview</h2>
        <span className="eyebrow">1792–2064</span>
      </div>
      <dl className="metrics panel">
        {metrics.map(([label, value, extra], i) => (
          <div key={label} className={i === 0 ? 'weirdness' : ''}>
            <dt>{label}</dt>
            <dd>{value}{extra && <span>{extra}</span>}</dd>
          </div>
        ))}
      </dl>
      <section className="noteworthy panel" aria-labelledby="noteworthy-title">
        <div className="panel-header"><h3 id="noteworthy-title">Noteworthy presidents</h3></div>
        <div className="notable-grid">
          {notable.map(([label, president]) => {
            // Open the election that put this president in office: the panel below
            // the map shows the term won in the selected election. A term that
            // begins in 1789 has no election before it, so open 1792 instead.
            const start = label === 'In office in 2025' ? 2025 : president.termStart;
            const year = ELECTIONS.includes(start - 1) ? start - 1
              : terms.find((term) => term.termBegan === start)?.election;
            return (
              <div className="notable" key={label}>
                <span className="eyebrow">{label}</span>
                <h4><PresidentLink name={president.name} began={start}>{president.name}<Icon name="arrow" size={14} /></PresidentLink></h4>
                <p><PartyLink party={president.party} /></p>
                <p className="notable-term">{year !== undefined && <button type="button" className="text-button notable-election"
                  title={`Open the ${year} election`} onClick={() => openElection(year)}>{year} election</button>}{year !== undefined && <> <span>·</span> </>}{president.terms?.map(({ start, end }) => `${start}–${end}`).join(', ') ??
                  (president.termEnd === null ? `Inaugurated ${president.termStart}` :
                    president.termStart === president.termEnd ? president.termStart : `${president.termStart}–${president.termEnd}`)}
                  {president.info && <> <span>·</span> {president.info}</>}</p>
              </div>
            );
          })}
        </div>
      </section>
    </section>
  );
}
