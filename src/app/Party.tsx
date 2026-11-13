import type { CSSProperties } from 'react';
import { partyName } from '../engine/data';
import { PARTY_COLORS } from './presentation';

export function Dot({ party }: { party: number }) {
  return <span aria-hidden="true" className="dot" style={{ '--dot': PARTY_COLORS[party] } as CSSProperties} />;
}

export function Party({ party }: { party: number }) {
  return <span className="party"><Dot party={party} />{partyName(party)}</span>;
}
