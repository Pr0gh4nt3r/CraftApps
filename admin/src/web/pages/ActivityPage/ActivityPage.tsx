import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import type { EventKind, EventView } from '../../../shared/types';
import { api } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { t, tm, type UiKey } from '../../i18n/i18n';
import { MultiSelect } from '../../components/MultiSelect/MultiSelect';

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

// What the filter offers – each entry is a group of kinds, any of them can be ticked
const GROUPS = {
  apps: ['installed', 'updated', 'uninstalled', 'available', 'update-available'],
  check: ['check'],
  error: ['error'],
  setting: ['setting', 'notify'],
  user: ['user'],
  system: ['system'],
} satisfies Record<string, EventKind[]>;
type Group = keyof typeof GROUPS;
const ALL_GROUPS = Object.keys(GROUPS) as Group[];

// Entries per page; "Load older entries" fetches the next page
const PAGE = 200;

function eventsUrl(groups: Group[], before?: number): string {
  const params = new URLSearchParams({ limit: String(PAGE) });
  // Everything ticked: no filter at all – so kinds of a newer version show up too
  if (groups.length < ALL_GROUPS.length) params.set('kinds', groups.flatMap((g): EventKind[] => GROUPS[g]).join(','));
  if (before) params.set('before', String(before));
  return `/api/events?${params}`;
}

export function ActivityPage() {
  const [groups, setGroups] = useState<Group[]>(ALL_GROUPS);
  const [events, setEvents] = useState<EventView[] | null>(null);
  // Whether the last page was full – then there may be older entries
  const [more, setMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Ticking quickly starts several requests – only the latest one counts
  const latest = useRef(0);

  const load = useCallback(() => {
    // Nothing ticked: nothing to ask for, the page says so instead of the table
    if (!groups.length) return;
    const request = ++latest.current;
    api<EventView[]>('GET', eventsUrl(groups)).then(
      (data) => {
        if (request !== latest.current) return;
        setEvents(data);
        setMore(data.length === PAGE);
        setError(null);
      },
      (err: Error) => setError(err.message),
    );
  }, [groups]);
  useEffect(() => load(), [load]);

  function loadOlder() {
    if (!events?.length) return;
    const request = latest.current;
    setLoadingMore(true);
    api<EventView[]>('GET', eventsUrl(groups, events[events.length - 1].id))
      .then(
        (data) => {
          if (request !== latest.current) return;
          setEvents([...events, ...data]);
          setMore(data.length === PAGE);
          setError(null);
        },
        (err: Error) => setError(err.message),
      )
      .finally(() => setLoadingMore(false));
  }

  const nothing = groups.length === 0;

  return (
    <>
      <section className="toolbar">
        <div>
          <h1>{t('activity.title')}</h1>
          <p className="muted">{t('activity.subtitle')}</p>
        </div>
        <div className="toolbar-side">
          <MultiSelect
            label={t('activity.filter')}
            options={ALL_GROUPS.map((group) => ({ value: group, label: t(`activity.filter.${group}`) }))}
            selected={groups}
            onChange={setGroups}
            allLabel={t('activity.filter.all')}
            noneLabel={t('activity.filter.none')}
            someLabel={(count, total) => t('activity.filter.some', { count, total })}
          />
          <button className="btn" disabled={nothing} onClick={load}>
            {t('activity.refresh')}
          </button>
        </div>
      </section>
      {error && <p className="banner error">{error}</p>}
      {nothing && <p className="banner">{t('activity.emptyNone')}</p>}
      {!nothing && events && events.length === 0 && (
        <p className="banner">
          {groups.length === ALL_GROUPS.length ? t('activity.empty') : t('activity.emptyFilter')}
        </p>
      )}
      {!nothing && events && events.length > 0 && (
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
      {!nothing && more && (
        <div className="load-more">
          <button className="btn" disabled={loadingMore} onClick={loadOlder}>
            {loadingMore ? t('common.loading') : t('activity.more')}
          </button>
        </div>
      )}
    </>
  );
}
