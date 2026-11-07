import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppView, StateView } from '../../../shared/types';
import { api } from '../../lib/api';
import { arrange, saveLayout, saveSort, storedLayout, storedSort, type Layout, type Sort } from '../../lib/appsView';
import type { Action } from '../../components/AppActions/AppActions';
import { AppCard } from '../../components/AppCard/AppCard';
import { AppDetails } from '../../components/AppDetails/AppDetails';
import { AppsControls } from '../../components/AppsControls/AppsControls';
import { formatAt, formatDateTime, formatFull } from '../../lib/format';
import { getLocale, t, tm } from '../../i18n/i18n';

export function AppsPage() {
  const [state, setState] = useState<StateView | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>(storedSort);
  const [layout, setLayout] = useState<Layout>(storedLayout);
  const [query, setQuery] = useState('');
  // The app whose details are open; the element to give the focus back to when they close
  const [openId, setOpenId] = useState<string | null>(null);
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    document.body.classList.toggle('details-open', openId !== null);
    return () => document.body.classList.remove('details-open');
  }, [openId]);

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

  if (!state) return <p className="muted">{t('common.loading')}</p>;

  const installed = state.apps.filter((a) => a.status !== 'not-installed').length;
  // In the chosen order and within the search: the installed apps first, then – in a section of
  // their own, like in the launcher – the others
  const arranged = arrange(state.apps, sort, query, getLocale());
  const ready = arranged.filter((a) => a.status !== 'not-installed');
  const notInstalled = arranged.filter((a) => a.status === 'not-installed');
  const shown = [...ready, ...notInstalled];
  // Paging goes through the apps as shown – in their order, within the search
  const openIndex = shown.findIndex((a) => a.id === openId);
  const openApp = state.apps.find((a) => a.id === openId);
  const openDetails = (id: string) => {
    opener.current = document.activeElement as HTMLElement | null;
    setOpenId(id);
  };
  const closeDetails = () => {
    setOpenId(null);
    opener.current?.focus();
  };
  // One grid of cards; their numbers go on across both sections
  const grid = (apps: AppView[], first: number) =>
    apps.length > 0 && (
      <div className={layout === 'list' ? 'grid list' : 'grid'}>
        {apps.map((app, index) => (
          <AppCard
            key={app.id}
            app={app}
            index={first + index}
            layout={layout}
            onOpen={() => openDetails(app.id)}
            onAction={(action: Action) => run('POST', `/api/apps/${app.id}/${action}`)}
            onAutoUpdate={(enabled) => run('PATCH', `/api/apps/${app.id}`, { autoUpdate: enabled })}
          />
        ))}
      </div>
    );
  const updates = state.apps.filter((a) => a.status === 'update-available').length;
  const github =
    state.github.remaining !== null
      ? ` · ${t('apps.githubApi', { remaining: state.github.remaining, limit: state.github.limit ?? '?' })}`
      : '';

  return (
    <>
      <section className="toolbar">
        <div>
          <h1>{t('apps.title')}</h1>
          <p className="muted">
            {t('apps.installed', { installed, total: state.apps.length })}
            {updates > 0 && ` · ${updates === 1 ? t('apps.updatesOne') : t('apps.updatesOther', { count: updates })}`}
          </p>
        </div>
        <div className="toolbar-side">
          <p className="muted small">
            {t('apps.lastCheck', { time: formatDateTime(state.lastCheckAt) })}
            <br />
            {/* The time in the browser's time zone, the tooltip names date and zone */}
            <span title={state.checking ? undefined : formatFull(state.nextCheckAt)}>
              {t('apps.nextCheck', { time: state.checking ? t('apps.checkingNow') : formatAt(state.nextCheckAt) })}
            </span>
            {github}
          </p>
          <button className="btn" disabled={state.checking} onClick={() => run('POST', '/api/check')}>
            {state.checking ? t('apps.checking') : t('apps.checkNow')}
          </button>
        </div>
      </section>

      {state.warnings.map((warning) => (
        <p key={JSON.stringify(warning)} className="banner warn">
          {tm(warning)}
        </p>
      ))}
      {!state.notificationsConfigured && (
        <p className="banner">
          {t('apps.notifyMissing')} <a href="#benachrichtigungen">{t('apps.notifyMissingLink')}</a>.
        </p>
      )}
      {notice && <p className="banner error">{notice}</p>}

      {state.apps.length > 0 && (
        <AppsControls
          sort={sort}
          onSort={(next) => {
            setSort(next);
            saveSort(next);
          }}
          query={query}
          onQuery={setQuery}
          layout={layout}
          onLayout={(next) => {
            setLayout(next);
            saveLayout(next);
          }}
        />
      )}

      {state.apps.length === 0 ? (
        <p className="banner">{t('apps.none')}</p>
      ) : shown.length === 0 ? (
        <p className="banner">{t('apps.noMatch', { query: query.trim() })}</p>
      ) : (
        <>
          {grid(ready, 0)}
          {notInstalled.length > 0 && (
            <>
              <h2 className="apps-section">{t('apps.notInstalled')}</h2>
              {grid(notInstalled, ready.length)}
            </>
          )}
        </>
      )}
      {openApp && (
        <AppDetails
          key={openApp.id}
          app={openApp}
          onPrev={openIndex > 0 ? () => setOpenId(shown[openIndex - 1].id) : null}
          onNext={openIndex >= 0 && openIndex < shown.length - 1 ? () => setOpenId(shown[openIndex + 1].id) : null}
          onClose={closeDetails}
          onAction={(action) => run('POST', `/api/apps/${openApp.id}/${action}`)}
          onAutoUpdate={(enabled) => run('PATCH', `/api/apps/${openApp.id}`, { autoUpdate: enabled })}
        />
      )}
    </>
  );
}
