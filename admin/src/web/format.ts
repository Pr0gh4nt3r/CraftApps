const date = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'short', year: 'numeric' });
const dateTime = new Intl.DateTimeFormat('de-DE', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
const relative = new Intl.RelativeTimeFormat('de-DE', { numeric: 'auto' });

export const formatDate = (iso: string | null) => (iso ? date.format(new Date(iso)) : '');
export const formatDateTime = (iso: string | null) => (iso ? dateTime.format(new Date(iso)) : '–');
export const formatSize = (bytes: number | null) =>
  bytes === null ? '' : `${Math.max(1, Math.round(bytes / 1e6)).toLocaleString('de-DE')} MB`;

/** "in 5 Stunden", "vor 3 Minuten" */
export function formatRelative(iso: string | null): string {
  if (!iso) return '–';
  const minutes = Math.round((new Date(iso).getTime() - Date.now()) / 60_000);
  if (Math.abs(minutes) < 60) return relative.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return relative.format(hours, 'hour');
  return relative.format(Math.round(hours / 24), 'day');
}
