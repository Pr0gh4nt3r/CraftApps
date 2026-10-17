import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { AppView } from '../shared/types';
import { formatDate, formatSize } from './format';
import { Toggle } from './Toggle';

export type Action = 'install' | 'update' | 'uninstall';

const STATUS: Record<AppView['status'], { label: string; tone: string }> = {
  installed: { label: 'Installiert · Aktuell', tone: 'ok' },
  'update-available': { label: 'Update verfügbar', tone: 'warn' },
  'not-installed': { label: 'Nicht installiert', tone: 'muted' },
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

  function choose(action: Action) {
    setMenuOpen(false);
    if (action === 'uninstall' && !window.confirm(`${app.name} deinstallieren? Die Dateien werden gelöscht.`)) return;
    onAction(action);
  }

  let primary;
  if (app.status === 'not-installed') {
    primary = (
      <button className="btn primary" onClick={() => onAction('install')}>
        Installieren
      </button>
    );
  } else if (app.status === 'update-available') {
    primary = (
      <button className="btn primary" onClick={() => onAction('update')}>
        Aktualisieren
      </button>
    );
  } else if (app.openUrl) {
    primary = (
      <a className="btn primary" href={app.openUrl} target="_blank" rel="noreferrer">
        Öffnen
      </a>
    );
  } else {
    primary = (
      <button className="btn primary" disabled title="Öffentliche Adresse der Apps in den Einstellungen eintragen">
        Öffnen
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
            <p className="desc">{app.description}</p>
          </div>
        </div>
        <span className={`chip ${status.tone}`}>{status.label}</span>
        <p className="meta">{metaLine(app)}</p>
        {job?.state === 'failed' && <p className="card-error">{job.error}</p>}
        {app.error && <p className="card-error">{app.error}</p>}
        {installed && (
          <Toggle className="card-toggle" checked={app.autoUpdate} onChange={onAutoUpdate}>
            Automatisch aktualisieren
          </Toggle>
        )}
      </div>

      <footer className="card-actions">
        {running ? (
          <div className="progress">
            <span className="progress-bar" style={{ width: `${Math.round((job.progress ?? 0) * 100)}%` }} />
            <span className="progress-label">
              {job.phase}
              {job.progress !== null && job.progress < 1 ? ` ${Math.round(job.progress * 100)} %` : ' …'}
            </span>
          </div>
        ) : (
          <>
            {primary}
            <div className="menu-wrap" ref={menuRef}>
              <button className="btn square" aria-label="Weitere Aktionen" onClick={() => setMenuOpen((open) => !open)}>
                …
              </button>
              {menuOpen && (
                <div className="menu">
                  {app.status === 'update-available' && app.openUrl && (
                    <a href={app.openUrl} target="_blank" rel="noreferrer">
                      Öffnen ↗
                    </a>
                  )}
                  {installed && <button onClick={() => choose('install')}>Neu installieren</button>}
                  {installed && (
                    <button className="danger" onClick={() => choose('uninstall')}>
                      Deinstallieren
                    </button>
                  )}
                  <a href={`${app.repoUrl}/releases`} target="_blank" rel="noreferrer">
                    Release-Notizen ↗
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
