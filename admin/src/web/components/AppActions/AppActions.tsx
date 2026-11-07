import { useEffect, useRef, useState } from 'react';
import type { AppView } from '../../../shared/types';
import { countUse } from '../../lib/appsView';
import { t, tm } from '../../i18n/i18n';

export type Action = 'install' | 'update' | 'uninstall';

/**
 * Open, install or update plus the "…" menu – or the progress of a running action. On the tile,
 * in the row of the list and on the details page.
 */
export function AppActions({
  app,
  onAction,
  links = false,
  menuBelow = false,
}: {
  app: AppView;
  onAction: (action: Action) => void;
  /** Website and GitHub in the menu, where there is no room for them otherwise */
  links?: boolean;
  /** The menu opens below the button instead of above */
  menuBelow?: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen]);

  const job = app.job;
  const installed = app.status !== 'not-installed';

  if (job !== null && (job.state === 'queued' || job.state === 'running')) {
    return (
      <div className="progress">
        <progress className="progress-bar" value={job.progress ?? 0} max={1} aria-hidden="true" />
        <span className="progress-label">
          {tm({ key: `phase.${job.phase}` })}
          {job.progress !== null && job.progress < 1 ? ` ${Math.round(job.progress * 100)} %` : ' …'}
        </span>
      </div>
    );
  }

  function choose(action: Action) {
    setMenuOpen(false);
    if (action === 'uninstall' && !window.confirm(t('app.confirmUninstall', { app: app.name }))) return;
    onAction(action);
  }

  let primary;
  if (app.status === 'not-installed') {
    primary = (
      <button className="btn primary" onClick={() => onAction('install')}>
        {t('app.install')}
      </button>
    );
  } else if (app.status === 'update-available') {
    primary = (
      <button className="btn primary" onClick={() => onAction('update')}>
        {t('app.update')}
      </button>
    );
  } else if (app.openUrl) {
    primary = (
      <a className="btn primary" href={app.openUrl} target="_blank" rel="noreferrer" onClick={() => countUse(app.id)}>
        {t('app.open')}
      </a>
    );
  } else {
    primary = (
      <button className="btn primary" disabled title={t('app.openMissing')}>
        {t('app.open')}
      </button>
    );
  }

  return (
    <>
      {primary}
      <div className="menu-wrap" ref={menuRef}>
        <button className="btn square" aria-label={t('app.moreActions')} onClick={() => setMenuOpen((open) => !open)}>
          …
        </button>
        {menuOpen && (
          <div className={menuBelow ? 'menu below' : 'menu'}>
            {app.status === 'update-available' && app.openUrl && (
              <a href={app.openUrl} target="_blank" rel="noreferrer" onClick={() => countUse(app.id)}>
                {t('app.open')} ↗
              </a>
            )}
            {installed && <button onClick={() => choose('install')}>{t('app.reinstall')}</button>}
            {installed && (
              <button className="danger" onClick={() => choose('uninstall')}>
                {t('app.uninstall')}
              </button>
            )}
            <a href={`${app.repoUrl}/releases`} target="_blank" rel="noreferrer">
              {t('app.releaseNotes')} ↗
            </a>
            {links && (
              <>
                <a href={app.websiteUrl} target="_blank" rel="noreferrer">
                  Website ↗
                </a>
                <a href={app.repoUrl} target="_blank" rel="noreferrer">
                  GitHub ↗
                </a>
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}
