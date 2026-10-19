import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { msg, parseMsg, renderMsg, type Lang } from '../shared/messages.js';
import type { EventView, SettingsUpdate, SettingsView } from '../shared/types.js';
import type { Config } from './config.js';
import type { Manager } from './manager.js';
import { sendGotify } from './notify.js';
import type { Settings, SettingsStore } from './settings.js';
import { APP_ID, toMsg } from './util.js';

const URL_FIELD = { type: 'string', maxLength: 500, pattern: '^(https?://\\S+)?$' } as const;
const BOOL = { type: 'boolean' } as const;
const LANG = { type: 'string', enum: ['de', 'en'] } as const;

function settingsView({ gotifyToken, ...rest }: Settings): SettingsView {
  return { ...rest, gotifyTokenSet: gotifyToken !== '' };
}

export function registerRoutes(
  app: FastifyInstance,
  { manager, settings, db, cfg }: { manager: Manager; settings: SettingsStore; db: Pool; cfg: Config },
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

  app.get('/api/settings', async () => settingsView(await settings.get()));

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
            gotifyUrl: URL_FIELD,
            gotifyToken: { type: 'string', maxLength: 200 },
            notifyNewApps: BOOL,
            notifyUpdateAvailable: BOOL,
            notifyUpdated: BOOL,
            notifyErrors: BOOL,
            notifyLanguage: LANG,
          },
        },
      },
    },
    async (req) => {
      const before = await settings.get();
      const patch: Partial<Settings> = { ...req.body };
      if (!patch.gotifyToken) delete patch.gotifyToken; // empty = keep the stored token
      for (const key of ['appsBaseUrl', 'adminBaseUrl', 'gotifyUrl'] as const) {
        if (patch[key] !== undefined) patch[key] = patch[key].trim().replace(/\/+$/, '');
      }
      const next = await settings.update(patch);
      if (next.checkIntervalMinutes !== before.checkIntervalMinutes) await manager.reschedule();
      await manager.event('setting', msg('event.settingsChanged'), null, req.user!.username);
      return settingsView(next);
    },
  );

  // Test message – optionally with the not yet saved values from the form
  app.post<{ Body: { gotifyUrl?: string; gotifyToken?: string; notifyLanguage?: Lang } | undefined }>(
    '/api/settings/test-notification',
    async (req, reply) => {
      const current = await settings.get();
      const url = (req.body?.gotifyUrl ?? current.gotifyUrl).trim();
      const token = req.body?.gotifyToken || current.gotifyToken;
      const lang = req.body?.notifyLanguage === 'de' || req.body?.notifyLanguage === 'en' ? req.body.notifyLanguage : current.notifyLanguage;
      if (!/^https?:\/\/\S+$/.test(url) || !token) {
        return reply.code(400).send({ error: msg('error.gotifyMissing') });
      }
      try {
        const note = { title: renderMsg(lang, msg('notify.test.title')), message: renderMsg(lang, msg('notify.test.body')), priority: 5 };
        await sendGotify(url, token, note, current.adminBaseUrl);
        return { ok: true };
      } catch (err) {
        return reply.code(502).send({ error: toMsg(err) });
      }
    },
  );

  app.get<{ Params: { id: string } }>('/api/icons/:id', { logLevel: 'warn' }, async (req, reply) => {
    if (!APP_ID.test(req.params.id)) return reply.code(404).send({ error: msg('error.notFound') });
    return reply
      .header('Cache-Control', 'private, max-age=86400')
      .sendFile(`${req.params.id}.png`, path.join(cfg.dataDir, 'icons'));
  });
}
