import type { CSSProperties, MouseEvent } from 'react';
import type { AppView } from '../../../shared/types';
import type { Layout } from '../../lib/appsView';
import { STATUS, metaLine, splitName } from '../../lib/apps';
import { getLang, t, tm } from '../../i18n/i18n';
import { AppActions, type Action } from '../AppActions/AppActions';
import { Toggle } from '../Toggle/Toggle';

export function AppCard({
  app,
  index,
  layout = 'grid',
  onAction,
  onAutoUpdate,
  onOpen,
}: {
  app: AppView;
  index: number;
  /** A tile in the grid or a row in the list */
  layout?: Layout;
  onAction: (action: Action) => void;
  onAutoUpdate: (enabled: boolean) => void;
  /** Opens the details page, like a click on an app in the launcher */
  onOpen: () => void;
}) {
  const [head, craft] = splitName(app.name);
  const status = STATUS[app.status];
  const description = getLang() === 'en' ? app.descriptionEn : app.description;

  // A click anywhere on the card opens the details – not on its buttons, links and switch
  function click(e: MouseEvent) {
    if (!(e.target as Element).closest('a, button, input, label')) onOpen();
  }

  return (
    <article className="card" style={{ '--c': app.color } as CSSProperties} onClick={click}>
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
            {/* The name opens the details by keyboard as well */}
            <h2>
              <button type="button" className="card-name" onClick={onOpen}>
                {head}
                <span>{craft}</span>
              </button>
            </h2>
            <p className="desc">{description}</p>
          </div>
        </div>
        <div className="card-state">
          <span className={`chip ${status.tone}`}>{t(status.label)}</span>
          <p className="meta">{metaLine(app)}</p>
        </div>
        {app.job?.state === 'failed' && <p className="card-error">{tm(app.job.error)}</p>}
        {app.error && <p className="card-error">{tm(app.error)}</p>}
        {app.status !== 'not-installed' &&
          (layout === 'list' ? (
            // In the list only the switch, named by its tooltip
            <span className="card-toggle" title={t('app.autoUpdate')}>
              <Toggle checked={app.autoUpdate} onChange={onAutoUpdate} label={t('app.autoUpdate')} />
            </span>
          ) : (
            <Toggle className="card-toggle" checked={app.autoUpdate} onChange={onAutoUpdate}>
              {t('app.autoUpdate')}
            </Toggle>
          ))}
      </div>

      <footer className="card-actions">
        {/* The list has no room for the links of the tile */}
        <AppActions app={app} onAction={onAction} links={layout === 'list'} />
      </footer>
    </article>
  );
}
