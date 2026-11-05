import type { Pool } from 'mysql2/promise';
import { renderMsg, type Msg } from '../../shared/messages.js';
import type { EventKind } from '../../shared/types.js';

/**
 * Activity log entry: the message as JSON for the UI, plus the German text. username is who
 * did it – null for what the admin UI does by itself (checks, automatic updates, the start).
 */
export async function logEvent(
  db: Pool,
  kind: EventKind,
  message: Msg,
  appId: string | null = null,
  username: string | null = null,
): Promise<void> {
  await db.query('INSERT INTO events (app_id, kind, message, msg, username) VALUES (?, ?, ?, ?, ?)', [
    appId,
    kind,
    renderMsg('de', message).slice(0, 1024),
    JSON.stringify(message),
    username,
  ]);
}
