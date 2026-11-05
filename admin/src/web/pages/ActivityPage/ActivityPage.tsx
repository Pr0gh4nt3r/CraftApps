import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import type { EventKind, EventView } from '../../../shared/types';
import { api } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { t, tm, type UiKey } from '../../i18n/i18n';

const KINDS: Record<EventKind, { label: UiKey; tone: string }> = {
  installed: { label: 'activity.kind.installed', tone: 'ok' },
  updated: { label: 'activity.kind.updated', tone: 'ok' },
  uninstalled: { label: 'activity.kind.uninstalled', tone: 'muted' },
  available: { label: 'activity.kind.available', tone: 'info' },
  'update-available': { label: 'activity.kind.updateAvailable', tone: 'warn' },
  error: { label: 'activity.kind.error', tone: 'error' },
  check: { label: 'activity.kind.check', tone: 'muted' },
  setting: { label: 'activity.kind.setting', tone: 'muted' },
  notify: { label: 'activity.kind.notify', tone: 'info' },
  user: { label: 'activity.kind.user', tone: 'muted' },
  system: { label: 'activity.kind.system', tone: 'muted' },
};

// What the filter can show – each choice is a group of kinds, "all" shows everything
const FILTERS = {
  all: [],
  apps: ['installed', 'updated', 'uninstalled', 'available', 'update-available'],
  check: ['check'],
  error: ['error'],
  setting: ['setting', 'notify'],
  user: ['user'],
  system: ['system'],
} satisfies Record<string, EventKind[]>;
type Filter = keyof typeof FILTERS;

// Entries per page; "Load older entries" fetches the next page
const PAGE = 200;

function eventsUrl(filter: Filter, before?: number): string {
  const params = new URLSearchParams({ limit: String(PAGE) });
  const kinds: EventKind[] = FILTERS[filter];
  if (kinds.length) params.set('kinds', kinds.join(','));
  if (before) params.set('before', String(before));
  return `/api/events?${params}`;
}

export function ActivityPage() {
  const [filter, setFilter] = useState<Filter>('all');
  const [events, setEvents] = useState<EventView[] | null>(null);
  // Whether the last page was full – then there may be older entries
  const [more, setMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    () =>
      api<EventView[]>('GET', eventsUrl(filter)).then(
        (data) => {
          setEvents(data);
          setMore(data.length === PAGE);
          setError(null);
        },
        (err: Error) => setError(err.message),
      ),
    [filter],
  );
  useEffect(() => void load(), [load]);

  function loadOlder() {
    if (!events?.length) return;
    setLoadingMore(true);
    api<EventView[]>('GET', eventsUrl(filter, events[events.length - 1].id))
      .then(
        (data) => {
          setEvents([...events, ...data]);
          setMore(data.length === PAGE);
          setError(null);
        },
        (err: Error) => setError(err.message),
      )
      .finally(() => setLoadingMore(false));
  }

  return (
    <>
      <section className="toolbar">
        <div>
          <h1>{t('activity.title')}</h1>
          <p className="muted">{t('activity.subtitle')}</p>
        </div>
        <div className="toolbar-side">
          <select
            className="filter"
            aria-label={t('activity.filter')}
            value={filter}
            onChange={(e) => setFilter(e.target.value as Filter)}
          >
            {(Object.keys(FILTERS) as Filter[]).map((key) => (
              <option key={key} value={key}>
                {t(`activity.filter.${key}`)}
              </option>
            ))}
          </select>
          <button className="btn" onClick={load}>
            {t('activity.refresh')}
          </button>
        </div>
      </section>
      {error && <p className="banner error">{error}</p>}
      {events && events.length === 0 && (
        <p className="banner">{filter === 'all' ? t('activity.empty') : t('activity.emptyFilter')}</p>
      )}
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
                const kind: { label: UiKey; tone: string } | undefined = KINDS[e.kind as EventKind];
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
      {more && (
        <div className="load-more">
          <button className="btn" disabled={loadingMore} onClick={loadOlder}>
            {loadingMore ? t('common.loading') : t('activity.more')}
          </button>
        </div>
      )}
    </>
  );
}
