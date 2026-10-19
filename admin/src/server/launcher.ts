import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { FastifyBaseLogger } from 'fastify';
import type { Repo } from './github.js';
import type { SettingsStore } from './settings.js';
import { APP_ID, DAY, USER_AGENT, errorText } from './util.js';

// storytold maintains order, names, brand colors, English and German short descriptions and icons
// for the Craft Launcher – the admin takes them from there so it looks like the launcher.
const LAUNCHER = 'https://raw.githubusercontent.com/storytold/craft-launcher/HEAD/';
// An entry in catalog.rs: app("photocraft", "PhotoCraft", "Image editing",
//                            AppGroup::Classic, [[0x2f, 0x7b, 0xf5], ...], ...)
const CATALOG_ENTRY =
  /app\(\s*"(?<id>[a-z0-9]+)",\s*"(?<name>[^"]+)",\s*"[^"]*",\s*[\w:]+,\s*\[\[0x(?<r>\w\w),\s*0x(?<g>\w\w),\s*0x(?<b>\w\w)\]/g;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export type LauncherInfo = Record<string, { name?: string; color?: string; desc?: string; descEn?: string }>;

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} für ${url}`);
  return res.text();
}

/**
 * Names, colors and English and German short descriptions in launcher order. Purely cosmetic, hence
 * best effort: the launcher keeps its app list as Rust code. If it is unreachable or its
 * format changes, the last known state applies per field.
 */
export async function launcherInfo(settings: SettingsStore, log: FastifyBaseLogger): Promise<LauncherInfo> {
  const known = (await settings.getInternal<LauncherInfo>('launcher')) ?? {};
  let catalog: string;
  let taglines: string;
  try {
    [catalog, taglines] = await Promise.all([
      fetchText(`${LAUNCHER}crates/core/src/catalog.rs`),
      fetchText(`${LAUNCHER}crates/ui-egui/src/i18n/de.tsv`),
    ]);
  } catch (err) {
    log.warn(`Craft Launcher nicht abrufbar (${errorText(err)}), nehme den letzten bekannten Stand`);
    return known;
  }
  const fresh: LauncherInfo = {};
  for (const m of catalog.matchAll(CATALOG_ENTRY)) {
    const g = m.groups!;
    fresh[g.id] = { name: g.name, color: `#${g.r}${g.g}${g.b}` };
  }
  // Lines like "figcraft<TAB>Interface design and prototyping<TAB>Interface-Design und Prototyping":
  // the English source text, then the German translation
  for (const row of taglines.split('\n')) {
    const cols = row.split('\t');
    if (cols.length === 3 && APP_ID.test(cols[0])) {
      Object.assign((fresh[cols[0]] ??= {}), { descEn: cols[1].trim(), desc: cols[2].trim() });
    }
  }
  const merged: LauncherInfo = {};
  for (const id of new Set([...Object.keys(fresh), ...Object.keys(known)])) merged[id] = { ...known[id], ...fresh[id] };
  if (JSON.stringify(merged) !== JSON.stringify(known)) await settings.setInternal('launcher', merged);
  return merged;
}

/** Name, descriptions and color: from the launcher, otherwise derived from GitHub. */
export function appMeta(
  id: string,
  repo: Repo,
  launcher: LauncherInfo,
): { name: string; description: string; descriptionEn: string; color: string } {
  let about = repo.description ?? '';
  let name: string;
  const prefix = /^(\w+Craft):\s*/.exec(about); // "AniCraft: An open-source 2D animation editor ..."
  if (prefix && prefix[1].toLowerCase() === id) {
    name = prefix[1];
    about = about.slice(prefix[0].length);
  } else if (repo.name !== id) {
    name = repo.name; // Repo name already has the right case, e.g. "AniCraft"
  } else {
    name = id.charAt(0).toUpperCase() + id.slice(1).replace(/craft$/, 'Craft');
  }
  const hue = createHash('sha256').update(id).digest().readUInt16BE(0) % 360;
  const info = launcher[id] ?? {};
  return {
    name: info.name ?? name,
    description: (info.desc ?? about).slice(0, 512),
    descriptionEn: (info.descEn ?? about).slice(0, 512),
    color: info.color ?? `hsl(${hue}, 65%, 55%)`,
  };
}

const iconAttempts = new Map<string, number>();

/** Fetches the launcher's app icon to <dataDir>/icons/<app>.png (refreshed weekly). */
export async function fetchIcon(dataDir: string, id: string): Promise<void> {
  const file = path.join(dataDir, 'icons', `${id}.png`);
  const stat = await fs.stat(file).catch(() => null);
  if (stat && Date.now() - stat.mtimeMs < 7 * DAY) return;
  if (Date.now() - (iconAttempts.get(id) ?? 0) < DAY) return; // try at most once a day
  iconAttempts.set(id, Date.now());
  try {
    const res = await fetch(`${LAUNCHER}assets/app-icons/${id}.png`, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return; // App has no icon in the launcher (yet)
    const png = Buffer.from(await res.arrayBuffer());
    if (png.length > 2_000_000 || !png.subarray(0, 8).equals(PNG_SIGNATURE)) return;
    await fs.mkdir(path.dirname(file), { recursive: true });
    const tmp = path.join(path.dirname(file), `.${id}.png.tmp`);
    await fs.writeFile(tmp, png);
    await fs.rename(tmp, file);
  } catch {
    // Icons are cosmetic – try again next time
  }
}
