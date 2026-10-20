import { useSyncExternalStore } from 'react';
import { renderMsg, type Lang, type Msg } from '../../shared/messages';
import de from './locales/de.json';
import en from './locales/en.json';

// The UI follows the browser's language (German or English, anything else gets English); the
// switch in the top bar overrides it for this browser
const STORAGE_KEY = 'craftapps.lang';

// The texts live in locales/<lang>.json: de.json defines the keys, a key missing in another
// language fails the build
export type UiKey = keyof typeof de;

const TEXTS: Record<Lang, Record<UiKey, string>> = { de, en };

function detect(): Lang {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'de' || stored === 'en') return stored;
  } catch {
    // storage blocked – the browser's language decides
  }
  for (const tag of navigator.languages ?? [navigator.language]) {
    const lang = tag.slice(0, 2).toLowerCase();
    if (lang === 'de' || lang === 'en') return lang;
  }
  return 'en';
}

let current: Lang = detect();
document.documentElement.lang = current;
const listeners = new Set<() => void>();

export const getLang = (): Lang => current;

/** Locale for dates and numbers */
export const getLocale = (): string => (current === 'de' ? 'de-DE' : 'en-GB');

export function setLang(lang: Lang): void {
  current = lang;
  document.documentElement.lang = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // not remembered then
  }
  listeners.forEach((listener) => listener());
}

/** Renders the component again when the language changes */
export function useLang(): Lang {
  return useSyncExternalStore((listener) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, getLang);
}

/** Whether there is a text for this key – for optional texts such as hints */
export const hasText = (key: string): key is UiKey => key in de;

/** UI text in the current language; {name} placeholders are filled from params */
export function t(key: UiKey, params: Record<string, string | number> = {}): string {
  return TEXTS[current][key].replace(/\{(\w+)\}/g, (placeholder, name: string) => String(params[name] ?? placeholder));
}

/** Message from the server in the current language */
export const tm = (message: Msg | null): string => (message ? renderMsg(current, message) : '');
