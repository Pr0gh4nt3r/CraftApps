import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { msg, parseMsg } from '../../shared/messages.js';
import {
  ACTIVITY_COLUMNS,
  ACTIVITY_GROUP_IDS,
  normalizeView,
  sameView,
  type ActivityView,
  type ActivityViewState,
} from '../../shared/activity.js';
import { CHECK_INTERVALS, prepareSchedule, scheduleProblem } from '../../shared/schedule.js';
import type { EventView, SettingsUpdate } from '../../shared/types.js';
import type { Config } from '../core/config.js';
import { GitHubTokenError, type GitHub } from '../apps/github.js';
import type { Manager } from '../apps/manager.js';
import { settingsView, type Settings, type SettingsStore } from '../settings/settings.js';
import { APP_ID, toMsg } from '../core/util.js';

const URL_FIELD = { type: 'string', maxLength: 500, pattern: '^(https?://\\S+)?$' } as const;
const BOOL = { type: 'boolean' } as const;
// Ends up in an HTTP header – printable ASCII only; null removes the saved token
const TOKEN = { type: ['string', 'null'], maxLength: 255, pattern: '^[\\x21-\\x7E]+$' } as const;
// The rest – time zone, gaps between checks – is checked by scheduleProblem; the server keeps or
// sets the anchor itself
const SCHEDULE = {
  type: 'object',
  additionalProperties: false,
  required: ['interval', 'times', 'weekdays', 'monthDay', 'timeZone'],
  properties: {
    interval: { type: 'string', enum: CHECK_INTERVALS },
    // An empty time stands for the current one
    times: { type: 'array', minItems: 1, maxItems: 48, items: { type: 'string', pattern: '^(([01]\\d|2[0-3]):[0-5]\\d)?$' } },
    weekdays: { type: 'array', maxItems: 7, items: { type: 'integer', minimum: 1, maximum: 7 } },
    monthDay: { type: 'integer', minimum: 1, maximum: 31 },
    timeZone: { type: 'string', minLength: 1, maxLength: 64 },
    anchor: { type: ['string', 'null'] },
  },
} as const;

// Groups and columns of the activity log; minGroups 1 for the default, 0 for an own view
const activityView = (minGroups: number) =>
  ({
    type: 'object',
    additionalProperties: false,
    required: ['groups', 'columns'],
    properties: {
      groups: { type: 'array', minItems: minGroups, maxItems: 20, items: { type: 'string', enum: ACTIVITY_GROUP_IDS } },
      columns: { type: 'array', minItems: 1, maxItems: 20, items: { type: 'string', enum: ACTIVITY_COLUMNS } },
    },
  }) as const;

