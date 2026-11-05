import type { Pool, RowDataPacket } from 'mysql2/promise';
import { DEFAULT_ACTIVITY_VIEW, normalizeView, type ActivityView } from '../../shared/activity.js';
import { CHECK_INTERVALS, currentTime, scheduleProblem, type CheckInterval, type CheckSchedule } from '../../shared/schedule.js';
import type { SettingsView } from '../../shared/types.js';

export interface Settings {
  /** When to check for new apps and versions */
  checkSchedule: CheckSchedule;
  /** Update channel: stable, rc, beta, alpha, … – a channel also takes the more mature ones */
  updateChannel: string;
  /** What the activity log shows to users without an own view – at least one group and column */
  activityView: ActivityView;
  autoInstallNew: boolean;
  defaultAutoUpdate: boolean;
  /** Public address of the nginx serving the apps, e.g. https://craft.example.com */
  appsBaseUrl: string;
  /** Address of this admin UI – notifications link to it */
  adminBaseUrl: string;
  /** Token for the GitHub API, '' = none; takes precedence over GITHUB_TOKEN */
  githubToken: string;
}

/** Time zone of the server – in the container UTC, unless TZ is set */
const serverTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// The former intervals in minutes and the schedule interval each one becomes
const FROM_MINUTES: [number, CheckInterval][] = [
  [30, '30m'],
  [60, '1h'],
  [180, '3h'],
  [360, '6h'],
  [720, '12h'],
  [1440, '1d'],
  [10080, '1w'],
];

/**
 * A schedule for an interval in minutes, as the settings had it before: the nearest interval,
 * at the current time – so the checks keep running roughly as before.
 */
export function scheduleFromMinutes(minutes: number, now = new Date()): CheckSchedule {
  const [, interval] = FROM_MINUTES.reduce((best, entry) =>
    Math.abs(entry[0] - minutes) < Math.abs(best[0] - minutes) ? entry : best,
  );
  const timeZone = serverTimeZone();
  // ISO weekday of today in that time zone, for 1w
  const weekday = WEEKDAYS.indexOf(new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(now)) + 1;
  return { interval, times: [currentTime(timeZone, now)], weekdays: [weekday], monthDay: 1, timeZone, anchor: null };
}

export const DEFAULT_SETTINGS: Settings = {
  // Without saved settings: every 6 hours, from the minute the server started
  checkSchedule: scheduleFromMinutes(360),
  updateChannel: 'stable',
  activityView: DEFAULT_ACTIVITY_VIEW,
  autoInstallNew: false,
  defaultAutoUpdate: true,
  appsBaseUrl: '',
  adminBaseUrl: '',
  githubToken: '',
};

/** A stored schedule that applies: complete and valid – one from a newer or broken version doesn't */
function isSchedule(value: unknown): value is CheckSchedule {
  const s = value as Partial<CheckSchedule> | null;
  return (
    !!s &&
    CHECK_INTERVALS.includes(s.interval as CheckInterval) &&
    Array.isArray(s.times) &&
    s.times.every((time) => typeof time === 'string') &&
    Array.isArray(s.weekdays) &&
    typeof s.monthDay === 'number' &&
    typeof s.timeZone === 'string' &&
    !scheduleProblem(s as CheckSchedule)
  );
}

/**
 * For the UI: the token stays on the server, the UI only learns where the one in use comes from.
 * releaseChannels: the update channels the apps currently have releases in.
 */
export function settingsView(
  { githubToken, ...settings }: Settings,
  envToken: string | undefined,
  releaseChannels: string[],
): SettingsView {
  return { ...settings, githubTokenSource: githubToken ? 'settings' : envToken ? 'env' : null, releaseChannels };
}

const UPSERT = 'INSERT INTO settings (name, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)';

/** Settings from the UI plus internal values (name prefixed with "_"), as JSON in MySQL. */
export class SettingsStore {
  private cache: Settings | null = null;

  constructor(private readonly db: Pool) {}

  async get(): Promise<Settings> {
    if (!this.cache) {
      const [rows] = await this.db.query<RowDataPacket[]>('SELECT name, value FROM settings');
      const stored = new Map(rows.map((r) => [r.name as string, JSON.parse(r.value as string) as unknown]));
      const merged: Record<string, unknown> = { ...DEFAULT_SETTINGS };
      for (const [key, fallback] of Object.entries(DEFAULT_SETTINGS)) {
        const value = stored.get(key);
        // Otherwise the default applies
        if (key === 'activityView') {
          // Groups or columns of a newer version are left out
          merged[key] = normalizeView(value, 1) ?? fallback;
          continue;
        }
        const valid = key === 'checkSchedule' ? isSchedule(value) : typeof value === typeof fallback;
        if (valid) merged[key] = value;
      }
      this.cache = merged as unknown as Settings;
    }
    return this.cache;
  }

  async update(patch: Partial<Settings>): Promise<Settings> {
    const next = { ...(await this.get()), ...patch };
    for (const [name, value] of Object.entries(patch)) {
      await this.db.query(UPSERT, [name, JSON.stringify(value)]);
    }
    this.cache = next;
    return next;
  }

  async getInternal<T>(name: string): Promise<T | undefined> {
    const [rows] = await this.db.query<RowDataPacket[]>('SELECT value FROM settings WHERE name = ?', [`_${name}`]);
    return rows[0] ? (JSON.parse(rows[0].value as string) as T) : undefined;
  }

  async setInternal(name: string, value: unknown): Promise<void> {
    await this.db.query(UPSERT, [`_${name}`, JSON.stringify(value)]);
  }
}
