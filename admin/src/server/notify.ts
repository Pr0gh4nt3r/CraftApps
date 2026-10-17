import { USER_AGENT } from './util.js';

export interface Notification {
  title: string;
  /** Markdown */
  message: string;
  /** Gotify-Priorität: 0–3 leise, 4–7 normal, 8–10 dringend */
  priority: number;
}

/** Schickt eine Push-Nachricht über Gotify; clickUrl öffnet sich beim Antippen. */
export async function sendGotify(baseUrl: string, token: string, note: Notification, clickUrl: string): Promise<void> {
  const extras: Record<string, unknown> = { 'client::display': { contentType: 'text/markdown' } };
  if (clickUrl) extras['client::notification'] = { click: { url: clickUrl } };
  const res = await fetch(new URL('message', baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Gotify-Key': token, 'User-Agent': USER_AGENT },
    body: JSON.stringify({ ...note, extras }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Gotify antwortet ${res.status}: ${(await res.text()).slice(0, 200)}`);
}
