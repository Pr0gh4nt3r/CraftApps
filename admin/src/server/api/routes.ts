import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { msg, parseMsg } from '../../shared/messages.js';
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

  app.get<{ Querystring: { limit?: number } }>(
    '/api/events',
    { schema: { querystring: { type: 'object', properties: { limit: { type: 'integer', minimum: 1, maximum: 1000 } } } } },
    async (req) => {
      const [rows] = await db.query<RowDataPacket[]>(
        `SELECT e.id, e.created_at, e.app_id, a.name AS app_name, a.color AS app_color, e.kind, e.message, e.msg, e.username
         FROM events e LEFT JOIN apps a ON a.id = e.app_id
         ORDER BY e.id DESC LIMIT ?`,
        [req.query.limit ?? 300],
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

  app.get('/api/settings', async () => settingsView(await settings.get(), cfg.githubToken));

  app.put<{ Body: SettingsUpdate }>(
    '/api/settings',
    {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            checkIntervalMinutes: { type: 'integer', minimum: 15, maximum: 10080 },
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
      if (next.checkIntervalMinutes !== before.checkIntervalMinutes) await manager.reschedule();
      await manager.event('setting', msg('event.settingsChanged'), null, req.user!.username);
      return settingsView(next, cfg.githubToken);
    },
  );

  app.get<{ Params: { id: string } }>('/api/icons/:id', { logLevel: 'warn' }, async (req, reply) => {
    if (!APP_ID.test(req.params.id)) return reply.code(404).send({ error: msg('error.notFound') });
    return reply
      .header('Cache-Control', 'private, max-age=86400')
      .sendFile(`${req.params.id}.png`, path.join(cfg.dataDir, 'icons'));
  });
}
