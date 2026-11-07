import { useSyncExternalStore } from 'react';

// Light, dark or as the system: remembered in this browser like the language. public/theme.js
// applies it before the first paint; without a choice the CSS follows prefers-color-scheme.
export type Theme = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'craftapps.theme';

function stored(): Theme {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value === 'light' || value === 'dark') return value;
  } catch {
    // storage blocked
  }
  return 'system';
}

let current: Theme = stored();
const listeners = new Set<() => void>();

export function setTheme(theme: Theme): void {
  current = theme;
  if (theme === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  try {
    if (theme === 'system') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // not remembered then
  }
  listeners.forEach((listener) => listener());
}

/** Renders the component again when the design changes */
export function useTheme(): Theme {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => current,
  );
}
