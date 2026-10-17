import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import type { FastifyBaseLogger, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import type { MeView, UserView } from '../shared/types.js';
import type { Config } from './config.js';

declare module 'fastify' {
  interface FastifyRequest {
    user: MeView | null;
  }
}

const SESSION_COOKIE = 'craftapps_session';
const SESSION_DAYS = 30;
const MIN_PASSWORD = 10;
// scrypt as recommended by OWASP (N=2^15, r=8, p=3): ~32 MiB of memory per login
const SCRYPT = { N: 2 ** 15, r: 8, p: 3 };
const SCRYPT_MAXMEM = 64 * 1024 * 1024;
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const USERNAME = /^[A-Za-z0-9._-]{3,64}$/;

function scrypt(password: string, salt: Buffer, keylen: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scryptCallback(password, salt, keylen, options, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 64, { ...SCRYPT, maxmem: SCRYPT_MAXMEM });
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), hash.toString('base64')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algorithm, n, r, p, salt, hash] = stored.split('$');
  if (algorithm !== 'scrypt' || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const options = { N: Number(n), r: Number(r), p: Number(p), maxmem: SCRYPT_MAXMEM };
  const actual = await scrypt(password, Buffer.from(salt, 'base64'), expected.length, options);
  return timingSafeEqual(actual, expected);
}

// Hash anyway for unknown usernames so the response time gives nothing away
let dummyHash: Promise<string> | undefined;

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

function cookieOptions(req: FastifyRequest) {
  return {
    path: '/',
    httpOnly: true,
    sameSite: 'strict' as const,
    // Behind a reverse proxy https arrives via X-Forwarded-Proto; locally plain http works too
    secure: req.protocol === 'https',
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  };
}

function validPassword(password: string): string | null {
  return password.length >= MIN_PASSWORD ? null : `Das Passwort muss mindestens ${MIN_PASSWORD} Zeichen haben`;
}

export async function ensureInitialAdmin(db: Pool, initial: Config['initialAdmin'], log: FastifyBaseLogger): Promise<void> {
  const [rows] = await db.query<RowDataPacket[]>('SELECT COUNT(*) AS n FROM users');
  if (Number(rows[0].n) > 0) return;
  if (!initial) {
    log.warn('Noch kein Benutzer vorhanden – INITIAL_ADMIN_USER und INITIAL_ADMIN_PASSWORD setzen und neu starten');
    return;
  }
  await db.query('INSERT INTO users (username, password_hash) VALUES (?, ?)', [
    initial.username,
    await hashPassword(initial.password),
  ]);
  log.info(`Benutzer ${initial.username} angelegt`);
}

/**
 * For all /api routes: modifying requests must carry this header. Other sites can't send it
 * without a CORS grant (protection against CSRF).
 */
export async function csrfGuard(req: FastifyRequest, reply: FastifyReply) {
  if (!SAFE_METHODS.has(req.method) && req.headers['x-requested-with'] !== 'craftapps') {
    return reply.code(403).send({ error: 'Anfrage abgelehnt' });
  }
}

/** Hook for all protected routes. Attached to the routes themselves, not to the URL. */
export function sessionGuard(db: Pool) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const token = req.cookies[SESSION_COOKIE];
    if (token) {
      const [rows] = await db.query<RowDataPacket[]>(
        `SELECT u.id, u.username FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.id = ? AND s.expires_at > CURRENT_TIMESTAMP(3)`,
        [sha256(token)],
      );
      if (rows[0]) req.user = { id: Number(rows[0].id), username: rows[0].username as string };
    }
    if (!req.user) return reply.code(401).send({ error: 'Nicht angemeldet' });
  };
}

