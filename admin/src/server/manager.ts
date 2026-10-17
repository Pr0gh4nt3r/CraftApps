import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { FastifyBaseLogger } from 'fastify';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import type { AppView, JobKind, JobView, StateView } from '../shared/types.js';
import type { Config } from './config.js';
import { GitHubLimitError, findWebAsset, type GitHub, type Repo } from './github.js';
import { appDir, deploy, download, prune, type Asset, type OnProgress } from './installer.js';
import { appMeta, fetchIcon, launcherInfo, type LauncherInfo } from './launcher.js';
import { sendGotify } from './notify.js';
import { writeOverview } from './overview.js';
import type { Settings, SettingsStore } from './settings.js';
import { APP_ID, MINUTE, errorText, version } from './util.js';

interface AppRow extends RowDataPacket {
  id: string;
  repo: string;
  name: string;
  description: string;
  color: string;
  in_catalog: number;
  latest_tag: string | null;
  latest_published_at: Date | null;
  latest_asset: string | null;
  latest_etag: string | null;
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

type NotifyCategory = 'notifyNewApps' | 'notifyUpdateAvailable' | 'notifyUpdated' | 'notifyErrors';

export class NotFoundError extends Error {
  readonly statusCode = 404;
}

export class ConflictError extends Error {
  readonly statusCode = 409;
}

const KIND_LABEL: Record<JobKind, string> = { install: 'Installation', update: 'Update', uninstall: 'Deinstallation' };
const parseAsset = (json: string | null): Asset | null => (json ? (JSON.parse(json) as Asset) : null);
const parseFiles = (json: string | null): string[] => (json ? (JSON.parse(json) as string[]) : []);

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
  private readonly warnings: string[] = [];

