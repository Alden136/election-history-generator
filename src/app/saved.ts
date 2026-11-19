/**
 * Saved timelines: named seeds, with their year, rules and dials, kept in the
 * browser's local storage on this device only. Each one is stored as the
 * same address query a share link uses, so opening it reads it back the same way.
 */
import { rulePreset } from '../engine/rules';
import { modifiedDials } from './dials';
import { readLocation, timelineUrl, type TimelineLocation } from './presentation';
import { PRESET_LABELS } from './RuleSettings';

export const SAVED_KEY = 'election-saved-timelines';
export const MAX_NAME = 60;

export interface SavedTimeline {
  id: string;
  name: string;
  /** Milliseconds since 1970. */
  savedAt: number;
  /** The address query, as in a share link: seed, year, rules and dials. */
  query: string;
}

type Store = Pick<Storage, 'getItem' | 'setItem'>;

const isSaved = (value: unknown): value is SavedTimeline => {
  const item = value as SavedTimeline;
  return typeof item === 'object' && item !== null && typeof item.id === 'string' && typeof item.name === 'string' &&
    typeof item.savedAt === 'number' && typeof item.query === 'string';
};

/** The saved list, newest first. Anything unreadable is skipped rather than breaking the page. */
export function loadSaved(store: Store | null = safeStorage()): SavedTimeline[] {
  try {
    const parsed: unknown = JSON.parse(store?.getItem(SAVED_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter(isSaved) : [];
  } catch {
    return [];
  }
}

/** Writes the list; false when the browser will not store it (private window, storage full or blocked). */
export function writeSaved(list: readonly SavedTimeline[], store: Store | null = safeStorage()): boolean {
  try {
    if (!store) return false;
    store.setItem(SAVED_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

function safeStorage(): Store | null {
  try { return window.localStorage; } catch { return null; }
}

export function queryFor(location: TimelineLocation): string {
  return timelineUrl('https://example.invalid/', location).search;
}

export const locationOf = (saved: SavedTimeline): TimelineLocation => readLocation(saved.query);

/** A new entry at the top of the list. A blank name falls back to the suggested one. */
export function addSaved(list: readonly SavedTimeline[], name: string, location: TimelineLocation, now = Date.now()): SavedTimeline[] {
  const entry: SavedTimeline = {
    id: `${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: name.trim().slice(0, MAX_NAME) || suggestedName(location),
    savedAt: now,
    query: queryFor(location),
  };
  return [entry, ...list];
}

export const removeSaved = (list: readonly SavedTimeline[], id: string): SavedTimeline[] => list.filter((item) => item.id !== id);

export function suggestedName({ seed, year }: TimelineLocation): string {
  return `Seed ${seed} · ${year}`;
}

/** "Seed 42 · 2024 · Corrected · 2 dials adjusted" */
export function describeSaved(saved: SavedTimeline): string {
  const { seed, year, corrections, dials, midterms, traits, primaries, runningMates } = locationOf(saved);
  const adjusted = modifiedDials(dials).length;
  return [`Seed ${seed}`, String(year), PRESET_LABELS[rulePreset(corrections)], ...(midterms ? ['Midterms'] : []), ...(traits ? ['Traits'] : []), ...(traits && primaries ? ['Primaries'] : []), ...(traits && runningMates ? ['Running mates'] : []),
    ...(adjusted ? [`${adjusted} ${adjusted === 1 ? 'dial' : 'dials'} adjusted`] : [])].join(' · ');
}

/** True when the entry is the timeline on screen, ignoring the year. */
export function sameTimeline(saved: SavedTimeline, location: TimelineLocation): boolean {
  const strip = (query: string) => { const params = new URLSearchParams(query); params.delete('year'); return params.toString(); };
  return strip(saved.query) === strip(queryFor(location));
}