/** Login – the only /api route without a session. */
export function registerLogin(app: FastifyInstance, db: Pool): void {
  app.post<{ Body: { username: string; password: string } }>(
    '/api/auth/login',
    {
      config: { rateLimit: { max: 10, timeWindow: '15 minutes' } },
      schema: {
        body: {
          type: 'object',
          required: ['username', 'password'],
          properties: {
            username: { type: 'string', minLength: 1, maxLength: 64 },
            password: { type: 'string', minLength: 1, maxLength: 200 },
          },
        },
      },
    },
    async (req, reply) => {
      const [rows] = await db.query<RowDataPacket[]>('SELECT id, username, password_hash FROM users WHERE username = ?', [
        req.body.username,
      ]);
      const user = rows[0];
      dummyHash ??= hashPassword(randomBytes(16).toString('hex'));
      const ok = await verifyPassword(req.body.password, user ? (user.password_hash as string) : await dummyHash);
      if (!user || !ok) {
        req.log.warn(`Fehlgeschlagene Anmeldung für "${req.body.username}" von ${req.ip}`);
        return reply.code(401).send({ error: 'Benutzername oder Passwort falsch' });
      }
      const token = randomBytes(32).toString('base64url');
      await db.query('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)', [
        sha256(token),
        user.id,
        new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000),
      ]);
      await db.query('UPDATE users SET last_login_at = CURRENT_TIMESTAMP(3) WHERE id = ?', [user.id]);
      reply.setCookie(SESSION_COOKIE, token, cookieOptions(req));
      return { id: Number(user.id), username: user.username as string } satisfies MeView;
    },
  );
}

/** Account and user management (logged in only). */
export function registerAccount(app: FastifyInstance, db: Pool): void {
  app.post('/api/auth/logout', async (req, reply) => {
    const token = req.cookies[SESSION_COOKIE];
    if (token) await db.query('DELETE FROM sessions WHERE id = ?', [sha256(token)]);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get('/api/auth/me', async (req) => req.user);

  app.post<{ Body: { current: string; next: string } }>(
    '/api/auth/password',
    {
      schema: {
        body: {
          type: 'object',
          required: ['current', 'next'],
          properties: { current: { type: 'string', maxLength: 200 }, next: { type: 'string', maxLength: 200 } },
        },
      },
    },
    async (req, reply) => {
      const user = req.user!;
      const problem = validPassword(req.body.next);
      if (problem) return reply.code(400).send({ error: problem });
      const [rows] = await db.query<RowDataPacket[]>('SELECT password_hash FROM users WHERE id = ?', [user.id]);
      if (!rows[0] || !(await verifyPassword(req.body.current, rows[0].password_hash as string))) {
        return reply.code(400).send({ error: 'Das aktuelle Passwort stimmt nicht' });
      }
      await db.query('UPDATE users SET password_hash = ? WHERE id = ?', [await hashPassword(req.body.next), user.id]);
      // End all other sessions of this user
      await db.query('DELETE FROM sessions WHERE user_id = ? AND id <> ?', [
        user.id,
        sha256(req.cookies[SESSION_COOKIE] ?? ''),
      ]);
      return { ok: true };
    },
  );

  app.get('/api/users', async () => {
    const [rows] = await db.query<RowDataPacket[]>(
      'SELECT id, username, created_at, last_login_at FROM users ORDER BY username',
    );
    return rows.map(
      (r): UserView => ({
        id: Number(r.id),
        username: r.username as string,
        createdAt: (r.created_at as Date).toISOString(),
        lastLoginAt: r.last_login_at ? (r.last_login_at as Date).toISOString() : null,
      }),
    );
  });

  app.post<{ Body: { username: string; password: string } }>(
    '/api/users',
    {
      schema: {
        body: {
          type: 'object',
          required: ['username', 'password'],
          properties: { username: { type: 'string', maxLength: 64 }, password: { type: 'string', maxLength: 200 } },
        },
      },
    },
    async (req, reply) => {
      const username = req.body.username.trim();
      if (!USERNAME.test(username)) {
        return reply.code(400).send({ error: 'Benutzername: 3–64 Zeichen, nur Buchstaben, Ziffern, . _ -' });
      }
      const problem = validPassword(req.body.password);
      if (problem) return reply.code(400).send({ error: problem });
      try {
        await db.query('INSERT INTO users (username, password_hash) VALUES (?, ?)', [
          username,
          await hashPassword(req.body.password),
        ]);
      } catch (err) {
        if ((err as { code?: string }).code === 'ER_DUP_ENTRY') {
          return reply.code(409).send({ error: 'Diesen Benutzernamen gibt es schon' });
        }
        throw err;
      }
      return { ok: true };
    },
  );

  app.delete<{ Params: { id: string } }>('/api/users/:id', async (req, reply) => {
    const id = Number(req.params.id);
    if (id === req.user!.id) return reply.code(400).send({ error: 'Du kannst dich nicht selbst löschen' });
    await db.query('DELETE FROM users WHERE id = ?', [id]);
    return { ok: true };
  });
}
