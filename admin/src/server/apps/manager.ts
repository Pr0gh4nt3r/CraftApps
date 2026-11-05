import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { FastifyBaseLogger } from 'fastify';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import type { NotifyEvent } from '../../shared/channels.js';
import { countMsg, msg, parseMsg, renderMsg, type Localized, type Msg } from '../../shared/messages.js';
import { nextRun } from '../../shared/schedule.js';
import type { AppView, EventKind, JobKind, JobView, StateView } from '../../shared/types.js';
import { logEvent } from '../core/activity.js';
import type { Config } from '../core/config.js';
import { GitHubLimitError, type GitHub, type Repo } from './github.js';
import { appDir, deploy, download, prune, type Asset, type OnProgress } from './installer.js';
import { appMeta, fetchIcon, launcherInfo, type LauncherInfo } from './launcher.js';
import type { Failure, Notifier } from '../notify/notify.js';
import { writeOverview } from './overview.js';
import { isNewer, pickRelease, releaseCandidates, sortChannels, type Candidate } from './releases.js';
import type { Settings, SettingsStore } from '../settings/settings.js';
import { APP_ID, ConflictError, MINUTE, MsgError, NotFoundError, errorText, toMsg, version } from '../core/util.js';

interface AppRow extends RowDataPacket {
  id: string;
  repo: string;
  name: string;
  description: string;
  description_en: string;
  color: string;
  in_catalog: number;
  latest_tag: string | null;
  latest_published_at: Date | null;
  latest_asset: string | null;
  latest_etag: string | null;
  release_candidates: string | null;
  installed_tag: string | null;
  installed_published_at: Date | null;
  installed_files: string | null;
  auto_update: number;
  last_error: string | null;
  notified_tag: string | null;
}

interface Job extends JobView {
  username: string | null;
  finishedAt: number | null;
}

const jobLabel = (kind: JobKind): Msg => msg(`job.${kind}` as const);
const parseAsset = (json: string | null): Asset | null => (json ? (JSON.parse(json) as Asset) : null);
const parseFiles = (json: string | null): string[] => (json ? (JSON.parse(json) as string[]) : []);
const parseCandidates = (json: string | null): Candidate[] => (json ? (JSON.parse(json) as Candidate[]) : []);

// setTimeout waits at most ~24.8 days – a monthly or quarterly check is planned in steps
const MAX_TIMEOUT = 2 ** 31 - 1;

/** Finds apps, checks releases, installs/updates/removes them one at a time and notifies. */
export class Manager {
  private checking = false;
  private lastCheckAt: Date | null = null;
  private nextCheckAt: Date | null = null;
  private jobs: Job[] = [];
  private queue: Promise<void> = Promise.resolve();
  private nextJobId = 1;
  private timer: NodeJS.Timeout | undefined;
  private housekeeping: NodeJS.Timeout | undefined;
  private lastGlobalError: string | null = null;
  private readonly warnings: Msg[] = [];

  constructor(
    private readonly db: Pool,
    private readonly cfg: Config,
    private readonly settings: SettingsStore,
    private readonly notifier: Notifier,
    private readonly github: GitHub,
    private readonly log: FastifyBaseLogger,
  ) {}

  // ------------------------------------------------------------ Startup and schedule

  async init(): Promise<void> {
    try {
      await fs.mkdir(this.cfg.dataDir, { recursive: true }); // locally (DATA_DIR=./data) the folder doesn't exist at first
      await fs.access(this.cfg.dataDir, fs.constants.W_OK);
      await fs.rm(path.join(this.cfg.dataDir, '.tmp'), { recursive: true, force: true }); // leftovers of aborted downloads
    } catch {
      this.warnings.push(msg('error.noWriteAccess', { path: this.cfg.dataDir }));
    }
    await this.refreshOverview();
    const lastCheck = await this.settings.getInternal<string>('lastCheckAt');
    if (lastCheck) this.lastCheckAt = new Date(lastCheck);
  }

  start(): void {
    void this.planFirstCheck().catch((err) => this.log.error(err));
    this.housekeeping = setInterval(() => void this.cleanup(), 60 * MINUTE);
  }

  stop(): void {
    clearTimeout(this.timer);
    clearInterval(this.housekeeping);
  }

