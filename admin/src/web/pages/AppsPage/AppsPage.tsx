import { useCallback, useEffect, useState } from 'react';
import type { StateView } from '../../../shared/types';
import { api } from '../../lib/api';
import { arrange, saveLayout, saveSort, storedLayout, storedSort, type Layout, type Sort } from '../../lib/appsView';
import { AppCard, type Action } from '../../components/AppCard/AppCard';
import { AppsControls } from '../../components/AppsControls/AppsControls';
import { formatAt, formatDateTime, formatFull } from '../../lib/format';
import { getLocale, t, tm } from '../../i18n/i18n';

export function AppsPage() {
  const [state, setState] = useState<StateView | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>(storedSort);
  const [layout, setLayout] = useState<Layout>(storedLayout);
  const [query, setQuery] = useState('');

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
  const shown = arrange(state.apps, sort, query, getLocale());
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
        <div className={layout === 'list' ? 'grid list' : 'grid'}>
          {shown.map((app, index) => (
            <AppCard
              key={app.id}
              app={app}
              index={index}
              layout={layout}
              onAction={(action: Action) => run('POST', `/api/apps/${app.id}/${action}`)}
              onAutoUpdate={(enabled) => run('PATCH', `/api/apps/${app.id}`, { autoUpdate: enabled })}
            />
          ))}
        </div>
      )}
    </>
  );
}
