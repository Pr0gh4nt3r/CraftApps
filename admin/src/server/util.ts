/** Names of the craft apps: photocraft, figcraft, ... (repo name in lowercase) */
export const APP_ID = /^[a-z0-9]+craft$/;
export const USER_AGENT = 'craftapps-admin';
export const MINUTE = 60 * 1000;
export const DAY = 24 * 60 * MINUTE;

/** Tag without the leading "v": v0.9.0 -> 0.9.0 */
export function version(tag: string | null): string {
  return (tag ?? '').replace(/^v/, '');
}

/** Readable error message – with a hint if write access to the data volume is missing. */
export function errorText(err: unknown): string {
  const e = err as NodeJS.ErrnoException | undefined;
  if (e?.code === 'EACCES' || e?.code === 'EPERM') {
    return `Keine Schreibrechte auf ${e.path ?? 'das Daten-Volume'} – das Volume muss dem Benutzer 1000 gehören (siehe README)`;
  }
  return err instanceof Error ? err.message : String(err);
}
