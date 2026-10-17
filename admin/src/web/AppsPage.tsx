import { useCallback, useEffect, useState } from 'react';
import type { StateView } from '../shared/types';
import { api } from './api';
import { AppCard, type Action } from './AppCard';
import { formatDateTime, formatRelative } from './format';

export function AppsPage() {
  const [state, setState] = useState<StateView | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(
    () => api<StateView>('GET', '/api/state').then(setState, (err: Error) => setNotice(err.message)),
    [],
  );

  // Poll every second while something is running, otherwise every 15 seconds
  const busy =
    !!state && (state.checking || state.apps.some((a) => a.job?.state === 'queued' || a.job?.state === 'running'));
  useEffect(() => void load(), [load]);
  useEffect(() => {
    const timer = setInterval(() => void load(), busy ? 1000 : 15_000);
    return () => clearInterval(timer);
  }, [busy, load]);

  async function run(method: string, url: string, body?: unknown) {
    setNotice(null);
    try {
      await api(method, url, body);
    } catch (err) {
      setNotice((err as Error).message);
    }
    await load();
  }

  if (!state) return <p className="muted">Lädt …</p>;

  const installed = state.apps.filter((a) => a.status !== 'not-installed').length;
  const updates = state.apps.filter((a) => a.status === 'update-available').length;
  const github = state.github.remaining !== null ? ` · GitHub-API: ${state.github.remaining}/${state.github.limit}` : '';

  return (
    <>
      <section className="toolbar">
        <div>
          <h1>Apps</h1>
          <p className="muted">
            {installed} von {state.apps.length} installiert
            {updates > 0 && ` · ${updates} ${updates === 1 ? 'Update' : 'Updates'} verfügbar`}
          </p>
        </div>
        <div className="toolbar-side">
          <p className="muted small">
            Zuletzt geprüft: {formatDateTime(state.lastCheckAt)}
            <br />
            Nächste Prüfung: {state.checking ? 'läuft gerade' : formatRelative(state.nextCheckAt)}
            {github}
          </p>
          <button className="btn" disabled={state.checking} onClick={() => run('POST', '/api/check')}>
            {state.checking ? 'Prüft …' : 'Jetzt prüfen'}
          </button>
        </div>
      </section>

      {state.warnings.map((warning) => (
        <p key={warning} className="banner warn">
          {warning}
        </p>
      ))}
      {!state.notificationsConfigured && (
        <p className="banner">
          Benachrichtigungen sind noch nicht eingerichtet – <a href="#einstellungen">Gotify in den Einstellungen hinterlegen</a>.
        </p>
      )}
      {notice && <p className="banner error">{notice}</p>}

      {state.apps.length === 0 ? (
        <p className="banner">Noch keine Apps gefunden – die erste Prüfung läuft wenige Sekunden nach dem Start.</p>
      ) : (
        <div className="grid">
          {state.apps.map((app, index) => (
            <AppCard
              key={app.id}
              app={app}
              index={index}
              onAction={(action: Action) => run('POST', `/api/apps/${app.id}/${action}`)}
              onAutoUpdate={(enabled) => run('PATCH', `/api/apps/${app.id}`, { autoUpdate: enabled })}
            />
          ))}
        </div>
      )}
    </>
  );
}
