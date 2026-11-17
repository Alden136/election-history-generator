/**
 * How popular votes are shown: an estimated number of votes (the default) or
 * a percentage. Set in the Rules dialog and remembered in this browser. It
 * changes only the display, never the simulation or a share link.
 */
import { createContext, useContext } from 'react';

export type VoteDisplay = 'count' | 'percent';

const KEY = 'election-simulator:popular-vote';

export function readVoteDisplay(): VoteDisplay {
  try { return localStorage.getItem(KEY) === 'percent' ? 'percent' : 'count'; } catch { return 'count'; }
}

export function storeVoteDisplay(display: VoteDisplay) {
  try { localStorage.setItem(KEY, display); } catch { /* storage unavailable: keep it for this visit */ }
}

export const VoteDisplayContext = createContext<VoteDisplay>('count');
export const useVoteDisplay = () => useContext(VoteDisplayContext);
