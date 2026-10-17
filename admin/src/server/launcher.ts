import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { FastifyBaseLogger } from 'fastify';
import type { Repo } from './github.js';
import type { SettingsStore } from './settings.js';
import { APP_ID, DAY, USER_AGENT, errorText } from './util.js';

// Reihenfolge, Namen, Markenfarben, deutsche Kurzbeschreibungen und Icons pflegt storytold
// für den Craft Launcher – die Verwaltung übernimmt sie von dort, damit sie aussieht wie er.
const LAUNCHER = 'https://raw.githubusercontent.com/storytold/craft-launcher/HEAD/';
// Ein Eintrag in catalog.rs: app("photocraft", "PhotoCraft", "Image editing",
//                               AppGroup::Classic, [[0x2f, 0x7b, 0xf5], ...], ...)
const CATALOG_ENTRY =
  /app\(\s*"(?<id>[a-z0-9]+)",\s*"(?<name>[^"]+)",\s*"[^"]*",\s*[\w:]+,\s*\[\[0x(?<r>\w\w),\s*0x(?<g>\w\w),\s*0x(?<b>\w\w)\]/g;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export type LauncherInfo = Record<string, { name?: string; color?: string; desc?: string }>;

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} für ${url}`);
  return res.text();
}

/**
 * Namen, Farben und deutsche Kurzbeschreibungen in Launcher-Reihenfolge. Reine Kosmetik, daher
 * best effort: Der Launcher führt seine App-Liste als Rust-Code. Ist er nicht erreichbar oder
 * ändert sich das Format, gilt pro Feld der letzte bekannte Stand.
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
  // Zeilen wie "figcraft<TAB>Interface design and prototyping<TAB>Interface-Design und Prototyping"
  for (const row of taglines.split('\n')) {
    const cols = row.split('\t');
    if (cols.length === 3 && APP_ID.test(cols[0])) (fresh[cols[0]] ??= {}).desc = cols[2].trim();
  }
  const merged: LauncherInfo = {};
  for (const id of new Set([...Object.keys(fresh), ...Object.keys(known)])) merged[id] = { ...known[id], ...fresh[id] };
  if (JSON.stringify(merged) !== JSON.stringify(known)) await settings.setInternal('launcher', merged);
  return merged;
}

/** Name, Beschreibung und Farbe: aus dem Launcher, sonst aus GitHub abgeleitet. */
export function appMeta(id: string, repo: Repo, launcher: LauncherInfo): { name: string; description: string; color: string } {
  let about = repo.description ?? '';
  let name: string;
  const prefix = /^(\w+Craft):\s*/.exec(about); // "AniCraft: An open-source 2D animation editor ..."
  if (prefix && prefix[1].toLowerCase() === id) {
    name = prefix[1];
    about = about.slice(prefix[0].length);
  } else if (repo.name !== id) {
    name = repo.name; // Repo ist schon passend geschrieben, z.B. "AniCraft"
  } else {
    name = id.charAt(0).toUpperCase() + id.slice(1).replace(/craft$/, 'Craft');
  }
  const hue = createHash('sha256').update(id).digest().readUInt16BE(0) % 360;
  const info = launcher[id] ?? {};
  return {
    name: info.name ?? name,
    description: (info.desc ?? about).slice(0, 512),
    color: info.color ?? `hsl(${hue}, 65%, 55%)`,
  };
}

const iconAttempts = new Map<string, number>();

/** Holt das App-Icon des Launchers nach <dataDir>/icons/<app>.png (wöchentlich aufgefrischt). */
export async function fetchIcon(dataDir: string, id: string): Promise<void> {
  const file = path.join(dataDir, 'icons', `${id}.png`);
  const stat = await fs.stat(file).catch(() => null);
  if (stat && Date.now() - stat.mtimeMs < 7 * DAY) return;
  if (Date.now() - (iconAttempts.get(id) ?? 0) < DAY) return; // höchstens einmal am Tag versuchen
  iconAttempts.set(id, Date.now());
  try {
    const res = await fetch(`${LAUNCHER}assets/app-icons/${id}.png`, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return; // App hat (noch) kein Icon im Launcher
    const png = Buffer.from(await res.arrayBuffer());
    if (png.length > 2_000_000 || !png.subarray(0, 8).equals(PNG_SIGNATURE)) return;
    await fs.mkdir(path.dirname(file), { recursive: true });
    const tmp = path.join(path.dirname(file), `.${id}.png.tmp`);
    await fs.writeFile(tmp, png);
    await fs.rename(tmp, file);
  } catch {
    // Icons sind Kosmetik – beim nächsten Mal wieder versuchen
  }
}
