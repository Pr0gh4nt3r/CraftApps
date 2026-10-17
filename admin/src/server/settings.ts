import type { Pool, RowDataPacket } from 'mysql2/promise';

export interface Settings {
  checkIntervalMinutes: number;
  autoInstallNew: boolean;
  defaultAutoUpdate: boolean;
  /** Öffentliche Adresse des nginx mit den Apps, z.B. https://craft.example.com */
  appsBaseUrl: string;
  /** Adresse dieser Verwaltung – Ziel beim Antippen einer Benachrichtigung */
  adminBaseUrl: string;
  gotifyUrl: string;
  gotifyToken: string;
  notifyNewApps: boolean;
  notifyUpdateAvailable: boolean;
  notifyUpdated: boolean;
  notifyErrors: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  checkIntervalMinutes: 360,
  autoInstallNew: false,
  defaultAutoUpdate: true,
  appsBaseUrl: '',
  adminBaseUrl: '',
  gotifyUrl: '',
  gotifyToken: '',
  notifyNewApps: true,
  notifyUpdateAvailable: true,
  notifyUpdated: true,
  notifyErrors: true,
};

const UPSERT = 'INSERT INTO settings (name, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)';

/** Einstellungen aus der Oberfläche plus interne Werte (Name mit "_" davor), als JSON in MySQL. */
export class SettingsStore {
  private cache: Settings | null = null;

  constructor(private readonly db: Pool) {}

  async get(): Promise<Settings> {
    if (!this.cache) {
      const [rows] = await this.db.query<RowDataPacket[]>('SELECT name, value FROM settings');
      const stored = new Map(rows.map((r) => [r.name as string, JSON.parse(r.value as string) as unknown]));
      const merged: Record<string, unknown> = { ...DEFAULT_SETTINGS };
      for (const [key, fallback] of Object.entries(DEFAULT_SETTINGS)) {
        const value = stored.get(key);
        if (typeof value === typeof fallback) merged[key] = value;
      }
      this.cache = merged as unknown as Settings;
    }
    return this.cache;
  }

  async update(patch: Partial<Settings>): Promise<Settings> {
    const next = { ...(await this.get()), ...patch };
    for (const [name, value] of Object.entries(patch)) {
      await this.db.query(UPSERT, [name, JSON.stringify(value)]);
    }
    this.cache = next;
    return next;
  }

  async getInternal<T>(name: string): Promise<T | undefined> {
    const [rows] = await this.db.query<RowDataPacket[]>('SELECT value FROM settings WHERE name = ?', [`_${name}`]);
    return rows[0] ? (JSON.parse(rows[0].value as string) as T) : undefined;
  }

  async setInternal(name: string, value: unknown): Promise<void> {
    await this.db.query(UPSERT, [`_${name}`, JSON.stringify(value)]);
  }
}
