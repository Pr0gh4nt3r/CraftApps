import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { AppDetailsData, AppView } from '../../../shared/types';
import { api } from '../../lib/api';
import { STATUS, metaLine, splitName } from '../../lib/apps';
import { formatDate, formatSize } from '../../lib/format';
import { getLang, t, tm } from '../../i18n/i18n';
import { Icon } from '../Icon/Icon';
import { AppActions, type Action } from '../AppActions/AppActions';
import { Toggle } from '../Toggle/Toggle';

type Shot = AppDetailsData['shots'][number] & { url: string };

/** The screenshots: the big one with arrows, below its caption and the small ones to pick from */
function Screenshots({ shots }: { shots: Shot[] }) {
  const [index, setIndex] = useState(0);
  const shot = shots[index];
  const go = (step: number) => setIndex((index + step + shots.length) % shots.length);
  return (
    <figure className="shots">
      <div className="shot-frame">
        <img src={shot.url} alt={shot.caption} />
        {shots.length > 1 && (
          <>
            <button type="button" className="shot-prev" aria-label={t('details.shotPrev')} onClick={() => go(-1)}>
              <Icon name="chevron-left" />
            </button>
            <button type="button" className="shot-next" aria-label={t('details.shotNext')} onClick={() => go(1)}>
              <Icon name="chevron-right" />
            </button>
          </>
        )}
      </div>
      <figcaption>
        {shot.caption} · {index + 1}/{shots.length}
      </figcaption>
      {shots.length > 1 && (
        <div className="shot-thumbs">
          {shots.map((s, i) => (
            <button
              key={s.key}
              type="button"
              aria-label={s.caption}
              aria-pressed={i === index}
              onClick={() => setIndex(i)}
            >
              <img src={s.url} alt="" />
            </button>
          ))}
        </div>
      )}
    </figure>
  );
}

/**
 * Details of an app like in the launcher: what it is, its screenshots and features, the latest
 * version – and the same actions as on its tile. The page comes from the launcher; without
 * one, the details show what GitHub knows.
 */
export function AppDetails({
  app,
  onPrev,
  onNext,
  onClose,
  onAction,
  onAutoUpdate,
}: {
  app: AppView;
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
  onClose: () => void;
  onAction: (action: Action) => void;
  onAutoUpdate: (enabled: boolean) => void;
}) {
  // undefined = still loading, null = the launcher has no page for the app
  const [details, setDetails] = useState<AppDetailsData | null | undefined>(undefined);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    api<AppDetailsData>('GET', `/api/apps/${app.id}/details`).then(setDetails, () => setDetails(null));
  }, [app.id]);

  useEffect(() => closeRef.current?.focus(), []);

  // Escape closes, the arrow keys page through the apps – not while typing
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as Element).closest('input, select, textarea')) return;
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft' && onPrev) onPrev();
      else if (e.key === 'ArrowRight' && onNext) onNext();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, onPrev, onNext]);

  const [head, craft] = splitName(app.name);
  const status = STATUS[app.status];
  const shots = (details?.shots ?? []).filter((s): s is Shot => Boolean(s.url));
  const features = details?.features ?? [];
  const section = (n: number) => String(n).padStart(2, '0');
  const releaseUrl = app.latestTag ? `${app.repoUrl}/releases/tag/${app.latestTag}` : `${app.repoUrl}/releases`;

  return (
    <div className="details-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section
        className="details"
        role="dialog"
        aria-modal="true"
        aria-labelledby="details-name"
        style={{ '--c': app.color } as CSSProperties}
      >
        <header className="details-head">
          <div className="details-bar">
            <span className="details-label">{t('details.label')}</span>
            <div className="details-nav">
              <button type="button" className="btn square" disabled={!onPrev} onClick={onPrev ?? undefined} aria-label={t('details.prev')} title={t('details.prev')}>
                <Icon name="chevron-left" />
              </button>
              <button type="button" className="btn square" disabled={!onNext} onClick={onNext ?? undefined} aria-label={t('details.next')} title={t('details.next')}>
                <Icon name="chevron-right" />
              </button>
              <button ref={closeRef} type="button" className="btn square" onClick={onClose} aria-label={t('details.close')} title={t('details.close')}>
                <Icon name="close" />
              </button>
            </div>
          </div>

          <div className="details-title">
            {app.hasIcon ? (
              <img className="details-icon" src={`/api/icons/${app.id}`} alt="" />
            ) : (
              <span className="details-icon placeholder">{app.name.charAt(0)}</span>
            )}
            <div className="details-name">
              <h2 id="details-name">
                {head}
                <span>{craft}</span>
              </h2>
              <p className="details-headline">
                {details?.headline ?? (getLang() === 'en' ? app.descriptionEn : app.description)}
              </p>
              <p className="details-meta">
                <span className={`chip ${status.tone}`}>{t(status.label)}</span>
                {metaLine(app)}
              </p>
            </div>
            <div className="details-actions">
              <div className="details-buttons">
                <AppActions app={app} onAction={onAction} menuBelow />
              </div>
              {app.status !== 'not-installed' && (
                <Toggle checked={app.autoUpdate} onChange={onAutoUpdate}>
                  {t('app.autoUpdate')}
                </Toggle>
              )}
            </div>
          </div>
          {app.job?.state === 'failed' && <p className="card-error">{tm(app.job.error)}</p>}
          {app.error && <p className="card-error">{tm(app.error)}</p>}

          <nav className="details-links">
            <a href={app.websiteUrl} target="_blank" rel="noreferrer">
              Website ↗
            </a>
            <a href={app.repoUrl} target="_blank" rel="noreferrer">
              GitHub ↗
            </a>
            <a href={`${app.repoUrl}/releases`} target="_blank" rel="noreferrer">
              {t('details.versions')} ↗
            </a>
          </nav>
        </header>

        <div className="details-body">
          {(shots.length > 0 || details?.paragraphs.length) && (
            <div className="details-about">
              {shots.length > 0 && <Screenshots key={app.id} shots={shots} />}
              {details?.paragraphs.map((p) => (
                <p key={p}>{p}</p>
              ))}
            </div>
          )}

          {features.length > 0 && (
            <section className="details-features">
              <h3>
                {section(1)} / {t('details.features')}
              </h3>
              <ol>
                {features.map((f, i) => (
                  <li key={f.title}>
                    <strong>
                      <span>{section(i + 1)}</span>
                      {f.title}
                    </strong>
                    <p>{f.text}</p>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <section className="details-release">
            <h3>
              {section(features.length > 0 ? 2 : 1)} / {t('details.release')}
            </h3>
            <dl>
              <div>
                <dt>{t('details.version')}</dt>
                <dd>{app.latestVersion ?? app.installedVersion ?? '–'}</dd>
              </div>
              <div>
                <dt>{t('details.published')}</dt>
                <dd>{formatDate(app.latestPublishedAt ?? app.installedPublishedAt) || '–'}</dd>
              </div>
              <div>
                <dt>{t('details.download')}</dt>
                <dd>{formatSize(app.latestSize) || '–'}</dd>
              </div>
              <div>
                <dt>{t('details.platforms')}</dt>
                <dd>{details?.platforms ?? '–'}</dd>
              </div>
            </dl>
            <a href={releaseUrl} target="_blank" rel="noreferrer">
              {t('details.changelog')} ↗
            </a>
          </section>
        </div>
      </section>
    </div>
  );
}
