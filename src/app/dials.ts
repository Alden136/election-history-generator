import { DEFAULT_DIALS } from '../engine/data';
import type { Dials } from '../engine/types';

export const DIALS = [
  { key: 'partyLoyalty', label: 'Party loyalty', detail: 'Chance a state stays with its previous party if it can.', min: 0, max: 1, step: 0.01 },
  { key: 'secessionThreshold', label: 'Secession threshold', detail: 'Ideological distance needed for a state to secede during a civil war.', min: 0, max: 18, step: 0.1 },
  { key: 'partyVictoryBoost', label: 'Party victory boost', detail: 'Weight of national party support in state voting.', min: 0, max: 30, step: 0.5 },
  { key: 'crisisBacklash', label: 'Crisis backlash', detail: 'Random change in party ideology following negative presidential performance.', min: 0, max: 10, step: 0.1 },
  { key: 'potusBacklash', label: 'Presidential backlash', detail: 'How strongly parties outside the White House move away from the president’s ideology.', min: 0, max: 1, step: 0.01 },
  { key: 'blocSizeMultiplier', label: 'Bloc size shift', detail: 'How much approval swings change the sizes of ideology blocs.', min: 0, max: 60, step: 1 },
] as const satisfies readonly { key: keyof Dials; label: string; detail: string; min: number; max: number; step: number }[];

export const modifiedDials = (dials: Dials) => DIALS.filter(({ key }) => dials[key] !== DEFAULT_DIALS[key]);

export function parseDials(value: string | null): Dials {
  if (!value) return DEFAULT_DIALS;
  const overrides = new URLSearchParams(value.replaceAll(',', '&'));
  const dials = { ...DEFAULT_DIALS };
  for (const { key, min, max, step } of DIALS) {
    const input = overrides.get(key);
    if (input === null || !/^\d+(?:\.\d+)?$/.test(input)) continue;
    const number = Number(input);
    if (number < min || number > max) continue;
    // Snap to the same increments the sliders expose.
    dials[key] = Number((Math.round(number / step) * step).toFixed(2));
  }
  return dials;
}

export const encodeDials = (dials: Dials): string =>
  modifiedDials(dials).map(({ key }) => `${key}=${dials[key]}`).join(',');
