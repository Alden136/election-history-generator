/**
 * The colour theme: the light Concrete Brutalist theme or Night concrete, its
 * dark version. The reader picks Light, Dark or System (follow the device),
 * and the choice is remembered on this device. The page's own script in
 * index.html applies it before the first paint, so a dark page never flashes
 * light; this module keeps it up to date afterwards.
 */
import { useEffect, useState } from 'react';

export type ThemeChoice = 'light' | 'dark' | 'system';
export const THEME_CHOICES: readonly ThemeChoice[] = ['light', 'dark', 'system'];
/** Must match the key the script in index.html reads. */
export const THEME_KEY = 'election-simulator:theme';

export function readThemeChoice(): ThemeChoice {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    return 'system';
  }
}

const systemDark = () => typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;

/** The theme a choice shows right now. */
export const resolveTheme = (choice: ThemeChoice, prefersDark = systemDark()): 'light' | 'dark' =>
  choice === 'system' ? (prefersDark ? 'dark' : 'light') : choice;

function apply(choice: ThemeChoice) {
  document.documentElement.dataset.theme = resolveTheme(choice);
}

/** The reader's theme choice and a setter that applies and remembers it. */
export function useTheme(): [ThemeChoice, (choice: ThemeChoice) => void] {
  const [choice, setChoice] = useState<ThemeChoice>(readThemeChoice);

  useEffect(() => {
    apply(choice);
    try {
      if (choice === 'system') localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, choice);
    } catch { /* Private windows can refuse storage; the theme still applies for this visit. */ }
    if (choice !== 'system' || typeof matchMedia !== 'function') return;
    // Follow the device when it switches between light and dark.
    const query = matchMedia('(prefers-color-scheme: dark)');
    const follow = () => apply('system');
    query.addEventListener('change', follow);
    return () => query.removeEventListener('change', follow);
  }, [choice]);

  return [choice, setChoice];
}
