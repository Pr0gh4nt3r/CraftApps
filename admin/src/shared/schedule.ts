// When the admin UI checks for new apps and versions: an interval plus fixed times in a time
// zone. The server plans its checks with it, the settings page shows the next ones as a preview.

import { msg, type Msg } from './messages.js';

export const CHECK_INTERVALS = ['30m', '1h', '3h', '6h', '12h', '1d', '1w', '2w', '1M', '3M'] as const;
export type CheckInterval = (typeof CHECK_INTERVALS)[number];

export interface CheckSchedule {
  interval: CheckInterval;
  /**
   * Times "HH:MM" in timeZone, at least one: for 30m and 1h only the minute counts, for 3h, 6h
   * and 12h they are starting points of the rhythm, from 1d on the times of day. When saving,
   * an empty time becomes the current one.
   */
  times: string[];
  /** ISO weekdays, 1 (Monday) to 7 (Sunday) – for 1w and 2w */
  weekdays: number[];
  /** Day of the month, 1–31 – for 1M and 3M (January, April, July, October); shorter months use their last day */
  monthDay: number;
  /** IANA time zone the times refer to, e.g. Europe/Berlin */
  timeZone: string;
  /** For 2w: the Monday (YYYY-MM-DD) of a week with checks – set by the server when saving */
  anchor: string | null;
}

/** What the times mean: the minute of every hour, starting points of a rhythm, or times of day */
export type TimesKind = 'minute' | 'start' | 'time';

/** Minutes between two checks for the intervals below a day – each one divides the day */
const PERIOD: Partial<Record<CheckInterval, number>> = { '30m': 30, '1h': 60, '3h': 180, '6h': 360, '12h': 720 };

/** At least this many minutes between two checks – each one costs about 16 GitHub requests */
export const MIN_GAP_MINUTES = 15;

const DAY_MS = 24 * 60 * 60 * 1000;
const DAY_MINUTES = 24 * 60;
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const timesKind = (interval: CheckInterval): TimesKind =>
  interval === '30m' || interval === '1h' ? 'minute' : PERIOD[interval] ? 'start' : 'time';

const pad = (n: number) => String(n).padStart(2, '0');
const toMinutes = (time: string): number | null => {
  const match = TIME.exec(time);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};

export function isTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

// ------------------------------------------------------------ Wall clock in a time zone

interface WallClock {
  year: number;
  month: number;
  day: number;
  minutes: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

/** Date and time of day that a clock in timeZone shows at this instant */
function wallClock(date: Date, timeZone: string): WallClock {
  let format = formatters.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
    });
    formatters.set(timeZone, format);
  }
  const parts: Record<string, number> = {};
  for (const part of format.formatToParts(date)) parts[part.type] = Number(part.value);
  return { year: parts.year, month: parts.month, day: parts.day, minutes: (parts.hour % 24) * 60 + parts.minute };
}

/**
 * The instant at which a clock in timeZone shows this date and time. A time that doesn't exist
 * because the clocks go forward that night ends up an hour off – the check still runs that day.
 */
function fromWallClock(day: Date, minutes: number, timeZone: string): Date {
  const target = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), 0, minutes);
  let guess = target;
  for (let i = 0; i < 3; i++) {
    const shown = wallClock(new Date(guess), timeZone);
    const shownMs = Date.UTC(shown.year, shown.month - 1, shown.day, 0, shown.minutes);
    if (shownMs === target) break;
    guess += target - shownMs;
  }
  return new Date(guess);
}

/** Current time "HH:MM" in timeZone – what an empty time stands for */
export function currentTime(timeZone: string, now = new Date()): string {
  const { minutes } = wallClock(now, timeZone);
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

// ------------------------------------------------------------ Days and times with a check

/** Minutes of the day (0–1439) with a check, sorted */
function minutesOfDay(schedule: CheckSchedule): number[] {
  const period = PERIOD[schedule.interval];
  const found = new Set<number>();
  for (const time of schedule.times) {
    const minutes = toMinutes(time);
    if (minutes === null) continue;
    if (!period) found.add(minutes);
    else for (let m = minutes % period; m < DAY_MINUTES; m += period) found.add(m);
  }
  return [...found].sort((a, b) => a - b);
}

/** A calendar day is kept as midnight UTC of that date; this is the Monday of its week */
const mondayOf = (day: Date) => day.getTime() - ((day.getUTCDay() + 6) % 7) * DAY_MS;

function runsOn(schedule: CheckSchedule, day: Date): boolean {
  const weekday = day.getUTCDay() || 7;
  switch (schedule.interval) {
    case '1w':
      return schedule.weekdays.includes(weekday);
    case '2w': {
      if (!schedule.weekdays.includes(weekday)) return false;
      if (!schedule.anchor) return true;
      const weeks = Math.round((mondayOf(day) - mondayOf(new Date(`${schedule.anchor}T00:00:00Z`))) / (7 * DAY_MS));
      return weeks % 2 === 0;
    }
    case '3M':
    case '1M': {
      if (schedule.interval === '3M' && day.getUTCMonth() % 3 !== 0) return false;
      const lastDay = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + 1, 0)).getUTCDate();
      return day.getUTCDate() === Math.min(schedule.monthDay, lastDay);
    }
    default:
      return true;
  }
}

