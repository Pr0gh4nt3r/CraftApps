import fs from 'node:fs/promises';
import path from 'node:path';
import type { FastifyBaseLogger } from 'fastify';
import type { AppDetailsData } from '../../shared/types.js';
import type { SettingsStore } from '../settings/settings.js';
import { APP_ID, DAY, USER_AGENT, errorText } from '../core/util.js';

// The launcher's product pages – headline, about, features, screenshots and platforms per app –
// are Rust code in crates/core/src/details.rs, English only. Like its app list (launcher.ts) the
// admin reads them from there, best effort: unreachable or changed, the last known state applies.
const SOURCE = 'https://raw.githubusercontent.com/storytold/craft-launcher/HEAD/crates/core/src/details.rs';
// The screenshots are JPEGs at <base>/<rev>/<app>/<key>.jpg – only ever fetched from storytold
const SCREENSHOT_HOST = 'https://raw.githubusercontent.com/storytold/';
const KEY = /^[a-z0-9][a-z0-9-]{0,40}$/;
const REV = /^[A-Za-z0-9._-]{1,40}$/;
// As in the launcher: the real pictures are 60 to 150 KB and 1200 px wide
const MAX_SCREENSHOT_BYTES = 2 * 1024 * 1024;
const MAX_SCREENSHOT_PIXELS = 8192 * 8192;

export interface LauncherDetails {
  base: string;
  rev: string;
  apps: Record<string, AppDetailsData>;
}

// ------------------------------------------------------------ A small reader for Rust literals

type Token = { kind: 'str' | 'word' | 'punct'; value: string };

/** A Rust string literal from index i (at the quote): its value and the index after it */
function readString(src: string, i: number): [string, number] {
  let value = '';
  for (i++; i < src.length; i++) {
    const c = src[i];
    if (c === '"') return [value, i + 1];
    if (c !== '\\') {
      value += c;
      continue;
    }
    const next = src[++i];
    if (next === '\n' || next === '\r') {
      // A backslash at the end of a line continues the string without the line break and the
      // indentation of the next line
      while (i + 1 < src.length && /\s/.test(src[i + 1])) i++;
    } else if (next === 'u' && src[i + 1] === '{') {
      const end = src.indexOf('}', i);
      value += String.fromCodePoint(parseInt(src.slice(i + 2, end), 16));
      i = end;
    } else {
      value += { n: '\n', t: '\t', r: '\r', '0': '\0' }[next] ?? next;
    }
  }
  throw new Error('unterminated string');
}

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) i++;
    else if (src.startsWith('//', i)) i = src.includes('\n', i) ? src.indexOf('\n', i) : src.length;
    else if (src.startsWith('/*', i)) i = src.includes('*/', i) ? src.indexOf('*/', i) + 2 : src.length;
    else if (c === '"') {
      const [value, next] = readString(src, i);
      tokens.push({ kind: 'str', value });
      i = next;
    } else if (/\w/.test(c)) {
      const word = /^\w+/.exec(src.slice(i))![0];
      tokens.push({ kind: 'word', value: word });
      i += word.length;
    } else {
      tokens.push({ kind: 'punct', value: c });
      i++;
    }
  }
  return tokens;
}