  /**
   * After the start, check shortly if there is nothing yet or a planned check was missed while
   * the admin UI was down – otherwise at the next planned time, so a restart (e.g. after an
   * update of the image) doesn't check outside the schedule.
   */
  private async planFirstCheck(): Promise<void> {
    const { checkSchedule } = await this.settings.get();
    const missed = !this.lastCheckAt || (nextRun(checkSchedule, this.lastCheckAt)?.getTime() ?? 0) <= Date.now();
    if (missed || (await this.apps()).length === 0) this.scheduleAt(new Date(Date.now() + 10_000));
    else await this.reschedule();
  }

  /** Plans the next check by the schedule in the settings */
  async reschedule(): Promise<void> {
    const { checkSchedule } = await this.settings.get();
    // Only an invalid schedule has no next time – the settings don't let one through
    this.scheduleAt(nextRun(checkSchedule, new Date()) ?? new Date(Date.now() + 360 * MINUTE));
  }

  private scheduleAt(at: Date): void {
    clearTimeout(this.timer);
    this.nextCheckAt = at;
    const delay = Math.max(0, at.getTime() - Date.now());
    if (delay > MAX_TIMEOUT) {
      this.timer = setTimeout(() => this.scheduleAt(at), MAX_TIMEOUT);
      return;
    }
    this.timer = setTimeout(async () => {
      await this.check().catch((err) => this.log.error(err));
      await this.reschedule().catch((err) => this.log.error(err));
    }, delay);
  }

  private async cleanup(): Promise<void> {
    try {
      await this.db.query('DELETE FROM sessions WHERE expires_at < CURRENT_TIMESTAMP(3)');
      await this.db.query('DELETE FROM events WHERE created_at < CURRENT_TIMESTAMP(3) - INTERVAL 180 DAY');
    } catch (err) {
      this.log.warn(`Aufräumen fehlgeschlagen: ${errorText(err)}`);
    }
  }

  // ------------------------------------------------------------ Checks

  /**
   * Looks for new apps and releases, applies automatic updates and notifies. Every check ends
   * up in the activity log – with what it found, or as an error if it couldn't search.
   */
  async check(username: string | null = null): Promise<void> {
    if (this.checking) return;
    this.checking = true;
    try {
      const settings = await this.settings.get();
      const firstRun = (await this.apps()).length === 0;
      let repos: Repo[];
      try {
        repos = await this.github.listRepos(this.cfg.owner);
        this.lastGlobalError = null;
      } catch (err) {
        await this.failure(null, msg('error.appSearchFailed', { error: toMsg(err) }), username);
        return;
      }
      await this.syncCatalog(repos, await launcherInfo(this.settings, this.log), settings);

      const fresh: AppRow[] = [];
      let updates = 0;
      let errors = 0;
      for (const app of await this.apps()) {
        if (!app.in_catalog) continue;
        await fetchIcon(this.cfg.dataDir, app.id);
        try {
          await this.refreshRelease(app, settings.updateChannel);
        } catch (err) {
          errors++;
          await this.failure(app, msg('error.checkFailed', { error: toMsg(err) }));
          if (err instanceof GitHubLimitError) break; // the remaining ones would fail the same way
          continue;
        }
        const installed = this.isInstalled(app);
        if (app.installed_tag && !installed) {
          await this.clearInstalled(app.id);
          await this.event('uninstalled', msg('event.filesMissing'), app.id);
        }
        if (!parseAsset(app.latest_asset) || !app.latest_tag) continue;
        if (installed) {
          if (!isNewer(app.latest_tag, app.installed_tag)) continue;
          if (app.auto_update) {
            updates++;
            this.queueQuietly('update', app.id);
          } else if (app.notified_tag !== app.latest_tag) {
            updates++;
            await this.markNotified(app);
            const change = `${version(app.installed_tag)} → ${version(app.latest_tag)}`;
            await this.event('update-available', msg('event.updateAvailable', { change }), app.id);
            await this.notify(
              'updateAvailable',
              msg('notify.updateAvailable.title', { app: app.name }),
              msg('notify.updateAvailable.body', { change }),
              5,
            );
          }
        } else if (app.notified_tag === null) {
          await this.markNotified(app);
          fresh.push(app);
          if (settings.autoInstallNew) this.queueQuietly('install', app.id);
        }
      }
      if (fresh.length) await this.announce(fresh, firstRun, settings.autoInstallNew);
      const found = [
        ...(fresh.length ? [countMsg('newApps', fresh.length)] : []),
        ...(updates ? [countMsg('updates', updates)] : []),
        ...(errors ? [countMsg('errors', errors)] : []),
      ];
      const result = found.length ? found : [msg('event.checkNothing')];
      await this.event('check', msg('event.checkResult', { result }), null, username);
      this.lastCheckAt = new Date();
      await this.settings.setInternal('lastCheckAt', this.lastCheckAt.toISOString());
    } finally {
      this.checking = false;
      await this.refreshOverview();
    }
  }

