import type { AppView } from '../../shared/types';

// How the apps page shows the apps: order and layout, remembered in this browser like the
// language; plus how often each app was opened from here, for "Most used" – the desktop launcher
// counts on the computer it runs on as well.
export const SORTS = ['name-asc', 'name-desc', 'most-used', 'updated'] as const;
export type Sort = (typeof SORTS)[number];
export type Layout = 'grid' | 'list';

const SORT_KEY = 'craftapps.appsSort';
const LAYOUT_KEY = 'craftapps.appsLayout';
const USAGE_KEY = 'craftapps.usage';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null; // storage blocked – the defaults apply
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // not remembered then
  }
}

export const storedSort = (): Sort => {
  const value = read(SORT_KEY);
  return (SORTS as readonly string[]).includes(value ?? '') ? (value as Sort) : 'name-asc';
};
export const storedLayout = (): Layout => (read(LAYOUT_KEY) === 'list' ? 'list' : 'grid');
export const saveSort = (sort: Sort) => write(SORT_KEY, sort);
export const saveLayout = (layout: Layout) => write(LAYOUT_KEY, layout);

function usage(): Record<string, number> {
  try {
    const parsed = JSON.parse(read(USAGE_KEY) ?? '{}') as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, number>) : {};
  } catch {
    return {};
  }
}

/** Counts one opening of the app */
export function countUse(appId: string): void {
  const counts = usage();
  counts[appId] = (counts[appId] ?? 0) + 1;
  write(USAGE_KEY, JSON.stringify(counts));
}

const newest = (app: AppView) => Date.parse(app.latestPublishedAt ?? app.installedPublishedAt ?? '') || 0;

/** The apps matching the search, in the chosen order – ties in name order */
export function arrange(apps: AppView[], sort: Sort, query: string, locale: string): AppView[] {
  const words = query.toLocaleLowerCase(locale).split(/\s+/).filter(Boolean);
  const found = apps.filter((app) => {
    const text = `${app.name} ${app.id} ${app.description} ${app.descriptionEn}`.toLocaleLowerCase(locale);
    return words.every((word) => text.includes(word));
  });
  const byName = (a: AppView, b: AppView) => a.name.localeCompare(b.name, locale);
  const counts = usage();
  const compare: Record<Sort, (a: AppView, b: AppView) => number> = {
    'name-asc': byName,
    'name-desc': (a, b) => byName(b, a),
    'most-used': (a, b) => (counts[b.id] ?? 0) - (counts[a.id] ?? 0) || byName(a, b),
    updated: (a, b) => newest(b) - newest(a) || byName(a, b),
  };
  return found.sort(compare[sort]);
}