/** `const NAME: &str = "…";` anywhere in the file */
function stringConsts(src: string): Record<string, string> {
  const consts: Record<string, string> = {};
  for (const m of src.matchAll(/const\s+([A-Z_][A-Z0-9_]*)\s*:\s*&(?:'static\s+)?str\s*=\s*(?=")/g)) {
    consts[m[1]] = readString(src, m.index + m[0].length)[0];
  }
  return consts;
}

/** The entries of `pub const DETAILS: [AppDetails; N] = [ AppDetails { … }, … ];` */
function parseDetails(src: string, consts: Record<string, string>): Record<string, AppDetailsData> {
  const start = src.indexOf('pub const DETAILS');
  const open = src.indexOf('[', src.indexOf('=', start));
  if (start < 0 || open < 0) throw new Error('DETAILS not found');
  const tokens = tokenize(src.slice(open + 1, src.indexOf('\n];', open)));
  let pos = 0;
  const peek = () => tokens[pos];
  const take = (value?: string): Token => {
    const token = tokens[pos++];
    if (!token || (value !== undefined && token.value !== value)) throw new Error(`expected ${value ?? 'more'}`);
    return token;
  };
  const str = (): string => {
    const token = take();
    if (token.kind === 'str') return token.value;
    if (token.kind === 'word' && consts[token.value] !== undefined) return consts[token.value];
    throw new Error(`expected a string, got ${token.value}`);
  };
  // `&[ feature("…", "…"), … ]` or `&[ shot("…", "…"), … ]` – both take two strings
  const pairs = (fn: string): [string, string][] => {
    take('&');
    take('[');
    const list: [string, string][] = [];
    while (peek()?.value !== ']') {
      take(fn);
      take('(');
      const first = str();
      take(',');
      const second = str();
      if (peek()?.value === ',') take(',');
      take(')');
      list.push([first, second]);
      if (peek()?.value === ',') take(',');
    }
    take(']');
    return list;
  };

  const apps: Record<string, AppDetailsData> = {};
  while (pos < tokens.length) {
    take('AppDetails');
    take('{');
    const fields: Record<string, unknown> = {};
    while (peek()?.value !== '}') {
      const name = take().value;
      take(':');
      fields[name] = name === 'features' ? pairs('feature') : name === 'shots' ? pairs('shot') : str();
      if (peek()?.value === ',') take(',');
    }
    take('}');
    if (peek()?.value === ',') take(',');
    const entry = checked(fields);
    if (entry) apps[entry.id] = entry.details;
  }
  return apps;
}

const text = (value: unknown, max: number): string | null =>
  typeof value === 'string' && value.trim() && value.length <= max ? value.trim() : null;

/** Only complete, plausible pages – what comes from the network ends up in paths and pages */
function checked(fields: Record<string, unknown>): { id: string; details: AppDetailsData } | null {
  const id = text(fields.id, 64);
  const headline = text(fields.headline, 300);
  const about = text(fields.about, 4000);
  const platforms = text(fields.platforms, 200);
  if (!id || !APP_ID.test(id) || !headline || !about || !platforms) return null;
  const features = ((fields.features as [string, string][] | undefined) ?? []).slice(0, 20);
  const shots = ((fields.shots as [string, string][] | undefined) ?? []).filter(([key]) => KEY.test(key)).slice(0, 12);
  return {
    id,
    details: {
      headline,
      paragraphs: about.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean),
      features: features.map(([title, body]) => ({ title: title.slice(0, 200), text: body.slice(0, 1000) })),
      shots: shots.map(([key, caption]) => ({ key, caption: caption.slice(0, 200) })),
      platforms,
    },
  };
}

// ------------------------------------------------------------ Fetching and storing

/** Pages, picture address and revision from the source of details.rs */
export function parseLauncherDetails(src: string): LauncherDetails {
  const consts = stringConsts(src);
  const base = consts.SCREENSHOTS_BASE ?? '';
  const rev = consts.SCREENSHOTS_REV ?? '';
  const apps = parseDetails(src, consts);
  if (!Object.keys(apps).length) throw new Error('no pages found');
  return { base: base.startsWith(SCREENSHOT_HOST) ? base : '', rev: REV.test(rev) ? rev : '', apps };
}

/** The product pages, parsed from the launcher – or the last known state */
export async function launcherDetails(settings: SettingsStore, log: FastifyBaseLogger): Promise<LauncherDetails | null> {
  const known = (await settings.getInternal<LauncherDetails>('details')) ?? null;
  let fresh: LauncherDetails;
  try {
    const res = await fetch(SOURCE, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    fresh = parseLauncherDetails(await res.text());
  } catch (err) {
    log.warn(`App-Details des Craft Launchers nicht abrufbar (${errorText(err)}), nehme den letzten bekannten Stand`);
    return known;
  }
  if (JSON.stringify(fresh) !== JSON.stringify(known)) await settings.setInternal('details', fresh);
  return fresh;
}

/** Where the screenshots of a revision live in the data volume – nginx serves them as well */
export const screenshotDir = (dataDir: string, rev: string) => path.join(dataDir, 'screenshots', rev);

/** Width and height a JPEG declares in its frame header – null if it can't be read, as in the launcher */
export function jpegDimensions(bytes: Buffer): [number, number] | null {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return null;
  let i = 2;
  let dims: [number, number] | null = null;
  while (i + 1 < bytes.length) {
    if (bytes[i] !== 0xff) break;
    let j = i;
    while (j < bytes.length && bytes[j] === 0xff) j++;
    if (j >= bytes.length) return null;
    const marker = bytes[j];
    i = j + 1;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) continue; // markers without a length
    if (marker === 0xda) break; // start of scan: the headers are over
    if (i + 1 >= bytes.length) return null;
    const length = bytes.readUInt16BE(i);
    if (length < 2) return null;
    if (marker >= 0xc0 && marker <= 0xc2) {
      // A second frame header could smuggle in other dimensions
      if (dims || i + 6 >= bytes.length) return null;
      dims = [bytes.readUInt16BE(i + 5), bytes.readUInt16BE(i + 3)];
    } else if ((marker === 0xc3 || (marker >= 0xc5 && marker <= 0xcf)) && ![0xc8, 0xcc].includes(marker)) {
      return null; // frame types browsers don't draw
    }
    i += length;
  }
  return dims;
}

const attempts = new Map<string, number>();

/**
 * Fetches the app's missing screenshots into the data volume. The revision in the path never
 * changes its pictures, so a file that is there stays; a new revision starts over and the old
 * one is removed.
 */
export async function fetchScreenshots(dataDir: string, details: LauncherDetails | null, appId: string): Promise<void> {
  const page = details?.apps[appId];
  if (!details?.base || !details.rev || !page?.shots.length) return;
  const root = path.join(dataDir, 'screenshots');
  for (const entry of await fs.readdir(root).catch(() => [] as string[])) {
    if (entry !== details.rev) await fs.rm(path.join(root, entry), { recursive: true, force: true });
  }
  const dir = path.join(screenshotDir(dataDir, details.rev), appId);
  for (const { key } of page.shots) {
    const file = path.join(dir, `${key}.jpg`);
    if (await fs.stat(file).catch(() => null)) continue;
    const attempt = `${details.rev}/${appId}/${key}`;
    if (Date.now() - (attempts.get(attempt) ?? 0) < DAY) continue; // try at most once a day
    attempts.set(attempt, Date.now());
    try {
      const res = await fetch(`${details.base}/${details.rev}/${appId}/${key}.jpg`, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) continue;
      const jpeg = Buffer.from(await res.arrayBuffer());
      const dims = jpegDimensions(jpeg);
      if (jpeg.length > MAX_SCREENSHOT_BYTES || !dims || !dims[0] || !dims[1] || dims[0] * dims[1] > MAX_SCREENSHOT_PIXELS) {
        continue;
      }
      await fs.mkdir(dir, { recursive: true });
      const tmp = path.join(dir, `.${key}.jpg.tmp`);
      await fs.writeFile(tmp, jpeg);
      await fs.rename(tmp, file);
    } catch {
      // Pictures are cosmetic – try again next time
    }
  }
}

/** The page of an app for the UI: screenshots only that are in the volume, with their address */
export async function detailsView(
  dataDir: string,
  details: LauncherDetails | null,
  appId: string,
  url: (key: string) => string,
): Promise<AppDetailsData | null> {
  const page = details?.apps[appId];
  if (!page || !details) return null;
  const shots = [];
  for (const shot of page.shots) {
    const file = path.join(screenshotDir(dataDir, details.rev || '_'), appId, `${shot.key}.jpg`);
    if (details.rev && (await fs.stat(file).catch(() => null))) shots.push({ ...shot, url: url(shot.key) });
  }
  return { ...page, shots };
}