  /** Adds new repos and takes names, colors and order from the launcher. */
  private async syncCatalog(repos: Repo[], launcher: LauncherInfo, settings: Settings): Promise<void> {
    const order = Object.keys(launcher);
    const found = repos.filter((r) => !r.fork && APP_ID.test(r.name.toLowerCase()));
    for (const repo of found) {
      const id = repo.name.toLowerCase();
      const meta = appMeta(id, repo, launcher);
      const rank = order.indexOf(id);
      await this.db.query(
        `INSERT INTO apps (id, repo, name, description, description_en, color, sort_key, in_catalog, auto_update)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
         ON DUPLICATE KEY UPDATE repo = VALUES(repo), name = VALUES(name), description = VALUES(description),
           description_en = VALUES(description_en), color = VALUES(color), sort_key = VALUES(sort_key), in_catalog = 1`,
        [
          id,
          repo.name,
          meta.name,
          meta.description,
          meta.descriptionEn,
          meta.color,
          rank === -1 ? 1000 : rank,
          Number(settings.defaultAutoUpdate),
        ],
      );
    }
    // Stop checking renamed or deleted repos; installed ones remain manageable
    const ids = found.map((r) => r.name.toLowerCase());
    if (ids.length) await this.db.query('UPDATE apps SET in_catalog = 0 WHERE id NOT IN (?)', [ids]);
  }

  /** Fetches the releases in question and picks the newest one the update channel takes. */
  private async refreshRelease(app: AppRow, channel: string): Promise<void> {
    const etag = app.release_candidates === null ? null : app.latest_etag;
    const res = await this.github.releases(this.cfg.owner, app.repo, etag);
    if (res.kind === 'list') {
      const candidates = releaseCandidates(app.id, res.releases);
      app.release_candidates = JSON.stringify(candidates);
      // Without every web zip, don't remember the ETag – the release pipeline may still be uploading one
      app.latest_etag = candidates.every((c) => c.asset) ? res.etag : null;
    }
    // Also after "304 Not Modified": the channel may have changed since
    const pick = pickRelease(parseCandidates(app.release_candidates), channel);
    Object.assign(app, {
      latest_tag: pick?.tag ?? null,
      latest_published_at: pick?.publishedAt ? new Date(pick.publishedAt) : null,
      latest_asset: pick?.asset ? JSON.stringify(pick.asset satisfies Asset) : null,
      last_error: null,
    });
    await this.db.query(
      `UPDATE apps SET latest_tag = ?, latest_published_at = ?, latest_asset = ?, latest_etag = ?, release_candidates = ?,
         checked_at = CURRENT_TIMESTAMP(3), last_error = NULL WHERE id = ?`,
      [app.latest_tag, app.latest_published_at, app.latest_asset, app.latest_etag, app.release_candidates, app.id],
    );
  }

  /** The update channels the apps currently have releases in – stable always */
  async releaseChannels(): Promise<string[]> {
    const channels = ['stable'];
    for (const app of await this.apps()) {
      if (app.in_catalog) channels.push(...parseCandidates(app.release_candidates).map((c) => c.channel));
    }
    return sortChannels(channels);
  }

  private async announce(apps: AppRow[], firstRun: boolean, autoInstall: boolean): Promise<void> {
    for (const app of apps) await this.event('available', msg('event.available', { version: version(app.latest_tag) }), app.id);
    // On the very first run (or with many at once) one summary message instead of a flood
    if (firstRun || apps.length > 3) {
      const list = apps.map((a) => `- **${a.name}** ${version(a.latest_tag)}`).join('\n');
      const all = msg(autoInstall ? 'notify.newApps.allAuto' : 'notify.newApps.allManual');
      await this.notify('newApps', msg('notify.newApps.title', { count: apps.length }), msg('notify.newApps.body', { list, all }), 5);
    } else {
      for (const a of apps) {
        const descriptionEn = a.description_en || a.description;
        const about: Localized = { de: a.description ? `\n\n${a.description}` : '', en: descriptionEn ? `\n\n${descriptionEn}` : '' };
        const text = msg(autoInstall ? 'notify.newApp.auto' : 'notify.newApp.manual', {
          app: a.name,
          version: version(a.latest_tag),
          about,
        });
        await this.notify('newApps', msg('notify.newApp.title', { app: a.name }), text, 5);
      }
    }
  }

