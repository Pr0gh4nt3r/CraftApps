import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import { createGzip } from 'node:zlib';
import yauzl from 'yauzl';
import { APP_ID, USER_AGENT } from './util.js';

export interface Asset {
  name: string;
  size: number;
  digest: string | null;
  url: string;
}

export type OnProgress = (phase: string, fraction: number | null) => void;

/** Downloads a release asset and checks size and SHA-256 (GitHub provides the digest). */
export async function download(asset: Asset, dest: string, onProgress: OnProgress): Promise<void> {
  const res = await fetch(asset.url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(30 * 60_000) });
  if (!res.ok || !res.body) throw new Error(`Download von ${asset.name} fehlgeschlagen (HTTP ${res.status})`);
  const hash = createHash('sha256');
  let received = 0;
  const meter = new Transform({
    transform(chunk: Buffer, _encoding, done) {
      hash.update(chunk);
      received += chunk.length;
      onProgress('Lädt herunter', asset.size ? received / asset.size : null);
      done(null, chunk);
    },
  });
  await pipeline(Readable.fromWeb(res.body as unknown as WebReadableStream), meter, createWriteStream(dest));
  if (received !== asset.size) throw new Error(`${asset.name}: Download unvollständig`);
  const [algorithm, expected] = (asset.digest ?? '').split(':');
  if (algorithm === 'sha256' && hash.digest('hex') !== expected?.toLowerCase()) {
    throw new Error(`${asset.name}: SHA-256 stimmt nicht, Datei verworfen`);
  }
}

function openZip(file: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) =>
    yauzl.open(file, { lazyEntries: true, autoClose: false, strictFileNames: true }, (err, zip) =>
      err || !zip ? reject(err ?? new Error('Zip nicht lesbar')) : resolve(zip),
    ),
  );
}

function listEntries(zip: yauzl.ZipFile): Promise<yauzl.Entry[]> {
  return new Promise((resolve, reject) => {
    const entries: yauzl.Entry[] = [];
    zip.on('entry', (entry: yauzl.Entry) => {
      entries.push(entry);
      zip.readEntry();
    });
    zip.once('end', () => resolve(entries));
    zip.once('error', reject);
    zip.readEntry();
  });
}

function openEntry(zip: yauzl.ZipFile, entry: yauzl.Entry): Promise<Readable> {
  return new Promise((resolve, reject) =>
    zip.openReadStream(entry, (err, stream) =>
      err || !stream ? reject(err ?? new Error(`${entry.fileName} nicht lesbar`)) : resolve(stream),
    ),
  );
}

/** Hidden temp name in the same folder – nginx never serves files starting with ".". */
const hidden = (file: string) => path.join(path.dirname(file), `.${path.basename(file)}.tmp`);

async function gzipFile(src: string, dest: string): Promise<void> {
  await pipeline(createReadStream(src), createGzip({ level: 9 }), createWriteStream(dest));
  const stat = await fs.stat(src);
  await fs.utimes(dest, stat.atime, stat.mtime); // gzip_static wants matching timestamps
}

export function appDir(dataDir: string, id: string): string {
  if (!APP_ID.test(id)) throw new Error(`Ungültige App-ID: ${id}`);
  return path.join(dataDir, id);
}

/**
 * Extracts the web zip into appDir and returns the list of written files.
 *
 * Two phases: first everything (plus .gz for .wasm/.js) lands as a hidden temp file next to the
 * running version, then everything is renamed in one go, index.html last. Apps with a content
 * hash in their file names thus switch without interruption, apps with fixed file names
 * (LightCraft, EffectCraft, FilmCraft) within milliseconds.
 */
export async function deploy(dir: string, zipPath: string, onProgress: OnProgress): Promise<string[]> {
  const zip = await openZip(zipPath);
  const staged: { rel: string; tmp: string; target: string }[] = [];
  try {
    const entries = (await listEntries(zip)).filter((e) => !e.fileName.endsWith('/'));
    // Everything sits in a folder like photocraft-web-0.9.0/ – strip it
    const tops = new Set(entries.map((e) => e.fileName.split('/')[0]));
    const prefix = tops.size === 1 && entries.every((e) => e.fileName.includes('/')) ? `${[...tops][0]}/` : '';
    const files = new Map<string, yauzl.Entry>();
    for (const entry of entries) {
      const rel = entry.fileName.slice(prefix.length);
      if (rel.includes('\\') || rel.split('/').some((part) => part === '' || part === '.' || part === '..')) {
        throw new Error(`Ungültiger Pfad im Zip: ${entry.fileName}`);
      }
      files.set(rel, entry);
    }
    if (!files.has('index.html')) throw new Error('Kein index.html im Zip');

    let done = 0;
    for (const [rel, entry] of files) {
      onProgress('Entpackt', done++ / files.size);
      const target = path.join(dir, ...rel.split('/'));
      await fs.mkdir(path.dirname(target), { recursive: true });
      const tmp = hidden(target);
      staged.push({ rel, tmp, target });
      await pipeline(await openEntry(zip, entry), createWriteStream(tmp));
      // .gz for nginx's gzip_static – unless the zip already contains one
      if (/\.(wasm|js)$/.test(rel) && !files.has(`${rel}.gz`)) {
        const gzTarget = `${target}.gz`;
        staged.push({ rel: `${rel}.gz`, tmp: hidden(gzTarget), target: gzTarget });
        await gzipFile(tmp, hidden(gzTarget));
      }
    }
    onProgress('Schaltet um', null);
    // index.html (and index.html.gz/.br, if any) last – from then on the new version is live
    const isIndex = (rel: string) => rel.startsWith('index.html');
    staged.sort((a, b) => Number(isIndex(a.rel)) - Number(isIndex(b.rel)));
    for (const { tmp, target } of staged) await fs.rename(tmp, target);
    return staged.map((s) => s.rel).sort();
  } finally {
    zip.close();
    await Promise.all(staged.map(({ tmp }) => fs.rm(tmp, { force: true })));
  }
}

/** Deletes everything in dir that isn't in keep (relative paths), and empty folders. */
export async function prune(dir: string, keep: Set<string>): Promise<void> {
  async function walk(current: string): Promise<boolean> {
    let empty = true;
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (await walk(full)) await fs.rmdir(full);
        else empty = false;
      } else if (keep.has(path.relative(dir, full).split(path.sep).join('/'))) {
        empty = false;
      } else {
        await fs.rm(full, { force: true });
      }
    }
    return empty;
  }
  await walk(dir);
}
