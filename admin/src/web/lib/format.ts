import { getLocale, t } from '../i18n/i18n';

const DATE: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };
const DATE_TIME: Intl.DateTimeFormatOptions = { ...DATE, hour: '2-digit', minute: '2-digit' };

export const formatDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(getLocale(), DATE) : '');
export const formatDateTime = (iso: string | null) => (iso ? new Date(iso).toLocaleString(getLocale(), DATE_TIME) : '–');
export const formatSize = (bytes: number | null) =>
  bytes === null ? '' : `${Math.max(1, Math.round(bytes / 1e6)).toLocaleString(getLocale())} MB`;

const TIME: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };
const DAY_MS = 24 * 60 * 60 * 1000;

/** Calendar days from today to the date, in the browser's time zone */
function daysFromToday(date: Date): number {
  const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  // Rounded: a day with a switch to or from daylight saving time has 23 or 25 hours
  return Math.round((midnight(date) - midnight(new Date())) / DAY_MS);
}

/**
 * Point in time in the browser's time zone and the UI's language, e.g. "um 21:15 Uhr",
 * "morgen um 04:00 Uhr" or "on Mon 9 Nov at 04:00"
 */
export function formatAt(iso: string | null): string {
  if (!iso) return '–';
  const date = new Date(iso);
  const time = date.toLocaleTimeString(getLocale(), TIME);
  const days = daysFromToday(date);
  if (days === 0) return t('time.today', { time });
  if (days === 1) return t('time.tomorrow', { time });
  const withYear = date.getFullYear() !== new Date().getFullYear();
  const day = date.toLocaleDateString(getLocale(), {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(withYear && { year: 'numeric' }),
  });
  return t('time.date', { date: day, time });
}

/** Date, time and time zone in full – for tooltips, e.g. "Mittwoch, 4. November 2026 um 21:15 MEZ" */
export const formatFull = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString(getLocale(), {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        ...TIME,
        timeZoneName: 'short',
      })
    : '';
