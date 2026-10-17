import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import type { EventView } from '../shared/types';
import { api } from './api';
import { formatDateTime } from './format';

const KINDS: Record<string, { label: string; tone: string }> = {
  installed: { label: 'Installiert', tone: 'ok' },
  updated: { label: 'Aktualisiert', tone: 'ok' },
  uninstalled: { label: 'Entfernt', tone: 'muted' },
  available: { label: 'Neu', tone: 'info' },
  'update-available': { label: 'Update', tone: 'warn' },
  error: { label: 'Fehler', tone: 'error' },
  setting: { label: 'Einstellung', tone: 'muted' },
  check: { label: 'Prüfung', tone: 'muted' },
};

export function ActivityPage() {
  const [events, setEvents] = useState<EventView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setEvents(await api<EventView[]>('GET', '/api/events?limit=300'));
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);
  useEffect(() => void load(), [load]);

  return (
    <>
      <section className="toolbar">
        <div>
          <h1>Aktivität</h1>
          <p className="muted">Installationen, Updates, Fehler und Änderungen – die letzten 300 Einträge</p>
        </div>
        <button className="btn" onClick={load}>
          Aktualisieren
        </button>
      </section>
      {error && <p className="banner error">{error}</p>}
      {events && events.length === 0 && <p className="banner">Noch keine Einträge.</p>}
      {events && events.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Zeit</th>
                <th>App</th>
                <th>Art</th>
                <th>Was</th>
                <th>Durch</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => {
                const kind = KINDS[e.kind] ?? { label: e.kind, tone: 'muted' };
                return (
                  <tr key={e.id}>
                    <td className="nowrap mono">{formatDateTime(e.at)}</td>
                    <td className="nowrap">
                      {e.appId && (
                        <>
                          <span className="dot" style={{ '--c': e.appColor ?? undefined } as CSSProperties} />
                          {e.appName ?? e.appId}
                        </>
                      )}
                    </td>
                    <td>
                      <span className={`kind ${kind.tone}`}>{kind.label}</span>
                    </td>
                    <td>{e.message}</td>
                    <td className="muted nowrap">{e.username ?? 'automatisch'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
