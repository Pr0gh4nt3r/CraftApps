import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { AppView } from '../shared/types';
import { formatDate, formatSize } from './format';
import { getLang, t, tm, type UiKey } from './i18n';
import { Toggle } from './Toggle';

export type Action = 'install' | 'update' | 'uninstall';

const STATUS: Record<AppView['status'], { label: UiKey; tone: string }> = {
  installed: { label: 'app.status.installed', tone: 'ok' },
  'update-available': { label: 'app.status.updateAvailable', tone: 'warn' },
  'not-installed': { label: 'app.status.notInstalled', tone: 'muted' },
};

function metaLine(app: AppView): string {
  if (app.status === 'not-installed') {
    return `Version ${app.latestVersion} · ${formatDate(app.latestPublishedAt)} · ${formatSize(app.latestSize)}`;
  }
  if (app.status === 'update-available') {
    return `Version ${app.installedVersion} → ${app.latestVersion} · ${formatDate(app.latestPublishedAt)}`;
  }
  return `Version ${app.installedVersion} · ${formatDate(app.installedPublishedAt)}`;
}

export function AppCard({
  app,
  index,
  onAction,
  onAutoUpdate,
}: {
  app: AppView;
  index: number;
  onAction: (action: Action) => void;
  onAutoUpdate: (enabled: boolean) => void;
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
  const running = job !== null && (job.state === 'queued' || job.state === 'running');
  const installed = app.status !== 'not-installed';
  const [head, craft] = app.name.endsWith('Craft') ? [app.name.slice(0, -5), 'Craft'] : [app.name, ''];
  const status = STATUS[app.status];
  const description = getLang() === 'en' ? app.descriptionEn : app.description;

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
      <a className="btn primary" href={app.openUrl} target="_blank" rel="noreferrer">
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
    <article className="card" style={{ '--c': app.color } as CSSProperties}>
      <header className="card-top">
        <span className="num">{String(index + 1).padStart(2, '0')}</span>
        <nav className="card-links">
          <a href={app.websiteUrl} target="_blank" rel="noreferrer">
            Website ↗
          </a>
          <a href={app.repoUrl} target="_blank" rel="noreferrer">
            GitHub ↗
          </a>
        </nav>
      </header>

      <div className="card-body">
        <div className="card-head">
          {app.hasIcon ? (
            <img className="icon" src={`/api/icons/${app.id}`} alt="" />
          ) : (
            <span className="icon placeholder">{app.name.charAt(0)}</span>
          )}
          <div>
            <h2>
              {head}
              <span>{craft}</span>
            </h2>
            <p className="desc">{description}</p>
          </div>
        </div>
        <span className={`chip ${status.tone}`}>{t(status.label)}</span>
        <p className="meta">{metaLine(app)}</p>
        {job?.state === 'failed' && <p className="card-error">{tm(job.error)}</p>}
        {app.error && <p className="card-error">{tm(app.error)}</p>}
        {installed && (
          <Toggle className="card-toggle" checked={app.autoUpdate} onChange={onAutoUpdate}>
            {t('app.autoUpdate')}
          </Toggle>
        )}
      </div>

      <footer className="card-actions">
        {running ? (
          <div className="progress">
            <span className="progress-bar" style={{ width: `${Math.round((job.progress ?? 0) * 100)}%` }} />
            <span className="progress-label">
              {tm({ key: `phase.${job.phase}` })}
              {job.progress !== null && job.progress < 1 ? ` ${Math.round(job.progress * 100)} %` : ' …'}
            </span>
          </div>
        ) : (
          <>
            {primary}
            <div className="menu-wrap" ref={menuRef}>
              <button className="btn square" aria-label={t('app.moreActions')} onClick={() => setMenuOpen((open) => !open)}>
                …
              </button>
              {menuOpen && (
                <div className="menu">
                  {app.status === 'update-available' && app.openUrl && (
                    <a href={app.openUrl} target="_blank" rel="noreferrer">
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
                </div>
              )}
            </div>
          </>
        )}
      </footer>
    </article>
  );
}
