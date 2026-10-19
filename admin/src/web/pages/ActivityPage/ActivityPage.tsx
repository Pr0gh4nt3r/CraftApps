import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import type { EventView } from '../../../shared/types';
import { api } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { t, tm, type UiKey } from '../../i18n/i18n';

const KINDS: Record<string, { label: UiKey; tone: string }> = {
  installed: { label: 'activity.kind.installed', tone: 'ok' },
  updated: { label: 'activity.kind.updated', tone: 'ok' },
  uninstalled: { label: 'activity.kind.uninstalled', tone: 'muted' },
  available: { label: 'activity.kind.available', tone: 'info' },
  'update-available': { label: 'activity.kind.updateAvailable', tone: 'warn' },
  error: { label: 'activity.kind.error', tone: 'error' },
  setting: { label: 'activity.kind.setting', tone: 'muted' },
  check: { label: 'activity.kind.check', tone: 'muted' },
};

export function ActivityPage() {
  const [events, setEvents] = useState<EventView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    () =>
      api<EventView[]>('GET', '/api/events?limit=300').then(
        (data) => {
          setEvents(data);
          setError(null);
        },
        (err: Error) => setError(err.message),
      ),
    [],
  );
  useEffect(() => void load(), [load]);

  return (
    <>
      <section className="toolbar">
        <div>
          <h1>{t('activity.title')}</h1>
          <p className="muted">{t('activity.subtitle')}</p>
        </div>
        <button className="btn" onClick={load}>
          {t('activity.refresh')}
        </button>
      </section>
      {error && <p className="banner error">{error}</p>}
      {events && events.length === 0 && <p className="banner">{t('activity.empty')}</p>}
      {events && events.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t('activity.time')}</th>
                <th>{t('activity.app')}</th>
                <th>{t('activity.kind')}</th>
                <th>{t('activity.what')}</th>
                <th>{t('activity.by')}</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => {
                const kind = KINDS[e.kind];
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
                      <span className={`kind ${kind?.tone ?? 'muted'}`}>{kind ? t(kind.label) : e.kind}</span>
                    </td>
                    <td>{tm(e.message)}</td>
                    <td className="muted nowrap">{e.username ?? t('activity.automatic')}</td>
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
