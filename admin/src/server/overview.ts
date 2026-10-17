import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

export interface OverviewApp {
  id: string;
  name: string;
  description: string;
  color: string;
  version: string;
  publishedAt: Date | null;
}

const esc = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

async function writeAtomic(file: string, content: string | Buffer): Promise<void> {
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.tmp`);
  await fs.writeFile(tmp, content, 'utf8');
  await fs.rename(tmp, file);
}

const ICONS = ['icon.svg', 'favicon.ico', 'apple-touch-icon.png'];

/** Copies the browser icons of the start page from the build (public/overview) next to index.html. */
async function copyIcons(iconDir: string, dataDir: string): Promise<void> {
  for (const name of ICONS) {
    // Missing with "npm run dev:server": the icons only exist in the build
    const icon = await fs.readFile(path.join(iconDir, name)).catch(() => null);
    if (!icon) continue;
    const current = await fs.readFile(path.join(dataDir, name)).catch(() => null);
    if (!current?.equals(icon)) await writeAtomic(path.join(dataDir, name), icon);
  }
}

function card(dataDir: string, app: OverviewApp): string {
  const [head, craft] = app.name.endsWith('Craft') ? [app.name.slice(0, -5), 'Craft'] : [app.name, ''];
  const icon = existsSync(path.join(dataDir, 'icons', `${app.id}.png`))
    ? `<img src="icons/${app.id}.png" alt="">`
    : `<span class="icon">${esc(app.name.charAt(0))}</span>`;
  const published = app.publishedAt?.toISOString() ?? '';
  const date = published ? ` · <time datetime="${published}">${published.slice(0, 10)}</time>` : '';
  return `    <a class="app" href="${app.id}/" style="--c: ${esc(app.color)}">
      ${icon}
      <span><span class="name">${esc(head)}<span>${craft}</span></span>
        <span class="desc">${esc(app.description)}</span>
        <span class="meta">Version ${esc(app.version)}${date}</span></span>
    </a>`;
}

/** Public start page of nginx (/index.html), its icons and /status.json with the installed apps. */
export async function writeOverview(dataDir: string, apps: OverviewApp[], iconDir: string): Promise<void> {
  const cards = apps.length
    ? apps.map((app) => card(dataDir, app)).join('\n')
    : '    <p class="empty">Noch keine Apps installiert.</p>';
  const page = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Craft Apps</title>
<link rel="icon" href="favicon.ico" sizes="32x32">
<link rel="icon" href="icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<style>
  :root { color-scheme: dark; --bg: #0d0f13; --card: #14171d; --line: #262b34; --text: #e7e9ee; --muted: #8f96a3; }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text); font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { max-width: 1240px; margin: 0 auto; padding: 32px 16px 48px; }
  h1 { margin: 0 0 24px; font-size: 24px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1px;
          background: var(--line); border: 1px solid var(--line); }
  .app { display: flex; gap: 14px; align-items: flex-start; padding: 18px; background: var(--card);
         color: inherit; text-decoration: none; }
  .app:hover { background: #191d24; }
  .app img, .app .icon { flex: none; width: 56px; height: 56px; border-radius: 12px; }
  .app .icon { display: grid; place-items: center; background: var(--c); color: #0b0d10; font-size: 24px; font-weight: 700; }
  .name { display: block; font-size: 20px; font-weight: 700; }
  .name span { color: var(--c); }
  .desc, .meta { display: block; color: var(--muted); font-size: 13px; }
  .meta { margin-top: 6px; font: 12px ui-monospace, SFMono-Regular, Consolas, monospace; }
  .empty { margin: 0; padding: 32px; background: var(--card); color: var(--muted); }
</style>
</head>
<body>
<main>
  <h1>Craft Apps</h1>
  <div class="grid">
${cards}
  </div>
</main>
<script>
  for (const t of document.querySelectorAll("time")) {
    const d = new Date(t.dateTime);
    if (!isNaN(d)) t.textContent = d.toLocaleDateString("de-DE", { day: "numeric", month: "short", year: "numeric" });
  }
</script>
</body>
</html>
`;
  const status = {
    generatedAt: new Date().toISOString(),
    apps: apps.map((a) => ({ app: a.id, name: a.name, version: a.version, publishedAt: a.publishedAt?.toISOString() ?? null })),
  };
  await copyIcons(iconDir, dataDir);
  await writeAtomic(path.join(dataDir, 'index.html'), page);
  await writeAtomic(path.join(dataDir, 'status.json'), JSON.stringify(status, null, 2));
}
