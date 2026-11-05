// What the activity log shows: which groups of entries and which columns. The settings hold the
// default for everyone, each user can save an own view right in the list.

import type { EventKind } from './types.js';

/** Groups of entry kinds, as the filter offers them */
export const ACTIVITY_GROUPS = {
  apps: ['installed', 'updated', 'uninstalled', 'available', 'update-available'],
  check: ['check'],
  error: ['error'],
  setting: ['setting', 'notify'],
  user: ['user'],
  system: ['system'],
} as const satisfies Record<string, readonly EventKind[]>;
export type ActivityGroup = keyof typeof ACTIVITY_GROUPS;
export const ACTIVITY_GROUP_IDS = Object.keys(ACTIVITY_GROUPS) as ActivityGroup[];

/** Columns of the list, in their order */
export const ACTIVITY_COLUMNS = ['time', 'app', 'kind', 'what', 'by'] as const;
export type ActivityColumn = (typeof ACTIVITY_COLUMNS)[number];

export interface ActivityView {
  groups: ActivityGroup[];
  /** At least one */
  columns: ActivityColumn[];
}

/** Everything, as before there was a choice */
export const DEFAULT_ACTIVITY_VIEW: ActivityView = { groups: [...ACTIVITY_GROUP_IDS], columns: [...ACTIVITY_COLUMNS] };

/**
 * Only known groups and columns, in their fixed order – null if it isn't a view or has no
 * column left (minGroups: at least this many groups, e.g. 1 for the default).
 */
export function normalizeView(value: unknown, minGroups = 0): ActivityView | null {
  const v = value as Partial<ActivityView> | null;
  if (!v || !Array.isArray(v.groups) || !Array.isArray(v.columns)) return null;
  const groups = ACTIVITY_GROUP_IDS.filter((g) => v.groups!.includes(g));
  const columns = ACTIVITY_COLUMNS.filter((c) => v.columns!.includes(c));
  return groups.length >= minGroups && columns.length ? { groups, columns } : null;
}

export const sameView = (a: ActivityView, b: ActivityView): boolean =>
  a.groups.join() === b.groups.join() && a.columns.join() === b.columns.join();

/** The default and the view the user saved – null while they follow the default */
export interface ActivityViewState {
  default: ActivityView;
  own: ActivityView | null;
}
