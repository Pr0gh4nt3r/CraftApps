import { getLocale } from '../i18n/i18n';

const DATE: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };
const DATE_TIME: Intl.DateTimeFormatOptions = { ...DATE, hour: '2-digit', minute: '2-digit' };

export const formatDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(getLocale(), DATE) : '');
export const formatDateTime = (iso: string | null) => (iso ? new Date(iso).toLocaleString(getLocale(), DATE_TIME) : '–');
export const formatSize = (bytes: number | null) =>
  bytes === null ? '' : `${Math.max(1, Math.round(bytes / 1e6)).toLocaleString(getLocale())} MB`;

/** Relative time in the UI's language, e.g. "in 5 Stunden" or "3 minutes ago" */
export function formatRelative(iso: string | null): string {
  if (!iso) return '–';
  const relative = new Intl.RelativeTimeFormat(getLocale(), { numeric: 'auto' });
  const minutes = Math.round((new Date(iso).getTime() - Date.now()) / 60_000);
  if (Math.abs(minutes) < 60) return relative.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return relative.format(hours, 'hour');
  return relative.format(Math.round(hours / 24), 'day');
}
