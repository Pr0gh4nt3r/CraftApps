import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

export interface OverviewApp {
  id: string;
  name: string;
  description: string;
  descriptionEn: string;
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
  // Both languages in the page; CSS shows the one matching <html lang>
  const desc =
    app.descriptionEn && app.descriptionEn !== app.description
      ? `<span data-lang="de">${esc(app.description)}</span><span data-lang="en">${esc(app.descriptionEn)}</span>`
      : esc(app.description);
  const published = app.publishedAt?.toISOString() ?? '';
  const date = published ? ` · <time datetime="${published}">${published.slice(0, 10)}</time>` : '';
  return `    <a class="app" href="${app.id}/" style="--c: ${esc(app.color)}">
      ${icon}
      <span><span class="name">${esc(head)}<span>${craft}</span></span>
        <span class="desc">${desc}</span>
        <span class="meta">Version ${esc(app.version)}${date}</span></span>
    </a>`;
}

/**
 * Public start page of nginx (/index.html) in German and English – the switch or else the
 * browser's language picks one, without JavaScript it's English. Plus its icons and
 * /status.json with the installed apps.
 */
export async function writeOverview(dataDir: string, apps: OverviewApp[], iconDir: string): Promise<void> {
  const cards = apps.length
    ? apps.map((app) => card(dataDir, app)).join('\n')
    : '    <p class="empty"><span data-lang="de">Noch keine Apps installiert.</span><span data-lang="en">No apps installed yet.</span></p>';
  const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Craft Apps</title>
<link rel="icon" href="favicon.ico" sizes="32x32">
<link rel="icon" href="icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<script>
  // The language from the switch (remembered in this browser, as in the admin UI), otherwise
  // German for browsers that prefer German and English for all others
  {
    let lang;
    try {
      lang = localStorage.getItem("craftapps.lang");
    } catch {
      // storage blocked – the browser's language decides
    }
    if (lang !== "de" && lang !== "en") {
      lang = "en";
      for (const l of navigator.languages || [navigator.language]) {
        const tag = String(l).slice(0, 2).toLowerCase();
        if (tag === "de" || tag === "en") {
          lang = tag;
          break;
        }
      }
    }
    document.documentElement.lang = lang;
  }
</script>
<style>
  :root { color-scheme: dark; --bg: #0d0f13; --card: #14171d; --line: #262b34; --text: #e7e9ee; --muted: #8f96a3;
          --mono: ui-monospace, SFMono-Regular, Consolas, monospace; }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text); font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { max-width: 1240px; margin: 0 auto; padding: 32px 16px 48px; }
  header { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 24px; }
  h1 { margin: 0; font-size: 24px; }
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
  .meta { margin-top: 6px; font: 12px var(--mono); }
  .empty { margin: 0; padding: 32px; background: var(--card); color: var(--muted); }
  html:not([lang="de"]) [data-lang="de"], html[lang="de"] [data-lang="en"] { display: none; }
  /* DE | EN as in the admin UI – only with JavaScript, without it the switch couldn't work */
  .lang-switch { display: inline-flex; border: 1px solid var(--line); border-radius: 6px; overflow: hidden; }
  .lang-switch[hidden] { display: none; }
  .lang-switch button { padding: 3px 8px; border: 0; background: none; color: var(--muted);
                        font: 700 11px var(--mono); letter-spacing: 0.08em; cursor: pointer; }
  .lang-switch button + button { border-left: 1px solid var(--line); }
  .lang-switch button:hover, .lang-switch [aria-pressed="true"] { color: var(--text); }
  .lang-switch [aria-pressed="true"] { background: #1b1f27; }
</style>
</head>
<body>
<main>
  <header>
    <h1>Craft Apps</h1>
    <div class="lang-switch" role="group" hidden>
      <button type="button" lang="de" title="Deutsch">DE</button>
      <button type="button" lang="en" title="English">EN</button>
    </div>
  </header>
  <div class="grid">
${cards}
  </div>
</main>
<script>
  // Switch and dates – the dates are formatted in the language of the page as well
  {
    const html = document.documentElement;
    const group = document.querySelector(".lang-switch");
    const buttons = group.querySelectorAll("button");
    const render = () => {
      const locale = html.lang === "de" ? "de-DE" : "en-GB";
      for (const t of document.querySelectorAll("time")) {
        const d = new Date(t.dateTime);
        if (!isNaN(d)) t.textContent = d.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
      }
      group.setAttribute("aria-label", html.lang === "de" ? "Sprache" : "Language");
      for (const b of buttons) b.setAttribute("aria-pressed", String(b.lang === html.lang));
    };
    for (const b of buttons) {
      b.addEventListener("click", () => {
        html.lang = b.lang;
        try {
          localStorage.setItem("craftapps.lang", b.lang);
        } catch {
          // not remembered then
        }
        render();
      });
    }
    group.hidden = false;
    render();
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
