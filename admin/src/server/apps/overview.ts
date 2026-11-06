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
  // For order and search on the page (see the script at the end)
  const search = `${app.name} ${app.id} ${app.description} ${app.descriptionEn}`.toLowerCase();
  return `    <a class="app" href="${app.id}/" style="--c: ${esc(app.color)}" data-app="${esc(app.id)}"
       data-name="${esc(app.name)}" data-date="${published}" data-search="${esc(search)}">
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
  /* Order, search and tiles | list as in the admin UI – only with JavaScript */
  .controls { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 10px; margin-bottom: 16px; }
  .controls[hidden], .grid[hidden], .app[hidden], .no-match[hidden] { display: none; }
  .controls label { display: flex; align-items: center; gap: 10px; color: var(--muted);
                    font: 700 11px var(--mono); letter-spacing: 0.12em; text-transform: uppercase; }
  .select { position: relative; display: inline-flex; }
  .select::after { content: ""; position: absolute; top: 50%; right: 13px; width: 6px; height: 6px; pointer-events: none;
                   border-right: 1.5px solid var(--text); border-bottom: 1.5px solid var(--text); transform: translateY(-70%) rotate(45deg); }
  .controls select, .controls input { height: 36px; padding: 0 10px; border: 1px solid var(--line); border-radius: 0;
                                      background: var(--bg); color: var(--text); font: 13px system-ui, -apple-system, "Segoe UI", sans-serif; }
  .controls select { min-width: 210px; padding-right: 34px; appearance: none; text-transform: none; letter-spacing: 0; cursor: pointer; }
  .controls input { width: 240px; }
  .controls select:focus, .controls input:focus { outline: none; border-color: #2f7bf5; }
  .layout { display: flex; border: 1px solid var(--line); }
  .layout button { display: grid; place-items: center; width: 36px; height: 34px; border: 0; background: none;
                   color: var(--muted); cursor: pointer; }
  .layout button + button { border-left: 1px solid var(--line); }
  .layout button:hover { color: var(--text); }
  .layout [aria-pressed="true"] { background: var(--text); color: var(--bg); }
  .layout svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.8; }
  .no-match { margin: 0 0 16px; padding: 16px; background: var(--card); color: var(--muted); }
  /* The list: one row per app, name and description on the left, version on the right */
  .grid.list { grid-template-columns: 1fr; }
  .grid.list .app { align-items: center; padding: 12px 18px; }
  .grid.list .app img, .grid.list .app .icon { width: 40px; height: 40px; border-radius: 9px; }
  .grid.list .app > span:last-child { display: grid; grid-template-columns: minmax(0, 1fr) auto; column-gap: 16px;
                                      align-items: center; width: 100%; }
  .grid.list .name { font-size: 17px; }
  .grid.list .meta { grid-column: 2; grid-row: 1 / span 2; margin: 0; }
  @media (max-width: 720px) {
    .controls input { flex: 1 1 100%; order: -1; width: auto; }
    .grid.list .app > span:last-child { display: block; }
    .grid.list .meta { margin-top: 4px; }
  }
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
  <div class="controls" hidden>
    <label><span class="sort-label"></span>
      <span class="select"><select>
        <option value="name-asc"></option>
        <option value="name-desc"></option>
        <option value="most-used"></option>
        <option value="updated"></option>
      </select></span>
    </label>
    <input type="search">
    <div class="layout" role="group">
      <button type="button" data-layout="grid"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="6.5" height="6.5"/><rect x="13.5" y="4" width="6.5" height="6.5"/><rect x="4" y="13.5" width="6.5" height="6.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5"/></svg></button>
      <button type="button" data-layout="list"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg></button>
    </div>
  </div>
  <p class="no-match" hidden></p>
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
<script>
  // Order, search and tiles | list – remembered in this browser like in the admin UI. "Most
  // used" counts how often an app was opened from this page in this browser.
  {
    const html = document.documentElement;
    const grid = document.querySelector(".grid");
    const tiles = [...grid.querySelectorAll(".app")];
    const controls = document.querySelector(".controls");
    const select = controls.querySelector("select");
    const search = controls.querySelector("input");
    const layouts = controls.querySelectorAll("[data-layout]");
    const noMatch = document.querySelector(".no-match");
    const TEXTS = {
      de: { sort: "Sortieren", "name-asc": "Name (A–Z)", "name-desc": "Name (Z–A)", "most-used": "Am häufigsten genutzt",
            updated: "Zuletzt aktualisiert", search: "Apps durchsuchen", layout: "Ansicht", grid: "Kacheln", list: "Liste",
            none: (q) => "Keine App passt zu „" + q + "“." },
      en: { sort: "Sort", "name-asc": "Name (A–Z)", "name-desc": "Name (Z–A)", "most-used": "Most used",
            updated: "Recently updated", search: "Search apps", layout: "Layout", grid: "Tiles", list: "List",
            none: (q) => 'No app matches "' + q + '".' },
    };
    const load = (key, fallback) => {
      try {
        return localStorage.getItem(key) || fallback;
      } catch {
        return fallback;
      }
    };
    const save = (key, value) => {
      try {
        localStorage.setItem(key, value);
      } catch {
        // not remembered then
      }
    };
    const usage = () => {
      try {
        return JSON.parse(localStorage.getItem("craftapps.usage") || "{}") || {};
      } catch {
        return {};
      }
    };
    let sort = load("craftapps.appsSort", "name-asc");
    if (![...select.options].some((o) => o.value === sort)) sort = "name-asc";
    let layout = load("craftapps.appsLayout", "grid") === "list" ? "list" : "grid";

    const texts = () => TEXTS[html.lang === "de" ? "de" : "en"];
    const arrange = () => {
      const locale = html.lang === "de" ? "de-DE" : "en-GB";
      const words = search.value.toLowerCase().split(/\\s+/).filter(Boolean);
      const counts = usage();
      const byName = (a, b) => a.dataset.name.localeCompare(b.dataset.name, locale);
      const compare = {
        "name-asc": byName,
        "name-desc": (a, b) => byName(b, a),
        "most-used": (a, b) => (counts[b.dataset.app] || 0) - (counts[a.dataset.app] || 0) || byName(a, b),
        updated: (a, b) => (Date.parse(b.dataset.date) || 0) - (Date.parse(a.dataset.date) || 0) || byName(a, b),
      }[sort];
      let shown = 0;
      for (const tile of [...tiles].sort(compare)) {
        tile.hidden = !words.every((w) => tile.dataset.search.includes(w));
        if (!tile.hidden) shown++;
        grid.append(tile);
      }
      grid.hidden = shown === 0;
      noMatch.hidden = shown > 0;
      noMatch.textContent = texts().none(search.value.trim());
      grid.classList.toggle("list", layout === "list");
      for (const b of layouts) b.setAttribute("aria-pressed", String(b.dataset.layout === layout));
    };
    const render = () => {
      const t = texts();
      controls.querySelector(".sort-label").textContent = t.sort;
      for (const o of select.options) o.textContent = t[o.value];
      search.placeholder = t.search;
      search.setAttribute("aria-label", t.search);
      controls.querySelector(".layout").setAttribute("aria-label", t.layout);
      for (const b of layouts) {
        b.title = t[b.dataset.layout];
        b.setAttribute("aria-label", t[b.dataset.layout]);
      }
      arrange();
    };

    select.addEventListener("change", () => {
      sort = select.value;
      save("craftapps.appsSort", sort);
      arrange();
    });
    search.addEventListener("input", arrange);
    for (const b of layouts) {
      b.addEventListener("click", () => {
        layout = b.dataset.layout;
        save("craftapps.appsLayout", layout);
        arrange();
      });
    }
    for (const tile of tiles) {
      tile.addEventListener("click", () => {
        const counts = usage();
        counts[tile.dataset.app] = (counts[tile.dataset.app] || 0) + 1;
        save("craftapps.usage", JSON.stringify(counts));
      });
    }
    // The texts follow the language switch
    new MutationObserver(render).observe(html, { attributes: true, attributeFilter: ["lang"] });
    if (tiles.length) {
      select.value = sort;
      controls.hidden = false;
      render();
    }
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
