import type { Msg } from '../../shared/messages';
import { t, tm } from '../i18n/i18n';

const unauthorizedListeners = new Set<() => void>();

/** Called as soon as the server reports "not logged in" (e.g. session expired). */
export function onUnauthorized(listener: () => void): () => void {
  unauthorizedListeners.add(listener);
  return () => unauthorizedListeners.delete(listener);
}

export async function api<T = unknown>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    // The server requires this header on all modifying requests (protection against CSRF)
    headers: { 'X-Requested-With': 'craftapps', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data: unknown = res.headers.get('content-type')?.includes('application/json') ? await res.json() : null;
  if (!res.ok) {
    if (res.status === 401 && url !== '/api/auth/login') unauthorizedListeners.forEach((listener) => listener());
    // The server sends errors as a message the UI shows in its language
    const error = (data as { error?: Msg | string } | null)?.error;
    throw new Error(typeof error === 'string' ? error : error ? tm(error) : t('common.errorStatus', { status: res.status }));
  }
  return data as T;
}
