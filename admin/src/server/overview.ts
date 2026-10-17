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

async function writeAtomic(file: string, content: string): Promise<void> {
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.tmp`);
  await fs.writeFile(tmp, content, 'utf8');
  await fs.rename(tmp, file);
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

/** Public start page of nginx (/index.html) and /status.json with the installed apps. */
export async function writeOverview(dataDir: string, apps: OverviewApp[]): Promise<void> {
  const cards = apps.length
    ? apps.map((app) => card(dataDir, app)).join('\n')
    : '    <p class="empty">Noch keine Apps installiert.</p>';
  const page = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Craft Apps</title>
<link rel="icon" href="data:,">
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
  await writeAtomic(path.join(dataDir, 'index.html'), page);
  await writeAtomic(path.join(dataDir, 'status.json'), JSON.stringify(status, null, 2));
}
