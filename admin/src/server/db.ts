import type { FastifyBaseLogger } from 'fastify';
import mysql from 'mysql2/promise';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import type { DbConfig } from './config.js';

const TABLE = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';

// Each migration is a list of SQL statements. Never change existing ones, only append new ones.
const MIGRATIONS: string[][] = [
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

export async function migrate(pool: Pool): Promise<void> {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INT NOT NULL PRIMARY KEY,
    applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
  ) ${TABLE}`);
  const [rows] = await pool.query<RowDataPacket[]>('SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations');
  for (let v = Number(rows[0].version); v < MIGRATIONS.length; v++) {
    for (const sql of MIGRATIONS[v]) await pool.query(sql);
    await pool.query('INSERT INTO schema_migrations (version) VALUES (?)', [v + 1]);
  }
}
