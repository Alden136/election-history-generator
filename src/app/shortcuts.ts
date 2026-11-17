/**
 * Keyboard shortcuts for the election view: the left and right arrows step
 * through elections and space plays or pauses the timeline.
 */

export type Shortcut = 'previous' | 'next' | 'toggle';

export interface KeyPress {
  key: string;
  /** Ctrl, Alt or the Windows/Command key is held, so the key belongs to the browser. */
  modified: boolean;
  /** Focus is somewhere that uses these keys itself: a text box, a slider, a list or an open dialog. */
  busy: boolean;
  /** Focus is on a button or link, which space already presses. */
  onButton: boolean;
}

export function shortcutFor({ key, modified, busy, onButton }: KeyPress): Shortcut | null {
  if (modified || busy) return null;
  if (key === 'ArrowLeft') return 'previous';
  if (key === 'ArrowRight') return 'next';
  if (key === ' ' && !onButton) return 'toggle';
  return null;
}

const BUSY = 'input, select, textarea, [contenteditable=""], [contenteditable="true"], [role="listbox"], [role="menu"], [role="slider"], dialog, [role="dialog"]';

/** Reads a real key event into the plain facts `shortcutFor` decides on. */
export function readKey(event: KeyboardEvent): KeyPress {
  const target = event.target instanceof Element ? event.target : null;
  return {
    key: event.key,
    modified: event.ctrlKey || event.altKey || event.metaKey,
    busy: Boolean(target?.closest(BUSY)) || Boolean(document.querySelector('dialog[open], [role="dialog"]')),
    onButton: Boolean(target?.closest('button, a, summary')),
  };
}
