// Shared types for server and UI (types only, no runtime code)

import type { ChannelType, ChannelValues, NotifyEvent } from './channels.js';
import type { Lang, Msg } from './messages.js';
import type { ActivityView } from './activity.js';
import type { CheckSchedule } from './schedule.js';

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
  /** Tag of the latest release, for the link to its notes */
  latestTag: string | null;
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

/** An app's page in the launcher – English only, as there */
export interface AppDetailsData {
  /** One line under the name */
  headline: string;
  paragraphs: string[];
  features: { title: string; text: string }[];
  /** The first is the lead picture, all are 8:5; url only once the picture is in the data volume */
  shots: { key: string; caption: string; url?: string }[];
  /** Where it runs, e.g. "macOS, Windows, Linux, web" */
  platforms: string;
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

/** Kind of an activity log entry – the UI shows a label and a color for each */
export type EventKind =
  | 'installed'
  | 'updated'
  | 'uninstalled'
  | 'available'
  | 'update-available'
  | 'error'
  | 'check'
  | 'setting'
  | 'notify'
  | 'user'
  | 'system';

export interface EventView {
  id: number;
  at: string;
  appId: string | null;
  appName: string | null;
  appColor: string | null;
  /** An EventKind – or an unknown one from a newer version */
  kind: string;
  message: Msg;
  username: string | null;
}

export interface SettingsView {
  checkSchedule: CheckSchedule;
  /** stable, rc, beta, alpha, … – takes releases of its own and of every more mature channel */
  updateChannel: string;
  /** What the activity log shows to users without an own view */
  activityView: ActivityView;
  autoInstallNew: boolean;
  defaultAutoUpdate: boolean;
  appsBaseUrl: string;
  adminBaseUrl: string;
  /** Where the GitHub token in use comes from – the token itself stays on the server */
  githubTokenSource: 'settings' | 'env' | null;
  /** Update channels the apps currently have releases in, most mature first – stable always */
  releaseChannels: string[];
}

/** Changes settings – githubToken replaces the saved token, null removes it */
export type SettingsUpdate = Partial<
  Omit<SettingsView, 'githubTokenSource' | 'releaseChannels'> & { githubToken: string | null }
>;

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
