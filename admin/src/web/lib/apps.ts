import type { AppView } from '../../shared/types';
import type { UiKey } from '../i18n/i18n';
import { formatDate, formatSize } from './format';

// What tile, row and details page show the same way

export const STATUS: Record<AppView['status'], { label: UiKey; tone: string }> = {
  installed: { label: 'app.status.installed', tone: 'ok' },
  'update-available': { label: 'app.status.updateAvailable', tone: 'warn' },
  'not-installed': { label: 'app.status.notInstalled', tone: 'muted' },
};

/** Version, date and – before installing – size, e.g. "Version 0.12.0 → 0.13.1 · 18 Oct 2026" */
export function metaLine(app: AppView): string {
  if (app.status === 'not-installed') {
    return `Version ${app.latestVersion} · ${formatDate(app.latestPublishedAt)} · ${formatSize(app.latestSize)}`;
  }
  if (app.status === 'update-available') {
    return `Version ${app.installedVersion} → ${app.latestVersion} · ${formatDate(app.latestPublishedAt)}`;
  }
  return `Version ${app.installedVersion} · ${formatDate(app.installedPublishedAt)}`;
}

/** "PhotoCraft" → ["Photo", "Craft"]: the second part is drawn in the app's color */
export const splitName = (name: string): [string, string] =>
  name.endsWith('Craft') ? [name.slice(0, -5), 'Craft'] : [name, ''];
