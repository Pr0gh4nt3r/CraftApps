import path from 'node:path';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import { csrfGuard, ensureInitialAdmin, registerAccount, registerLogin, sessionGuard } from './auth/auth.js';
import { msg, renderMsg, type Msg } from '../shared/messages.js';
import { loadConfig } from './core/config.js';
import { connectDb, migrate } from './core/db.js';
import { GitHub } from './apps/github.js';
import { Manager } from './apps/manager.js';
import { registerChannelRoutes } from './api/channels.js';
import { registerRoutes } from './api/routes.js';
import { ChannelStore } from './notify/channels.js';
import { Notifier } from './notify/notify.js';
import { SettingsStore } from './settings/settings.js';

const cfg = loadConfig();
const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' }, trustProxy: cfg.trustProxy });

const db = await connectDb(cfg.db, app.log);
await migrate(db);
await ensureInitialAdmin(db, cfg.initialAdmin, app.log);
const settings = new SettingsStore(db);
const channels = new ChannelStore(db);
const notifier = new Notifier(channels, settings);
const manager = new Manager(db, cfg, settings, notifier, new GitHub(cfg.githubToken), app.log);

await app.register(helmet, {
  hsts: false, // left to the reverse proxy
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      'img-src': ["'self'", 'data:'],
      'style-src': ["'self'", "'unsafe-inline'"],
      'upgrade-insecure-requests': null, // the admin is also reachable via plain http locally
    },
  },
});
await app.register(cookie);
await app.register(rateLimit, {
  global: false,
  errorResponseBuilder: () => ({
    statusCode: 429,
    error: 'Too Many Requests',
    message: renderMsg('de', msg('error.tooManyAttempts')),
    msg: msg('error.tooManyAttempts'),
  }),
});
await app.register(fastifyStatic, {
  root: cfg.webDir,
  wildcard: false,
  setHeaders: (reply, file) =>
    reply.header(
      'Cache-Control',
      file.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache',
    ),
});

// Errors go to the UI as a message it shows in its language (validation errors as plain text)
app.setErrorHandler((err: { statusCode?: number; message: string; msg?: Msg }, req, reply) => {
  const status = typeof err.statusCode === 'number' && err.statusCode >= 400 ? err.statusCode : 500;
  if (status >= 500) req.log.error(err);
  const error = status >= 500 ? msg('error.internal') : (err.msg ?? msg('raw', { text: err.message }));
  return reply.code(status).send({ error });
});
app.setNotFoundHandler((req, reply) =>
  req.url.startsWith('/api/')
    ? reply.code(404).send({ error: msg('error.notFound') })
    : reply.header('Cache-Control', 'no-cache').sendFile('index.html'),
);

app.get('/healthz', { logLevel: 'warn' }, async () => ({ ok: true }));
app.decorateRequest('user', null);
// The hooks only apply to the routes in these encapsulated plugins – no matter how the
// URL is spelled or encoded
await app.register(async (api) => {
  api.addHook('onRequest', csrfGuard);
  registerLogin(api, db);
  await api.register(async (secured) => {
    secured.addHook('onRequest', sessionGuard(db));
    registerAccount(secured, db);
    registerRoutes(secured, { manager, settings, db, cfg });
    registerChannelRoutes(secured, { channels, notifier, manager });
  });
});

await manager.init();
manager.start();
await app.listen({ host: '0.0.0.0', port: cfg.port });

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, async () => {
    manager.stop();
    await app.close();
    await db.end();
    process.exit(0);
  });
}
