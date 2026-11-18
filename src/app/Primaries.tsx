import type { CSSProperties } from 'react';
import type { Term } from '../engine/types';
import { PartyLink } from './People';
import { FIGHT_LABELS, primaryEffects, signed } from './presentation';

/**
 * Each party's primary at this election, biggest party first: who ran from
 * which wing and where they stood, the primary vote, and what the fight cost.
 * Shown only when the primaries addition is on.
 */
export function PrimariesPanel({ term }: { term: Term }) {
  const primaries = term.primaries;
  if (!primaries?.length) return null;
  const ordered = [...primaries].sort((a, b) => term.support[b.party]! - term.support[a.party]! || a.party - b.party);
  const bitter = primaries.filter((primary) => primary.fight === 'bitter').length;

  return <section className="panel primaries" aria-labelledby="primaries-title">
    <div className="panel-header">
      <h3 id="primaries-title">Primaries</h3>
      <span className="panel-count">{primaries.length} {primaries.length === 1 ? 'party' : 'parties'}{bitter ? ` · ${bitter} bitter` : ''}</span>
    </div>
    <ol className="primary-grid">
      {ordered.map((primary) => {
        const fight = primaryEffects(primary).at(-1)!;
        // Winner first.
        const contenders = primary.contenders.map((contender, i) => ({ ...contender, won: i === primary.winner,
          share: primary.contenders.length === 1 ? 1 : i === primary.winner ? primary.share : 1 - primary.share }))
          .sort((a, b) => Number(b.won) - Number(a.won));
        return <li key={primary.party} className="primary-race" data-fight={primary.fight}>
          <div className="primary-head">
            <PartyLink party={primary.party} />
            <span className="primary-fight" title={fight.effect}>{FIGHT_LABELS[primary.fight]}{primary.cost ? ` · −${Math.round(primary.cost * 100)}%` : ''}</span>
          </div>
          <ul className="primary-contenders" aria-label={`${FIGHT_LABELS[primary.fight]}: ${fight.effect}`}>
            {contenders.map((contender) => <li key={contender.name} data-won={contender.won || undefined}
              style={{ '--share': `${Math.round(contender.share * 100)}%` } as CSSProperties}>
              <span className="primary-name">{contender.name}{contender.incumbent && <small>Incumbent</small>}</span>
              <span className="primary-share">{primary.fight === 'unopposed' ? '' : `${contender.won ? 'Won ' : ''}${Math.round(contender.share * 100)}%`}</span>
              <span className="primary-wing">{primary.fight === 'unopposed' ? 'Renominated, governed at' : `${contender.wing === 'moderate' ? 'Moderate' : 'Ideologue'} wing ·`} {signed(contender.position)}</span>
            </li>)}
          </ul>
        </li>;
      })}
    </ol>
  </section>;
}
