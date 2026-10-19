import { msg, renderMsg, type Msg } from '../shared/messages.js';

/** Names of the craft apps: photocraft, figcraft, ... (repo name in lowercase) */
export const APP_ID = /^[a-z0-9]+craft$/;
export const USER_AGENT = 'craftapps-admin';
export const MINUTE = 60 * 1000;
export const DAY = 24 * 60 * MINUTE;

/** Tag without the leading "v": v0.9.0 -> 0.9.0 */
export function version(tag: string | null): string {
  return (tag ?? '').replace(/^v/, '');
}

/** Error with a message the UI can show in its language; message is the German text for the log. */
export class MsgError extends Error {
  constructor(readonly msg: Msg) {
    super(renderMsg('de', msg));
  }
}

/** Message for the UI – with a hint if write access to the data volume is missing. */
export function toMsg(err: unknown): Msg {
  if (err instanceof MsgError) return err.msg;
  const e = err as NodeJS.ErrnoException | undefined;
  if (e?.code === 'EACCES' || e?.code === 'EPERM') return msg('error.noWriteAccess', { path: e.path ?? '/data' });
  return msg('raw', { text: (err instanceof Error ? err.message : String(err)).slice(0, 500) });
}

/** Readable error message for the log */
export const errorText = (err: unknown): string => renderMsg('de', toMsg(err));
