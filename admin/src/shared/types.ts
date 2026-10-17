// Gemeinsame Typen für Server und Oberfläche (nur Typen, kein Laufzeitcode)

export type AppStatus = 'not-installed' | 'installed' | 'update-available';
export type JobKind = 'install' | 'update' | 'uninstall';
export type JobState = 'queued' | 'running' | 'done' | 'failed';

export interface JobView {
  id: number;
  appId: string;
  kind: JobKind;
  state: JobState;
  phase: string;
  /** 0..1, null = Fortschritt unbekannt */
  progress: number | null;
  error: string | null;
}

export interface AppView {
  id: string;
  name: string;
  description: string;
  color: string;
  hasIcon: boolean;
  websiteUrl: string;
  repoUrl: string;
  status: AppStatus;
  installedVersion: string | null;
  installedPublishedAt: string | null;
  latestVersion: string | null;
  latestPublishedAt: string | null;
  latestSize: number | null;
  autoUpdate: boolean;
  /** Fehler bei der letzten Prüfung */
  error: string | null;
  /** Öffentliche Adresse der App, sofern in den Einstellungen hinterlegt */
  openUrl: string | null;
  /** Laufende oder kürzlich fehlgeschlagene Aktion */
  job: JobView | null;
}

export interface StateView {
  apps: AppView[];
  checking: boolean;
  lastCheckAt: string | null;
  nextCheckAt: string | null;
  github: { remaining: number | null; limit: number | null; resetAt: string | null };
  notificationsConfigured: boolean;
  warnings: string[];
}

export interface EventView {
  id: number;
  at: string;
  appId: string | null;
  appName: string | null;
  appColor: string | null;
  kind: string;
  message: string;
  username: string | null;
}

export interface SettingsView {
  checkIntervalMinutes: number;
  autoInstallNew: boolean;
  defaultAutoUpdate: boolean;
  appsBaseUrl: string;
  adminBaseUrl: string;
  gotifyUrl: string;
  gotifyTokenSet: boolean;
  notifyNewApps: boolean;
  notifyUpdateAvailable: boolean;
  notifyUpdated: boolean;
  notifyErrors: boolean;
}

/** Leeres gotifyToken = unverändert lassen */
export type SettingsUpdate = Partial<Omit<SettingsView, 'gotifyTokenSet'>> & { gotifyToken?: string };

export interface MeView {
  id: number;
  username: string;
}

export interface UserView {
  id: number;
  username: string;
  createdAt: string;
  lastLoginAt: string | null;
}
