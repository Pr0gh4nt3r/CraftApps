/** So heißen die Craft-Apps: photocraft, figcraft, ... (Repo-Name in Kleinbuchstaben) */
export const APP_ID = /^[a-z0-9]+craft$/;
export const USER_AGENT = 'craftapps-admin';
export const MINUTE = 60 * 1000;
export const DAY = 24 * 60 * MINUTE;

/** Tag ohne führendes "v": v0.9.0 -> 0.9.0 */
export function version(tag: string | null): string {
  return (tag ?? '').replace(/^v/, '');
}

/** Lesbare Fehlermeldung – mit Hinweis, wenn Schreibrechte auf dem Daten-Volume fehlen. */
export function errorText(err: unknown): string {
  const e = err as NodeJS.ErrnoException | undefined;
  if (e?.code === 'EACCES' || e?.code === 'EPERM') {
    return `Keine Schreibrechte auf ${e.path ?? 'das Daten-Volume'} – das Volume muss dem Benutzer 1000 gehören (siehe README)`;
  }
  return err instanceof Error ? err.message : String(err);
}
