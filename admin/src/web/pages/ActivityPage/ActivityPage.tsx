import { Fragment, useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  ACTIVITY_GROUP_IDS,
  ACTIVITY_GROUPS,
  sameView,
  type ActivityColumn,
  type ActivityGroup,
  type ActivityView,
  type ActivityViewState,
} from '../../../shared/activity';
import type { EventKind, EventView } from '../../../shared/types';
import { api } from '../../lib/api';
import { COLUMN_LABELS } from '../../lib/activity';
import { formatDateTime } from '../../lib/format';
import { t, tm, type UiKey } from '../../i18n/i18n';
import { ColumnFilter, KindFilter } from '../../components/ActivityFilters/ActivityFilters';

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

// One cell per column
const CELLS: Record<ActivityColumn, (e: EventView) => ReactNode> = {
  time: (e) => <td className="nowrap mono">{formatDateTime(e.at)}</td>,
  app: (e) => (
    <td className="nowrap">
      {e.appId && (
        <>
          <span className="dot" style={{ '--c': e.appColor ?? undefined } as CSSProperties} />
          {e.appName ?? e.appId}
        </>
      )}
    </td>
  ),
  kind: (e) => {
    const kind: { label: UiKey; tone: string } | undefined = KINDS[e.kind as EventKind];
    return (
      <td>
        <span className={`kind ${kind?.tone ?? 'muted'}`}>{kind ? t(kind.label) : e.kind}</span>
      </td>
    );
  },
  what: (e) => <td>{tm(e.message)}</td>,
  by: (e) => <td className="muted nowrap">{e.username ?? t('activity.automatic')}</td>,
};

// Entries per page; "Load older entries" fetches the next page
const PAGE = 200;

function eventsUrl(groups: ActivityGroup[], before?: number): string {
  const params = new URLSearchParams({ limit: String(PAGE) });
  // Everything ticked: no filter at all – so kinds of a newer version show up too
  if (groups.length < ACTIVITY_GROUP_IDS.length) {
    params.set('kinds', groups.flatMap((g): readonly EventKind[] => ACTIVITY_GROUPS[g]).join(','));
  }
  if (before) params.set('before', String(before));
  return `/api/events?${params}`;
}

export function ActivityPage() {
  // The default from the settings and the user's own view – loaded first, the entries after it
  const [views, setViews] = useState<ActivityViewState | null>(null);
  const view = views ? (views.own ?? views.default) : null;
  const [events, setEvents] = useState<EventView[] | null>(null);
  // Whether the last page was full – then there may be older entries
  const [more, setMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Ticking quickly starts several requests – only the latest one counts
  const latest = useRef(0);
  // Views are saved one after the other, so the last choice wins
  const saving = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    api<ActivityViewState>('GET', '/api/activity/view').then(setViews, (err: Error) => setError(err.message));
  }, []);

  // Only a change of the groups loads again, not one of the columns
  const groupsKey = view ? view.groups.join(',') : null;
  const load = useCallback(() => {
    // Not loaded yet, or nothing ticked: the page says so instead of the table
    if (!groupsKey) return;
    const request = ++latest.current;
    api<EventView[]>('GET', eventsUrl(groupsKey.split(',') as ActivityGroup[])).then(
      (data) => {
        if (request !== latest.current) return;
        setEvents(data);
        setMore(data.length === PAGE);
        setError(null);
      },
      (err: Error) => setError(err.message),
    );
  }, [groupsKey]);
  useEffect(() => load(), [load]);

  function loadOlder() {
    if (!view || !events?.length) return;
    const request = latest.current;
    setLoadingMore(true);
    api<EventView[]>('GET', eventsUrl(view.groups, events[events.length - 1].id))
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

  /** Shows the new view right away and saves it for the user; null goes back to the default */
  function changeView(next: ActivityView | null) {
    if (!views) return;
    // The same as the default: follow the default from now on, also when it changes
    const own = next && !sameView(next, views.default) ? next : null;
    setViews({ ...views, own });
    saving.current = saving.current
      .then(() => api('PUT', '/api/activity/view', { view: own }))
      .catch((err: Error) => setError(err.message));
  }

  if (!view) return error ? <p className="banner error">{error}</p> : <p className="muted">{t('common.loading')}</p>;

  const nothing = view.groups.length === 0;

  return (
    <>
      <section className="toolbar">
        <div>
          <h1>{t('activity.title')}</h1>
          <p className="muted">{t('activity.subtitle')}</p>
          {views?.own && (
            <p className="muted small own-view">
              {t('activity.ownView')}
              <button type="button" className="link" onClick={() => changeView(null)}>
                {t('activity.reset')}
              </button>
            </p>
          )}
        </div>
        <div className="toolbar-side activity-controls">
          <KindFilter selected={view.groups} onChange={(groups) => changeView({ ...view, groups })} />
          <ColumnFilter selected={view.columns} onChange={(columns) => changeView({ ...view, columns })} />
          <button className="btn" disabled={nothing} onClick={load}>
            {t('activity.refresh')}
          </button>
        </div>
      </section>
      {error && <p className="banner error">{error}</p>}
      {nothing && <p className="banner">{t('activity.emptyNone')}</p>}
      {!nothing && events && events.length === 0 && (
        <p className="banner">
          {view.groups.length === ACTIVITY_GROUP_IDS.length ? t('activity.empty') : t('activity.emptyFilter')}
        </p>
      )}
      {!nothing && events && events.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                {view.columns.map((column) => (
                  <th key={column}>{t(COLUMN_LABELS[column])}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
                  {view.columns.map((column) => (
                    <Fragment key={column}>{CELLS[column](e)}</Fragment>
                  ))}
                </tr>
              ))}
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