export function registerRoutes(
  app: FastifyInstance,
  { manager, settings, github, db, cfg }: { manager: Manager; settings: SettingsStore; github: GitHub; db: Pool; cfg: Config },
): void {
  // The UI polls the state every few seconds – don't write each request to the log
  app.get('/api/state', { logLevel: 'warn' }, () => manager.state());

  app.post('/api/check', async (req, reply) => {
    void manager.check(req.user!.username);
    return reply.code(202).send({ ok: true });
  });

  for (const kind of ['install', 'update', 'uninstall'] as const) {
    app.post<{ Params: { id: string } }>(`/api/apps/:id/${kind}`, (req) =>
      manager.request(kind, req.params.id, req.user!.username),
    );
  }

  app.patch<{ Params: { id: string }; Body: { autoUpdate: boolean } }>(
    '/api/apps/:id',
    { schema: { body: { type: 'object', required: ['autoUpdate'], properties: { autoUpdate: BOOL } } } },
    async (req) => {
      await manager.setAutoUpdate(req.params.id, req.body.autoUpdate, req.user!.username);
      return { ok: true };
    },
  );

  // Newest first, page by page: before = the id of the oldest entry so far; kinds filters, e.g.
  // "installed,updated"
  app.get<{ Querystring: { limit?: number; before?: number; kinds?: string } }>(
    '/api/events',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'integer', minimum: 1, maximum: 1000 },
            before: { type: 'integer', minimum: 1 },
            kinds: { type: 'string', maxLength: 255, pattern: '^[a-z-]+(,[a-z-]+)*$' },
          },
        },
      },
    },
    async (req) => {
      const where: string[] = [];
      const params: unknown[] = [];
      if (req.query.before) {
        where.push('e.id < ?');
        params.push(req.query.before);
      }
      if (req.query.kinds) {
        where.push('e.kind IN (?)');
        params.push(req.query.kinds.split(','));
      }
      const [rows] = await db.query<RowDataPacket[]>(
        `SELECT e.id, e.created_at, e.app_id, a.name AS app_name, a.color AS app_color, e.kind, e.message, e.msg, e.username
         FROM events e LEFT JOIN apps a ON a.id = e.app_id
         ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
         ORDER BY e.id DESC LIMIT ?`,
        [...params, req.query.limit ?? 200],
      );
      return rows.map(
        (r): EventView => ({
          id: Number(r.id),
          at: (r.created_at as Date).toISOString(),
          appId: r.app_id as string | null,
          appName: r.app_name as string | null,
          appColor: r.app_color as string | null,
          kind: r.kind as string,
          // Entries from before the localization only have the German text
          message: parseMsg(r.msg as string | null) ?? msg('raw', { text: r.message as string }),
          username: r.username as string | null,
        }),
      );
    },
  );

  app.get('/api/settings', async () => settingsView(await settings.get(), cfg.githubToken, await manager.releaseChannels()));

  app.put<{ Body: SettingsUpdate }>(
    '/api/settings',
    {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            checkSchedule: SCHEDULE,
            updateChannel: { type: 'string', pattern: '^[a-z]{1,20}$' },
            activityView: activityView(1),
            autoInstallNew: BOOL,
            defaultAutoUpdate: BOOL,
            appsBaseUrl: URL_FIELD,
            adminBaseUrl: URL_FIELD,
            githubToken: TOKEN,
          },
        },
      },
    },
    async (req, reply) => {
      const before = await settings.get();
      const { githubToken, ...rest } = req.body;
      const patch: Partial<Settings> = rest;
      for (const key of ['appsBaseUrl', 'adminBaseUrl'] as const) {
        if (patch[key] !== undefined) patch[key] = patch[key].trim().replace(/\/+$/, '');
      }
      if (patch.activityView) patch.activityView = normalizeView(patch.activityView, 1) ?? before.activityView;
      if (patch.checkSchedule) {
        const keepAnchor = before.checkSchedule.interval === '2w' ? before.checkSchedule.anchor : null;
        patch.checkSchedule = prepareSchedule(patch.checkSchedule, keepAnchor);
        const problem = scheduleProblem(patch.checkSchedule);
        if (problem) return reply.code(400).send({ error: problem });
      }
      if (githubToken) {
        try {
          await github.verifyToken(githubToken);
        } catch (err) {
          // Nothing is saved: GitHub rejects the token or can't be reached right now
          return reply.code(err instanceof GitHubTokenError ? 400 : 502).send({ error: toMsg(err) });
        }
      }
      // null removes the saved token – then GITHUB_TOKEN applies again, if set
      if (githubToken !== undefined) patch.githubToken = githubToken ?? '';
      const next = await settings.update(patch);
      if (JSON.stringify(next.checkSchedule) !== JSON.stringify(before.checkSchedule)) await manager.reschedule();
      // Another channel: check right away, so the apps show what it brings – the releases are
      // mostly known already, GitHub answers "304 Not Modified"
      if (next.updateChannel !== before.updateChannel) void manager.check(req.user!.username);
      // The activity log names what changed – saving without a change leaves no entry
      const changed = (Object.keys(next) as (keyof Settings)[]).filter(
        (key) => JSON.stringify(next[key]) !== JSON.stringify(before[key]),
      );
      if (changed.length) {
        const fields = changed.map((key) => msg(`setting.${key}`));
        await manager.event('setting', msg('event.settingsChangedFields', { fields }), null, req.user!.username);
      }
      return settingsView(next, cfg.githubToken, await manager.releaseChannels());
    },
  );

  // The view of the activity log: the default from the settings and the one the user saved
  const ownView = async (userId: number): Promise<ActivityView | null> => {
    const [rows] = await db.query<RowDataPacket[]>('SELECT activity_view FROM users WHERE id = ?', [userId]);
    const stored = rows[0]?.activity_view as string | null | undefined;
    return stored ? normalizeView(JSON.parse(stored)) : null;
  };

  app.get('/api/activity/view', async (req): Promise<ActivityViewState> => ({
    default: (await settings.get()).activityView,
    own: await ownView(req.user!.id),
  }));

  // null goes back to the default; a view equal to the default does the same, so the user
  // follows it when it changes later. A display preference – no activity log entry.
  app.put<{ Body: { view: ActivityView | null } }>(
    '/api/activity/view',
    {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['view'],
          properties: { view: { anyOf: [{ type: 'null' }, activityView(0)] } },
        },
      },
    },
    async (req): Promise<ActivityViewState> => {
      const fallback = (await settings.get()).activityView;
      let own = req.body.view && normalizeView(req.body.view);
      if (own && sameView(own, fallback)) own = null;
      await db.query('UPDATE users SET activity_view = ? WHERE id = ?', [own && JSON.stringify(own), req.user!.id]);
      return { default: fallback, own };
    },
  );

  app.get<{ Params: { id: string } }>('/api/icons/:id', { logLevel: 'warn' }, async (req, reply) => {
    if (!APP_ID.test(req.params.id)) return reply.code(404).send({ error: msg('error.notFound') });
    return reply
      .header('Cache-Control', 'private, max-age=86400')
      .sendFile(`${req.params.id}.png`, path.join(cfg.dataDir, 'icons'));
  });
}