  // ------------------------------------------------------------ Actions

  /** Triggers an action from the UI. */
  async request(kind: JobKind, appId: string, username: string): Promise<JobView> {
    const app = await this.app(appId);
    if (!app) throw new NotFoundError(msg('error.unknownApp'));
    if (kind !== 'install' && !this.isInstalled(app)) throw new ConflictError(msg('error.notInstalled', { app: app.name }));
    return this.enqueue(kind, app.id, username);
  }

  private enqueue(kind: JobKind, appId: string, username: string | null): JobView {
    const active = this.activeJob(appId);
    if (active) {
      if (active.kind === kind) return this.jobView(active);
      throw new ConflictError(msg('error.jobRunning'));
    }
    const job: Job = { id: this.nextJobId++, appId, kind, state: 'queued', phase: 'queued', progress: null, error: null, username, finishedAt: null };
    const cutoff = Date.now() - 15 * MINUTE;
    this.jobs = [...this.jobs.filter((j) => j.finishedAt === null || j.finishedAt > cutoff), job];
    // Everything that touches files runs one after another
    this.queue = this.queue.then(() => this.run(job)).catch((err) => this.log.error(err));
    return this.jobView(job);
  }

  private queueQuietly(kind: JobKind, appId: string): void {
    try {
      this.enqueue(kind, appId, null);
    } catch (err) {
      if (!(err instanceof ConflictError)) throw err;
    }
  }

  private async run(job: Job): Promise<void> {
    job.state = 'running';
    const progress: OnProgress = (phase, fraction) => {
      job.phase = phase;
      job.progress = fraction;
    };
    const app = await this.app(job.appId).catch(() => undefined);
    try {
      if (!app) throw new MsgError(msg('error.unknownApp'));
      if (job.kind === 'uninstall') await this.uninstall(app, job.username);
      else await this.install(app, job, progress);
      job.state = 'done';
      progress('done', 1);
    } catch (err) {
      job.state = 'failed';
      job.error = toMsg(err);
      progress('failed', null);
      const failed = msg('event.jobFailed', { job: jobLabel(job.kind), error: job.error });
      this.log.warn(`${job.appId}: ${renderMsg('de', failed)}`);
      await this.event('error', failed, job.appId, job.username);
      const title = msg('notify.jobFailed.title', { app: app?.name ?? job.appId, job: jobLabel(job.kind) });
      await this.notify('errors', title, job.error, 8);
    } finally {
      job.finishedAt = Date.now();
      await this.refreshOverview();
    }
  }

  /** Installs the latest version ("install" also reinstalls, "update" only if newer). */
  private async install(app: AppRow, job: Job, progress: OnProgress): Promise<void> {
    const fromTag = this.isInstalled(app) ? app.installed_tag : null;
    progress('checking', null);
    await this.refreshRelease(app, (await this.settings.get()).updateChannel);
    const asset = parseAsset(app.latest_asset);
    if (!asset || !app.latest_tag) throw new MsgError(msg('error.noWebVersion'));
    if (job.kind === 'update' && !isNewer(app.latest_tag, fromTag)) return; // already up to date by now

    const dir = appDir(this.cfg.dataDir, app.id);
    const tmpDir = path.join(this.cfg.dataDir, '.tmp');
    await fs.mkdir(tmpDir, { recursive: true });
    const zipPath = path.join(tmpDir, `${app.id}.zip`);
    let files: string[];
    try {
      await download(asset, zipPath, progress);
      files = await deploy(dir, zipPath, progress);
    } finally {
      await fs.rm(zipPath, { force: true });
    }
    // The files of the previous version stay until the next update so that browsers which
    // just loaded the old index.html still get their .wasm
    await prune(dir, new Set([...files, ...(fromTag ? parseFiles(app.installed_files) : [])]));
    const autoUpdate = fromTag ? app.auto_update : Number((await this.settings.get()).defaultAutoUpdate);
    await this.db.query(
      `UPDATE apps SET installed_tag = ?, installed_published_at = ?, installed_at = CURRENT_TIMESTAMP(3),
         installed_files = ?, notified_tag = ?, auto_update = ? WHERE id = ?`,
      [app.latest_tag, app.latest_published_at, JSON.stringify(files), app.latest_tag, autoUpdate, app.id],
    );

    const to = version(app.latest_tag);
    if (fromTag && fromTag !== app.latest_tag) {
      const from = version(fromTag);
      await this.event('updated', msg('event.updated', { from, to }), app.id, job.username);
      const text = job.username ? msg('notify.updated.byUser', { from, to, user: job.username }) : msg('notify.updated.auto', { from, to });
      await this.notify('updated', msg('notify.updated.title', { app: app.name }), text, 4);
    } else {
      await this.event('installed', msg(fromTag ? 'event.reinstalled' : 'event.installed', { version: to }), app.id, job.username);
      if (!job.username) {
        await this.notify('updated', msg('notify.installed.title', { app: app.name }), msg('notify.installed.body', { version: to }), 4);
      }
    }
  }

