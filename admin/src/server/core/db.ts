import type { FastifyBaseLogger } from 'fastify';
import mysql from 'mysql2/promise';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import type { DbConfig } from './config.js';
import { scheduleFromMinutes } from '../settings/settings.js';

const TABLE = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';

/** Gotify was a setting before there were channels – it becomes the channel "Gotify". */
async function gotifyToChannel(db: Pool): Promise<void> {
  const names = [
    'gotifyUrl',
    'gotifyToken',
    'notifyLanguage',
    'notifyNewApps',
    'notifyUpdateAvailable',
    'notifyUpdated',
    'notifyErrors',
  ];
  const [rows] = await db.query<RowDataPacket[]>('SELECT name, value FROM settings WHERE name IN (?)', [names]);
  const old = new Map(rows.map((r) => [r.name as string, JSON.parse(r.value as string) as unknown]));
  const [channels] = await db.query<RowDataPacket[]>('SELECT COUNT(*) AS n FROM notification_channels');
  if (old.get('gotifyUrl') && old.get('gotifyToken') && Number(channels[0].n) === 0) {
    const events = (
      [
        ['newApps', 'notifyNewApps'],
        ['updateAvailable', 'notifyUpdateAvailable'],
        ['updated', 'notifyUpdated'],
        ['errors', 'notifyErrors'],
      ] as const
    )
      .filter(([, setting]) => old.get(setting) !== false) // missing = the former default: on
      .map(([event]) => event);
    await db.query('INSERT INTO notification_channels (name, type, language, events, config) VALUES (?, ?, ?, ?, ?)', [
      'Gotify',
      'gotify',
      old.get('notifyLanguage') === 'en' ? 'en' : 'de',
      JSON.stringify(events),
      JSON.stringify({ url: old.get('gotifyUrl'), token: old.get('gotifyToken') }),
    ]);
  }
  await db.query('DELETE FROM settings WHERE name IN (?)', [names]);
}

/** The check interval in minutes becomes a schedule with fixed times. */
async function intervalToSchedule(db: Pool): Promise<void> {
  const [rows] = await db.query<RowDataPacket[]>("SELECT value FROM settings WHERE name = 'checkIntervalMinutes'");
  if (rows[0]) {
    const schedule = scheduleFromMinutes(Number(JSON.parse(rows[0].value as string)));
    await db.query('INSERT INTO settings (name, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)', [
      'checkSchedule',
      JSON.stringify(schedule),
    ]);
  }
  await db.query("DELETE FROM settings WHERE name = 'checkIntervalMinutes'");
}

/**
 * Adds a column unless it is there already. MySQL can't do ADD COLUMN IF NOT EXISTS, and a
 * schema change takes effect at once – after an aborted update the step runs again.
 */
function addColumn(table: string, column: string, definition: string): (db: Pool) => Promise<void> {
  return async (db) => {
    const [rows] = await db.query<RowDataPacket[]>(
      'SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
      [table, column],
    );
    if (!rows.length) await db.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
  };
}