/** The next checks after the given instant, at most count – none if the schedule is invalid */
export function nextRuns(schedule: CheckSchedule, after: Date, count = 1): Date[] {
  const minutes = minutesOfDay(schedule);
  if (!minutes.length || !isTimeZone(schedule.timeZone)) return [];
  const runs: Date[] = [];
  const start = wallClock(after, schedule.timeZone);
  let day = Date.UTC(start.year, start.month - 1, start.day);
  // A quarter has at most 92 days – a little more than a year covers every schedule
  for (let i = 0; i < 400 && runs.length < count; i++, day += DAY_MS) {
    const date = new Date(day);
    if (!runsOn(schedule, date)) continue;
    for (const m of minutes) {
      const at = fromWallClock(date, m, schedule.timeZone);
      if (at.getTime() > after.getTime() && !runs.some((run) => run.getTime() === at.getTime())) runs.push(at);
      if (runs.length === count) break;
    }
  }
  return runs;
}

export const nextRun = (schedule: CheckSchedule, after: Date): Date | null => nextRuns(schedule, after)[0] ?? null;

// ------------------------------------------------------------ Saving and checking

/**
 * The schedule as it is saved: empty times become the current time, times and weekdays sorted
 * and without duplicates. For 2w the anchor stays (keepAnchor: the one saved so far) or is set
 * so that the first check is the next matching weekday.
 */
export function prepareSchedule(schedule: CheckSchedule, keepAnchor: string | null, now = new Date()): CheckSchedule {
  const zone = isTimeZone(schedule.timeZone) ? schedule.timeZone : 'UTC';
  let times = schedule.times.map((time) => time || currentTime(zone, now));
  // Only the minute counts – saved as 00:MM, so that equal minutes are one entry
  if (timesKind(schedule.interval) === 'minute') times = times.map((time) => `00:${time.slice(3)}`);
  const prepared: CheckSchedule = {
    ...schedule,
    times: [...new Set(times)].sort(),
    weekdays: [...new Set(schedule.weekdays)].sort((a, b) => a - b),
    anchor: null,
  };
  if (prepared.interval !== '2w') return prepared;
  if (keepAnchor) return { ...prepared, anchor: keepAnchor };
  const first = isTimeZone(prepared.timeZone) ? nextRun({ ...prepared, interval: '1w' }, now) : null;
  if (!first) return prepared;
  const { year, month, day } = wallClock(first, prepared.timeZone);
  const anchor = new Date(mondayOf(new Date(Date.UTC(year, month - 1, day)))).toISOString().slice(0, 10);
  return { ...prepared, anchor };
}

/** Why the schedule can't be saved – null if it can */
export function scheduleProblem(schedule: CheckSchedule): Msg | null {
  if (!isTimeZone(schedule.timeZone)) return msg('error.timeZone', { zone: schedule.timeZone });
  const minutes = minutesOfDay(schedule);
  if (!minutes.length || schedule.times.some((time) => toMinutes(time) === null)) return msg('error.scheduleTimes');
  if ((schedule.interval === '1w' || schedule.interval === '2w') && !schedule.weekdays.length) {
    return msg('error.scheduleWeekdays');
  }
  // From one check to the next – up to 1d also across midnight, there the next day has checks too
  const gaps = minutes.slice(1).map((m, i) => m - minutes[i]);
  if (PERIOD[schedule.interval] || schedule.interval === '1d') gaps.push(minutes[0] + DAY_MINUTES - minutes[minutes.length - 1]);
  if (gaps.some((gap) => gap < MIN_GAP_MINUTES)) return msg('error.scheduleGap', { minutes: MIN_GAP_MINUTES });
  return null;
}