  private async uninstall(app: AppRow, username: string | null): Promise<void> {
    await fs.rm(appDir(this.cfg.dataDir, app.id), { recursive: true, force: true });
    await this.clearInstalled(app.id);
    await this.event('uninstalled', msg('event.uninstalled'), app.id, username);
  }

  async setAutoUpdate(appId: string, enabled: boolean, username: string): Promise<void> {
    const app = await this.app(appId);
    if (!app) throw new NotFoundError(msg('error.unknownApp'));
    await this.db.query('UPDATE apps SET auto_update = ? WHERE id = ?', [Number(enabled), appId]);
    await this.event('setting', msg(enabled ? 'event.autoUpdateOn' : 'event.autoUpdateOff'), appId, username);
    // If an update is already pending, apply it right away
    if (enabled && this.isInstalled(app) && parseAsset(app.latest_asset) && isNewer(app.latest_tag, app.installed_tag)) {
      this.queueQuietly('update', appId);
    }
  }

  // ------------------------------------------------------------ State for the UI

  async state(): Promise<StateView> {
    const settings = await this.settings.get();
    const apps: AppView[] = [];
    for (const app of await this.apps()) {
      const view = this.view(app, settings);
      if (view) apps.push(view);
    }
    return {
      apps,
      checking: this.checking,
      lastCheckAt: this.lastCheckAt?.toISOString() ?? null,
      nextCheckAt: this.nextCheckAt?.toISOString() ?? null,
      github: {
        remaining: this.github.remaining,
        limit: this.github.limit,
        resetAt: this.github.resetAt?.toISOString() ?? null,
      },
      notificationsConfigured: await this.notifier.configured(),
      warnings: this.warnings,
    };
  }

  private view(app: AppRow, settings: Settings): AppView | null {
    const installed = this.isInstalled(app);
    const asset = parseAsset(app.latest_asset);
    // Show repos without a web version (e.g. artcraft) or vanished ones only if installed
    if (!installed && (!asset || !app.in_catalog)) return null;
    const recent = Date.now() - 15 * MINUTE;
    const job =
      this.activeJob(app.id) ??
      this.jobs.findLast((j) => j.appId === app.id && j.state === 'failed' && (j.finishedAt ?? 0) > recent);
    const updatable = installed && asset !== null && isNewer(app.latest_tag, app.installed_tag);
    return {
      id: app.id,
      name: app.name,
      description: app.description,
      descriptionEn: app.description_en || app.description,
      color: app.color,
      hasIcon: existsSync(path.join(this.cfg.dataDir, 'icons', `${app.id}.png`)),
      websiteUrl: `https://getartcraft.com/apps/${app.id}`,
      repoUrl: `https://github.com/${this.cfg.owner}/${app.repo}`,
      status: !installed ? 'not-installed' : updatable ? 'update-available' : 'installed',
      installedVersion: installed ? version(app.installed_tag) : null,
      installedPublishedAt: installed ? (app.installed_published_at?.toISOString() ?? null) : null,
      latestVersion: asset ? version(app.latest_tag) : null,
      latestPublishedAt: asset ? (app.latest_published_at?.toISOString() ?? null) : null,
      latestSize: asset?.size ?? null,
      autoUpdate: Boolean(app.auto_update),
      error: parseMsg(app.last_error),
      openUrl: installed && settings.appsBaseUrl ? `${settings.appsBaseUrl}/${app.id}/` : null,
      job: job ? this.jobView(job) : null,
    };
  }

