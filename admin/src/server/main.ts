import path from 'node:path';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import { csrfGuard, ensureInitialAdmin, registerAccount, registerLogin, sessionGuard } from './auth.js';
import { loadConfig } from './config.js';
import { connectDb, migrate } from './db.js';
import { GitHub } from './github.js';
import { Manager } from './manager.js';
import { registerRoutes } from './routes.js';
import { SettingsStore } from './settings.js';

const cfg = loadConfig();
const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' }, trustProxy: cfg.trustProxy });

const db = await connectDb(cfg.db, app.log);
await migrate(db);
await ensureInitialAdmin(db, cfg.initialAdmin, app.log);
const settings = new SettingsStore(db);
const manager = new Manager(db, cfg, settings, new GitHub(cfg.githubToken), app.log);

await app.register(helmet, {
  hsts: false, // übernimmt der Reverse Proxy
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      'img-src': ["'self'", 'data:'],
      'style-src': ["'self'", "'unsafe-inline'"],
      'upgrade-insecure-requests': null, // im LAN ist die Verwaltung auch per http erreichbar
    },
  },
});
await app.register(cookie);
await app.register(rateLimit, {
  global: false,
  errorResponseBuilder: () => ({
    statusCode: 429,
    error: 'Too Many Requests',
    message: 'Zu viele Versuche – bitte in ein paar Minuten noch einmal',
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

app.setErrorHandler((err: { statusCode?: number; message: string }, req, reply) => {
  const status = typeof err.statusCode === 'number' && err.statusCode >= 400 ? err.statusCode : 500;
  if (status >= 500) req.log.error(err);
  return reply.code(status).send({ error: status >= 500 ? 'Interner Fehler' : err.message });
});
app.setNotFoundHandler((req, reply) =>
  req.url.startsWith('/api/')
    ? reply.code(404).send({ error: 'Nicht gefunden' })
    : reply.header('Cache-Control', 'no-cache').sendFile('index.html'),
);

app.get('/healthz', { logLevel: 'warn' }, async () => ({ ok: true }));
app.decorateRequest('user', null);
// Die Hooks gelten nur für die Routen in diesen gekapselten Plugins – unabhängig davon, wie die
// URL geschrieben oder kodiert ist
await app.register(async (api) => {
  api.addHook('onRequest', csrfGuard);
  registerLogin(api, db);
  await api.register(async (secured) => {
    secured.addHook('onRequest', sessionGuard(db));
    registerAccount(secured, db);
    registerRoutes(secured, { manager, settings, db, cfg });
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