// Each migration is a list of SQL statements or functions, run in order. Never change what an
// existing one does, only append new ones. Every step has to be repeatable: if a step fails, the
// migration isn't recorded and runs again from its first step on the next start – so tables
// with IF NOT EXISTS, columns with addColumn, data changes that find nothing to do a second time.
const MIGRATIONS: (string | ((db: Pool) => Promise<void>))[][] = [
  [
    `CREATE TABLE IF NOT EXISTS users (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(64) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      last_login_at DATETIME(3) NULL,
      UNIQUE KEY uq_users_username (username)
    ) ${TABLE}`,
    `CREATE TABLE IF NOT EXISTS sessions (
      id CHAR(64) NOT NULL PRIMARY KEY,
      user_id INT UNSIGNED NOT NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      expires_at DATETIME(3) NOT NULL,
      KEY ix_sessions_expires (expires_at),
      CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    ) ${TABLE}`,
    `CREATE TABLE IF NOT EXISTS apps (
      id VARCHAR(64) NOT NULL PRIMARY KEY,
      repo VARCHAR(128) NOT NULL,
      name VARCHAR(128) NOT NULL,
      description VARCHAR(512) NOT NULL DEFAULT '',
      color VARCHAR(32) NOT NULL DEFAULT '#64748b',
      sort_key INT NOT NULL DEFAULT 1000,
      in_catalog TINYINT(1) NOT NULL DEFAULT 1,
      latest_tag VARCHAR(64) NULL,
      latest_published_at DATETIME(3) NULL,
      latest_asset TEXT NULL,
      latest_etag VARCHAR(255) NULL,
      checked_at DATETIME(3) NULL,
      installed_tag VARCHAR(64) NULL,
      installed_published_at DATETIME(3) NULL,
      installed_at DATETIME(3) NULL,
      installed_files MEDIUMTEXT NULL,
      auto_update TINYINT(1) NOT NULL DEFAULT 1,
      last_error VARCHAR(1024) NULL,
      notified_tag VARCHAR(64) NULL,
      first_seen_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ) ${TABLE}`,
    `CREATE TABLE IF NOT EXISTS settings (
      name VARCHAR(64) NOT NULL PRIMARY KEY,
      value MEDIUMTEXT NOT NULL
    ) ${TABLE}`,
    `CREATE TABLE IF NOT EXISTS events (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      app_id VARCHAR(64) NULL,
      kind VARCHAR(32) NOT NULL,
      message VARCHAR(1024) NOT NULL,
      username VARCHAR(64) NULL,
      KEY ix_events_created (created_at)
    ) ${TABLE}`,
  ],
  // English descriptions; messages as JSON (key + parameters) so the UI can show them in its
  // language – events keep the German text in message, last_error holds the JSON itself
  [
    addColumn('apps', 'description_en', "VARCHAR(512) NOT NULL DEFAULT '' AFTER description"),
    'ALTER TABLE apps MODIFY last_error TEXT NULL',
    addColumn('events', 'msg', 'TEXT NULL AFTER message'),
  ],
  // Notification channels – settings and secrets as JSON, events as JSON array
  [
    `CREATE TABLE IF NOT EXISTS notification_channels (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(64) NOT NULL,
      type VARCHAR(16) NOT NULL,
      enabled TINYINT(1) NOT NULL DEFAULT 1,
      language CHAR(2) NOT NULL DEFAULT 'de',
      events VARCHAR(255) NOT NULL,
      config TEXT NOT NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      last_sent_at DATETIME(3) NULL,
      last_error TEXT NULL,
      UNIQUE KEY uq_notification_channels_name (name)
    ) ${TABLE}`,
    gotifyToChannel,
  ],
  // Update channels: the releases in question per app (newest stable one plus newer
  // pre-releases) – the list of releases has ETags of its own. Fixed check times instead of an
  // interval in minutes.
  [
    addColumn('apps', 'release_candidates', 'TEXT NULL AFTER latest_etag'),
    'UPDATE apps SET latest_etag = NULL',
    intervalToSchedule,
  ],
  // The view of the activity log a user saved – NULL follows the default from the settings
  [addColumn('users', 'activity_view', 'TEXT NULL')],
];

export async function connectDb(cfg: DbConfig, log: FastifyBaseLogger): Promise<Pool> {
  const pool = mysql.createPool({ ...cfg, connectionLimit: 5, timezone: 'Z', charset: 'UTF8MB4_UNICODE_CI' });
  // All timestamps in UTC – including those MySQL sets itself (CURRENT_TIMESTAMP)
  pool.on('connection', (conn) => void conn.query("SET time_zone = '+00:00'"));
  // When everything starts at once, MySQL often isn't ready yet
  for (let attempt = 1; ; attempt++) {
    try {
      await pool.query('SELECT 1');
      return pool;
    } catch (err) {
      if (attempt === 30) throw err;
      log.warn(`MySQL noch nicht erreichbar (${(err as Error).message}), neuer Versuch in 2 s`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}

// One migration run at a time, even with several instances on the same database
const LOCK = 'craftapps_migrate';
// How long a second instance waits for the first one – long enough for a big events table
const LOCK_SECONDS = 600;

/** Brings the schema up to date: the missing migrations in order, under a lock in MySQL. */
export async function migrate(pool: Pool, log: FastifyBaseLogger): Promise<void> {
  // A lock belongs to a connection: this one holds it until the end – MySQL drops it by itself
  // if the connection breaks off, e.g. because the container stops
  const conn = await pool.getConnection();
  try {
    const [locked] = await conn.query<RowDataPacket[]>('SELECT GET_LOCK(?, ?) AS ok', [LOCK, LOCK_SECONDS]);
    if (Number(locked[0].ok) !== 1) {
      throw new Error(`Datenbank: keine Sperre für die Migration nach ${LOCK_SECONDS} s – läuft eine andere Instanz?`);
    }
    await conn.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version INT NOT NULL PRIMARY KEY,
      applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ) ${TABLE}`);
    // Only now: another instance may have migrated while this one waited for the lock
    const [rows] = await conn.query<RowDataPacket[]>('SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations');
    for (let v = Number(rows[0].version); v < MIGRATIONS.length; v++) {
      try {
        for (const step of MIGRATIONS[v]) await (typeof step === 'string' ? pool.query(step) : step(pool));
      } catch (err) {
        throw new Error(
          `Datenbank: Migration ${v + 1} fehlgeschlagen, beim nächsten Start geht es dort weiter – ${(err as Error).message}`,
          { cause: err },
        );
      }
      await conn.query('INSERT INTO schema_migrations (version) VALUES (?)', [v + 1]);
      log.info(`Datenbank: Migration ${v + 1} ausgeführt`);
    }
  } finally {
    await conn.query('SELECT RELEASE_LOCK(?)', [LOCK]).catch(() => undefined);
    conn.release();
  }
}
