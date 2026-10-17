const unauthorizedListeners = new Set<() => void>();

/** Wird aufgerufen, sobald der Server "nicht angemeldet" meldet (z.B. Sitzung abgelaufen). */
export function onUnauthorized(listener: () => void): () => void {
  unauthorizedListeners.add(listener);
  return () => unauthorizedListeners.delete(listener);
}

export async function api<T = unknown>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    // Der Server verlangt diesen Header bei allen ändernden Anfragen (Schutz gegen CSRF)
    headers: { 'X-Requested-With': 'craftapps', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data: unknown = res.headers.get('content-type')?.includes('application/json') ? await res.json() : null;
  if (!res.ok) {
    if (res.status === 401 && url !== '/api/auth/login') unauthorizedListeners.forEach((listener) => listener());
    throw new Error((data as { error?: string } | null)?.error ?? `Fehler ${res.status}`);
  }
  return data as T;
}