  // ------------------------------------------------------------ Helpers

  async app(id: string): Promise<AppRow | undefined> {
    const [rows] = await this.db.query<AppRow[]>('SELECT * FROM apps WHERE id = ?', [id]);
    return rows[0];
  }

  private async apps(): Promise<AppRow[]> {
    const [rows] = await this.db.query<AppRow[]>('SELECT * FROM apps ORDER BY sort_key, id');
    return rows;
  }

  private isInstalled(app: AppRow): boolean {
    return app.installed_tag !== null && existsSync(path.join(this.cfg.dataDir, app.id, 'index.html'));
  }

  private activeJob(appId: string): Job | undefined {
    return this.jobs.find((j) => j.appId === appId && (j.state === 'queued' || j.state === 'running'));
  }

  private jobView(job: Job): JobView {
    const { id, appId, kind, state, phase, progress, error } = job;
    return { id, appId, kind, state, phase, progress, error };
  }

  private async clearInstalled(id: string): Promise<void> {
    await this.db.query(
      `UPDATE apps SET installed_tag = NULL, installed_published_at = NULL, installed_at = NULL, installed_files = NULL
       WHERE id = ?`,
      [id],
    );
  }

  private async markNotified(app: AppRow): Promise<void> {
    app.notified_tag = app.latest_tag;
    await this.db.query('UPDATE apps SET notified_tag = ? WHERE id = ?', [app.latest_tag, app.id]);
  }

  /** Activity log entry, see logEvent */
  event(kind: EventKind, message: Msg, appId: string | null = null, username: string | null = null): Promise<void> {
    return logEvent(this.db, kind, message, appId, username);
  }

  /** To every channel that reports the event; channels that fail end up in the activity log */
  private async notify(event: NotifyEvent, title: Msg, message: Msg, priority: number): Promise<void> {
    let failures: Failure[];
    try {
      failures = await this.notifier.notify(event, title, message, priority);
    } catch (err) {
      // Notifications never get in the way of a check or an update
      this.log.warn(`Benachrichtigungen nicht verschickt: ${errorText(err)}`);
      return;
    }
    for (const { channel, error } of failures) {
      const failed = msg('event.channelFailed', { name: channel, error });
      this.log.warn(renderMsg('de', failed));
      await this.event('error', failed);
    }
  }

  /**
   * Logs and reports errors – each error only once, not again on every check. A failed search
   * for apps ends the check, so it shows up in the activity log every time, as the result of
   * that check (username: who started it); the notification still goes out only once.
   */
  private async failure(app: AppRow | null, message: Msg, username: string | null = null): Promise<void> {
    const text = renderMsg('de', message);
    this.log.warn(app ? `${app.id}: ${text}` : text);
    const stored = JSON.stringify(message);
    if (app) {
      if (app.last_error === stored) return;
      app.last_error = stored;
      await this.db.query('UPDATE apps SET last_error = ?, checked_at = CURRENT_TIMESTAMP(3) WHERE id = ?', [stored, app.id]);
      await this.event('error', message, app.id);
    } else {
      await this.event('error', message, null, username);
      if (this.lastGlobalError === stored) return;
      this.lastGlobalError = stored;
    }
    const title = app ? msg('notify.error.title', { app: app.name }) : msg('notify.error.titleGlobal');
    await this.notify('errors', title, message, 8);
  }

  private async refreshOverview(): Promise<void> {
    try {
      const installed = (await this.apps()).filter((a) => this.isInstalled(a));
      await writeOverview(
        this.cfg.dataDir,
        installed.map((a) => ({
          id: a.id,
          name: a.name,
          description: a.description,
          descriptionEn: a.description_en || a.description,
          color: a.color,
          version: version(a.installed_tag),
          publishedAt: a.installed_published_at,
        })),
        path.join(this.cfg.webDir, 'overview'),
      );
    } catch (err) {
      this.log.warn(`Übersichtsseite nicht geschrieben: ${errorText(err)}`);
    }
  }
}