  constructor(
    private readonly db: Pool,
    private readonly cfg: Config,
    private readonly settings: SettingsStore,
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
      this.warnings.push(
        `Keine Schreibrechte auf ${this.cfg.dataDir} – das Daten-Volume muss dem Benutzer 1000 gehören (siehe README).`,
      );
    }
    await this.refreshOverview();
    const lastCheck = await this.settings.getInternal<string>('lastCheckAt');
    if (lastCheck) this.lastCheckAt = new Date(lastCheck);
  }

  start(): void {
    this.schedule(10_000); // first check shortly after startup
    this.housekeeping = setInterval(() => void this.cleanup(), 60 * MINUTE);
  }

  stop(): void {
    clearTimeout(this.timer);
    clearInterval(this.housekeeping);
  }

  async reschedule(): Promise<void> {
    this.schedule((await this.settings.get()).checkIntervalMinutes * MINUTE);
  }

  private schedule(delay: number): void {
    clearTimeout(this.timer);
    this.nextCheckAt = new Date(Date.now() + delay);
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

  /** Looks for new apps and releases, applies automatic updates and notifies. */
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
        await this.failure(null, `App-Suche auf GitHub fehlgeschlagen: ${errorText(err)}`);
        return;
      }
      await this.syncCatalog(repos, await launcherInfo(this.settings, this.log), settings);
      if (username) await this.event('check', 'Nach Updates gesucht', null, username);

      const fresh: AppRow[] = [];
      for (const app of await this.apps()) {
        if (!app.in_catalog) continue;
        await fetchIcon(this.cfg.dataDir, app.id);
        try {
          await this.refreshRelease(app);
        } catch (err) {
          await this.failure(app, `Prüfung fehlgeschlagen: ${errorText(err)}`);
          if (err instanceof GitHubLimitError) break; // the remaining ones would fail the same way
          continue;
        }
        const installed = this.isInstalled(app);
        if (app.installed_tag && !installed) {
          await this.clearInstalled(app.id);
          await this.event('uninstalled', 'Dateien fehlen im Volume – als nicht installiert markiert', app.id);
        }
        if (!parseAsset(app.latest_asset) || !app.latest_tag) continue;
        if (installed) {
          if (app.latest_tag === app.installed_tag) continue;
          if (app.auto_update) {
            this.queueQuietly('update', app.id);
          } else if (app.notified_tag !== app.latest_tag) {
            await this.markNotified(app);
            const change = `${version(app.installed_tag)} → ${version(app.latest_tag)}`;
            await this.event('update-available', `Update verfügbar: ${change}`, app.id);
            await this.notify('notifyUpdateAvailable', `Update für ${app.name}`, `**${change}** ist verfügbar.`, 5);
          }
        } else if (app.notified_tag === null) {
          await this.markNotified(app);
          fresh.push(app);
          if (settings.autoInstallNew) this.queueQuietly('install', app.id);
        }
      }
      if (fresh.length) await this.announce(fresh, firstRun, settings.autoInstallNew);
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
        `INSERT INTO apps (id, repo, name, description, color, sort_key, in_catalog, auto_update)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?)
         ON DUPLICATE KEY UPDATE repo = VALUES(repo), name = VALUES(name), description = VALUES(description),
           color = VALUES(color), sort_key = VALUES(sort_key), in_catalog = 1`,
        [id, repo.name, meta.name, meta.description, meta.color, rank === -1 ? 1000 : rank, Number(settings.defaultAutoUpdate)],
      );
    }
    // Stop checking renamed or deleted repos; installed ones remain manageable
    const ids = found.map((r) => r.name.toLowerCase());
    if (ids.length) await this.db.query('UPDATE apps SET in_catalog = 0 WHERE id NOT IN (?)', [ids]);
  }

  private async refreshRelease(app: AppRow): Promise<void> {
    const res = await this.github.latestRelease(this.cfg.owner, app.repo, app.latest_tag ? app.latest_etag : null);
    if (res.kind === 'none') {
      Object.assign(app, { latest_tag: null, latest_published_at: null, latest_asset: null, latest_etag: null });
    } else if (res.kind === 'release') {
      const asset = findWebAsset(app.id, res.release);
      Object.assign(app, {
        latest_tag: res.release.tag_name,
        latest_published_at: res.release.published_at ? new Date(res.release.published_at) : null,
        latest_asset: asset
          ? JSON.stringify({ name: asset.name, size: asset.size, digest: asset.digest ?? null, url: asset.browser_download_url } satisfies Asset)
          : null,
        // Without a web zip, don't remember the ETag – the release pipeline may still be uploading it
        latest_etag: asset ? res.etag : null,
      });
    }
    app.last_error = null;
    await this.db.query(
      `UPDATE apps SET latest_tag = ?, latest_published_at = ?, latest_asset = ?, latest_etag = ?,
         checked_at = CURRENT_TIMESTAMP(3), last_error = NULL WHERE id = ?`,
      [app.latest_tag, app.latest_published_at, app.latest_asset, app.latest_etag, app.id],
    );
  }

  private async announce(apps: AppRow[], firstRun: boolean, autoInstall: boolean): Promise<void> {
    for (const app of apps) await this.event('available', `Neu verfügbar: ${version(app.latest_tag)}`, app.id);
    const action = autoInstall ? 'wird automatisch installiert' : 'kann installiert werden';
    // On the very first run (or with many at once) one summary message instead of a flood
    if (firstRun || apps.length > 3) {
      const list = apps.map((a) => `- **${a.name}** ${version(a.latest_tag)}`).join('\n');
      const all = autoInstall ? 'Alle werden automatisch installiert.' : 'Alle können installiert werden.';
      await this.notify('notifyNewApps', `${apps.length} Craft-Apps verfügbar`, `${list}\n\n${all}`, 5);
    } else {
      for (const a of apps) {
        const about = a.description ? `\n\n${a.description}` : '';
        await this.notify('notifyNewApps', `Neue App: ${a.name}`, `**${a.name}** ${version(a.latest_tag)} ${action}.${about}`, 5);
      }
    }
  }

  // ------------------------------------------------------------ Actions

  /** Triggers an action from the UI. */
  async request(kind: JobKind, appId: string, username: string): Promise<JobView> {
    const app = await this.app(appId);
    if (!app) throw new NotFoundError('Unbekannte App');
    if (kind !== 'install' && !this.isInstalled(app)) throw new ConflictError(`${app.name} ist nicht installiert`);
    return this.enqueue(kind, app.id, username);
  }

  private enqueue(kind: JobKind, appId: string, username: string | null): JobView {
    const active = this.activeJob(appId);
    if (active) {
      if (active.kind === kind) return this.jobView(active);
      throw new ConflictError('Für diese App läuft gerade schon eine andere Aktion');
    }
    const job: Job = { id: this.nextJobId++, appId, kind, state: 'queued', phase: 'Wartet', progress: null, error: null, username, finishedAt: null };
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
      if (!app) throw new Error('Unbekannte App');
      if (job.kind === 'uninstall') await this.uninstall(app, job.username);
      else await this.install(app, job, progress);
      job.state = 'done';
      progress('Fertig', 1);
    } catch (err) {
      job.state = 'failed';
      job.error = errorText(err);
      progress('Fehlgeschlagen', null);
      this.log.warn(`${job.appId}: ${KIND_LABEL[job.kind]} fehlgeschlagen: ${job.error}`);
      await this.event('error', `${KIND_LABEL[job.kind]} fehlgeschlagen: ${job.error}`, job.appId, job.username);
      await this.notify('notifyErrors', `${app?.name ?? job.appId}: ${KIND_LABEL[job.kind]} fehlgeschlagen`, job.error, 8);
    } finally {
      job.finishedAt = Date.now();
      await this.refreshOverview();
    }
  }

  /** Installs the latest version ("install" also reinstalls, "update" only if newer). */
  private async install(app: AppRow, job: Job, progress: OnProgress): Promise<void> {
    const fromTag = this.isInstalled(app) ? app.installed_tag : null;
    progress('Prüft Version', null);
    await this.refreshRelease(app);
    const asset = parseAsset(app.latest_asset);
    if (!asset || !app.latest_tag) throw new Error('Keine Web-Version verfügbar');
    if (job.kind === 'update' && fromTag === app.latest_tag) return; // already up to date by now

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
      const by = job.username ? ` (von ${job.username})` : ' (automatisch)';
      await this.event('updated', `Aktualisiert: ${version(fromTag)} → ${to}`, app.id, job.username);
      await this.notify('notifyUpdated', `${app.name} aktualisiert`, `**${version(fromTag)} → ${to}**${by}`, 4);
    } else {
      await this.event('installed', `${fromTag ? 'Neu installiert' : 'Installiert'}: ${to}`, app.id, job.username);
      if (!job.username) {
        await this.notify('notifyUpdated', `${app.name} installiert`, `Version **${to}** wurde automatisch installiert.`, 4);
      }
    }
  }

  private async uninstall(app: AppRow, username: string | null): Promise<void> {
    await fs.rm(appDir(this.cfg.dataDir, app.id), { recursive: true, force: true });
    await this.clearInstalled(app.id);
    await this.event('uninstalled', 'Deinstalliert', app.id, username);
  }

  async setAutoUpdate(appId: string, enabled: boolean, username: string): Promise<void> {
    const app = await this.app(appId);
    if (!app) throw new NotFoundError('Unbekannte App');
    await this.db.query('UPDATE apps SET auto_update = ? WHERE id = ?', [Number(enabled), appId]);
    await this.event('setting', `Automatische Updates ${enabled ? 'eingeschaltet' : 'ausgeschaltet'}`, appId, username);
    // If an update is already pending, apply it right away
    if (enabled && this.isInstalled(app) && parseAsset(app.latest_asset) && app.latest_tag !== app.installed_tag) {
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
      notificationsConfigured: Boolean(settings.gotifyUrl && settings.gotifyToken),
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
    const updatable = installed && asset !== null && app.latest_tag !== app.installed_tag;
    return {
      id: app.id,
      name: app.name,
      description: app.description,
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
      error: app.last_error,
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

  async event(kind: string, message: string, appId: string | null = null, username: string | null = null): Promise<void> {
    await this.db.query('INSERT INTO events (app_id, kind, message, username) VALUES (?, ?, ?, ?)', [
      appId,
      kind,
      message.slice(0, 1024),
      username,
    ]);
  }

  private async notify(category: NotifyCategory, title: string, message: string, priority: number): Promise<void> {
    const s = await this.settings.get();
    if (!s[category] || !s.gotifyUrl || !s.gotifyToken) return;
    try {
      await sendGotify(s.gotifyUrl, s.gotifyToken, { title, message, priority }, s.adminBaseUrl);
    } catch (err) {
      this.log.warn(`Benachrichtigung fehlgeschlagen: ${errorText(err)}`);
      await this.event('error', `Benachrichtigung fehlgeschlagen: ${errorText(err)}`);
    }
  }

  /** Logs and reports errors – each error only once, not again on every check. */
  private async failure(app: AppRow | null, message: string): Promise<void> {
    this.log.warn(app ? `${app.id}: ${message}` : message);
    if (app) {
      if (app.last_error === message) return;
      app.last_error = message;
      await this.db.query('UPDATE apps SET last_error = ?, checked_at = CURRENT_TIMESTAMP(3) WHERE id = ?', [
        message.slice(0, 1024),
        app.id,
      ]);
    } else {
      if (this.lastGlobalError === message) return;
      this.lastGlobalError = message;
    }
    await this.event('error', message, app?.id ?? null);
    await this.notify('notifyErrors', app ? `Fehler bei ${app.name}` : 'Craft Apps: Fehler', message, 8);
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
