// Shared types for server and UI (types only, no runtime code)

import type { ChannelType, ChannelValues, NotifyEvent } from './channels.js';
import type { Lang, Msg } from './messages.js';

export type AppStatus = 'not-installed' | 'installed' | 'update-available';
export type JobKind = 'install' | 'update' | 'uninstall';
export type JobState = 'queued' | 'running' | 'done' | 'failed';
/** Progress step of a job – the UI shows it via the message key phase.<step> */
export type JobPhase = 'queued' | 'checking' | 'downloading' | 'extracting' | 'switching' | 'done' | 'failed';

export interface JobView {
  id: number;
  appId: string;
  kind: JobKind;
  state: JobState;
  phase: JobPhase;
  /** 0..1, null = progress unknown */
  progress: number | null;
  error: Msg | null;
}

export interface AppView {
  id: string;
  name: string;
  /** German short description; descriptionEn is the English one */
  description: string;
  descriptionEn: string;
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
  /** Error during the last check */
  error: Msg | null;
  /** Public address of the app, if set in the settings */
  openUrl: string | null;
  /** Running or recently failed action */
  job: JobView | null;
}

export interface StateView {
  apps: AppView[];
  checking: boolean;
  lastCheckAt: string | null;
  nextCheckAt: string | null;
  github: { remaining: number | null; limit: number | null; resetAt: string | null };
  /** At least one notification channel is turned on */
  notificationsConfigured: boolean;
  warnings: Msg[];
}

export interface EventView {
  id: number;
  at: string;
  appId: string | null;
  appName: string | null;
  appColor: string | null;
  kind: string;
  message: Msg;
  username: string | null;
}

export interface SettingsView {
  checkIntervalMinutes: number;
  autoInstallNew: boolean;
  defaultAutoUpdate: boolean;
  appsBaseUrl: string;
  adminBaseUrl: string;
}

export type SettingsUpdate = Partial<SettingsView>;

export interface ChannelView {
  id: number;
  name: string;
  type: ChannelType;
  enabled: boolean;
  /** Language of the notifications on this channel */
  language: Lang;
  events: NotifyEvent[];
  /** Settings without the secrets */
  config: ChannelValues;
  /** Secrets that have a stored value */
  secretsSet: string[];
  /** Target without secrets, e.g. the host or the recipients */
  target: string;
  lastSentAt: string | null;
  /** Why the last notification didn't get through – null if it did */
  lastError: Msg | null;
}

/** Changes a channel – an empty secret keeps the stored value, null removes it */
export interface ChannelInput {
  name: string;
  enabled: boolean;
  language: Lang;
  events: NotifyEvent[];
  config: Record<string, string | number | null>;
}

/** Creates a channel; its type can't be changed later */
export interface NewChannel extends ChannelInput {
  type: ChannelType;
}

/** Test message with the values from the form; id fills in the stored secrets */
export interface ChannelTest {
  id?: number;
  type: ChannelType;
  language: Lang;
  config: ChannelInput['config'];
}

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
