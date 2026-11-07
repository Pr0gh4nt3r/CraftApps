import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { AppDetailsData } from '../../shared/types.js';

export interface OverviewApp {
  id: string;
  name: string;
  description: string;
  descriptionEn: string;
  color: string;
  version: string;
  /** Tag of the installed release, for the link to its notes */
  tag: string;
  publishedAt: Date | null;
  /** Size of the web zip, null if unknown */
  size: number | null;
  websiteUrl: string;
  repoUrl: string;
  /** The launcher's page – screenshots with addresses relative to the start page */
  details: AppDetailsData | null;
}

const esc = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

async function writeAtomic(file: string, content: string | Buffer): Promise<void> {
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.tmp`);
  await fs.writeFile(tmp, content, 'utf8');
  await fs.rename(tmp, file);
}

// The start page's styles (src/overview/) and browser icons (public/overview), from the build
const ASSETS = ['overview.css', 'icon.svg', 'favicon.ico', 'apple-touch-icon.png'];

/** Copies the built files of the start page (dist/web/overview) next to index.html. */
async function copyAssets(assetDir: string, dataDir: string): Promise<void> {
  for (const name of ASSETS) {
    // Missing until "npm run build" ran (dev.sh does that first)
    const file = await fs.readFile(path.join(assetDir, name)).catch(() => null);
    if (!file) continue;
    const current = await fs.readFile(path.join(dataDir, name)).catch(() => null);
    if (!current?.equals(file)) await writeAtomic(path.join(dataDir, name), file);
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
  // The tile is a link to the app; the info button in its corner opens the details (only with
  // JavaScript, the script at the end shows it)
  return `    <div class="app" style="--c: ${esc(app.color)}" data-app="${esc(app.id)}"
         data-name="${esc(app.name)}" data-date="${published}" data-search="${esc(search)}">
      <a class="app-main" href="${app.id}/" data-open="${esc(app.id)}">
        ${icon}
        <span><span class="name">${esc(head)}<span>${craft}</span></span>
          <span class="desc">${desc}</span>
          <span class="meta">Version ${esc(app.version)}${date}</span></span>
      </a>
      <button type="button" class="app-info" data-details="${esc(app.id)}" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.6v.01"/></svg></button>
    </div>`;
}

/**
 * Public start page of nginx (/index.html) in German and English – the switch or else the
 * browser's language picks one, without JavaScript it's English. Plus its styles, its icons and
 * /status.json with the installed apps.
 */
export async function writeOverview(dataDir: string, apps: OverviewApp[], assetDir: string): Promise<void> {
  const cards = apps.length
    ? apps.map((app) => card(dataDir, app)).join('\n')
    : '    <p class="empty"><span data-lang="de">Noch keine Apps installiert.</span><span data-lang="en">No apps installed yet.</span></p>';
  // Everything the details need, as JSON in the page – "<" escaped, so no text can end the script
  const appData = JSON.stringify(
    Object.fromEntries(
      apps.map((app) => [
        app.id,
        {
          id: app.id,
          name: app.name,
          color: app.color,
          icon: existsSync(path.join(dataDir, 'icons', `${app.id}.png`)) ? `icons/${app.id}.png` : null,
          desc: { de: app.description, en: app.descriptionEn },
          version: app.version,
          tag: app.tag,
          publishedAt: app.publishedAt?.toISOString() ?? null,
          size: app.size,
          websiteUrl: app.websiteUrl,
          repoUrl: app.repoUrl,
          details: app.details,
        },
      ]),
    ),
  ).replace(/</g, '\\u003c');
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
    // Light or dark from the switch – without a choice the CSS follows the system
    let theme;
    try {
      theme = localStorage.getItem("craftapps.theme");
    } catch {
      // storage blocked
    }
    if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;
  }
</script>
<link rel="stylesheet" href="overview.css">
</head>
<body>
<main>
  <header>
    <h1>Craft Apps</h1>
    <div class="switches">
      <div class="switch theme-switch" role="group" hidden>
        <button type="button" data-theme="light"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg></button>
        <button type="button" data-theme="dark"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg></button>
        <button type="button" data-theme="system"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg></button>
      </div>
      <div class="switch lang-switch" role="group" hidden>
        <button type="button" lang="de" title="Deutsch">DE</button>
        <button type="button" lang="en" title="English">EN</button>
      </div>
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
  // Switches and dates – the dates are formatted in the language of the page as well
  {
    const html = document.documentElement;
    const group = document.querySelector(".lang-switch");
    const buttons = group.querySelectorAll("button");
    const themes = document.querySelector(".theme-switch");
    const THEME_NAMES = {
      de: { label: "Design", light: "Hell", dark: "Dunkel", system: "Wie das System" },
      en: { label: "Design", light: "Light", dark: "Dark", system: "As the system" },
    };
    const render = () => {
      const locale = html.lang === "de" ? "de-DE" : "en-GB";
      for (const t of document.querySelectorAll("time")) {
        const d = new Date(t.dateTime);
        if (!isNaN(d)) t.textContent = d.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
      }
      group.setAttribute("aria-label", html.lang === "de" ? "Sprache" : "Language");
      for (const b of buttons) b.setAttribute("aria-pressed", String(b.lang === html.lang));
      const names = THEME_NAMES[html.lang === "de" ? "de" : "en"];
      const theme = html.dataset.theme || "system";
      themes.setAttribute("aria-label", names.label);
      for (const b of themes.querySelectorAll("button")) {
        b.title = names[b.dataset.theme];
        b.setAttribute("aria-label", names[b.dataset.theme]);
        b.setAttribute("aria-pressed", String(b.dataset.theme === theme));
      }
    };
    for (const b of themes.querySelectorAll("button")) {
      b.addEventListener("click", () => {
        const theme = b.dataset.theme;
        if (theme === "system") delete html.dataset.theme;
        else html.dataset.theme = theme;
        try {
          if (theme === "system") localStorage.removeItem("craftapps.theme");
          else localStorage.setItem("craftapps.theme", theme);
        } catch {
          // not remembered then
        }
        render();
      });
    }
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
    themes.hidden = false;
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
    // Counts when an app is opened: its tile, or "Open" in the details
    document.addEventListener("click", (e) => {
      const link = e.target.closest("[data-open]");
      if (!link) return;
      const counts = usage();
      counts[link.dataset.open] = (counts[link.dataset.open] || 0) + 1;
      save("craftapps.usage", JSON.stringify(counts));
    });
    // The texts follow the language switch
    new MutationObserver(render).observe(html, { attributes: true, attributeFilter: ["lang"] });
    if (tiles.length) {
      select.value = sort;
      controls.hidden = false;
      render();
    }
  }
</script>
<script type="application/json" id="app-data">${appData}</script>
<script>
  // Details of an app: the info button on its tile opens them – the tile itself stays the link to
  // the app. Built from the data above with textContent only; Escape closes, the arrow keys page
  // through the apps as shown.
  {
    const html = document.documentElement;
    const data = JSON.parse(document.getElementById("app-data").textContent);
    const TEXTS = {
      de: { label: "App-Details", info: "Details zu {app}", prev: "Vorige App", next: "Nächste App", close: "Schließen", open: "Öffnen",
            versions: "Versionen", features: "Funktionen", release: "Neueste Version", version: "Version",
            published: "Veröffentlicht", download: "Herunterladen", platforms: "Plattformen",
            changelog: "Vollständiges Änderungsprotokoll", shotPrev: "Voriges Bild", shotNext: "Nächstes Bild" },
      en: { label: "App details", info: "Details of {app}", prev: "Previous app", next: "Next app", close: "Close", open: "Open",
            versions: "Versions", features: "Features", release: "Latest version", version: "Version",
            published: "Published", download: "Download", platforms: "Platforms",
            changelog: "Full changelog", shotPrev: "Previous picture", shotNext: "Next picture" },
    };
    const ICONS = { prev: '<path d="M15 5l-7 7 7 7"/>', next: '<path d="M9 5l7 7-7 7"/>', close: '<path d="M6 6l12 12M18 6L6 18"/>' };
    let current = null;
    let shot = 0;
    let opener = null;
    let backdrop = null;

    const el = (tag, props, ...children) => {
      const e = document.createElement(tag);
      for (const [k, v] of Object.entries(props || {})) {
        if (v === null || v === undefined || v === false) continue;
        if (k === "class") e.className = v;
        else if (k === "text") e.textContent = v;
        else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
        else e.setAttribute(k, v === true ? "" : v);
      }
      e.append(...children.filter((c) => c !== null && c !== undefined && c !== false));
      return e;
    };
    // The icons are fixed markup from above, never data
    const icon = (name) => {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("viewBox", "0 0 24 24");
      svg.setAttribute("aria-hidden", "true");
      svg.innerHTML = ICONS[name];
      return svg;
    };
    const shown = () => [...document.querySelectorAll(".grid .app:not([hidden])")].map((tile) => tile.dataset.app);

    function render() {
      const t = TEXTS[html.lang === "de" ? "de" : "en"];
      const locale = html.lang === "de" ? "de-DE" : "en-GB";
      const app = data[current];
      const d = app.details;
      const ids = shown();
      const at = ids.indexOf(current);
      const pad = (n) => String(n).padStart(2, "0");
      const date = app.publishedAt
        ? new Date(app.publishedAt).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" })
        : "–";
      const size = app.size ? Math.max(1, Math.round(app.size / 1e6)).toLocaleString(locale) + " MB" : "–";
      const [head, craft] = app.name.endsWith("Craft") ? [app.name.slice(0, -5), "Craft"] : [app.name, ""];
      const navButton = (name, onclick, enabled) =>
        el("button", { type: "button", title: t[name], "aria-label": t[name], disabled: !enabled, onclick }, icon(name));

      const shots = d ? d.shots.filter((s) => s.url) : [];
      shot = Math.min(shot, Math.max(0, shots.length - 1));
      const showShot = (i) => {
        shot = (i + shots.length) % shots.length;
        render();
      };
      const pictures = shots.length
        ? el("figure", { class: "shots" },
            el("div", { class: "shot-frame" },
              el("img", { src: shots[shot].url, alt: shots[shot].caption }),
              shots.length > 1 && el("button", { type: "button", class: "prev", "aria-label": t.shotPrev, onclick: () => showShot(shot - 1) }, icon("prev")),
              shots.length > 1 && el("button", { type: "button", class: "next", "aria-label": t.shotNext, onclick: () => showShot(shot + 1) }, icon("next"))),
            el("figcaption", { text: shots[shot].caption + " · " + (shot + 1) + "/" + shots.length }),
            shots.length > 1 && el("div", { class: "shot-thumbs" },
              ...shots.map((s, i) =>
                el("button", { type: "button", "aria-label": s.caption, "aria-pressed": String(i === shot), onclick: () => showShot(i) },
                  el("img", { src: s.url, alt: "" })))))
        : null;
      const features = d && d.features.length ? d.features : null;
      const section = el("section", { class: "details", role: "dialog", "aria-modal": "true", "aria-labelledby": "details-name",
                                      style: "--c: " + app.color },
        el("div", { class: "details-head" },
          el("div", { class: "details-bar" },
            el("span", { class: "details-label", text: t.label }),
            el("div", { class: "details-nav" },
              navButton("prev", () => go(-1), at > 0),
              navButton("next", () => go(1), at >= 0 && at < ids.length - 1),
              navButton("close", close, true))),
          el("div", { class: "details-title" },
            app.icon ? el("img", { class: "details-icon", src: app.icon, alt: "" })
                     : el("span", { class: "details-icon", text: app.name.charAt(0) }),
            el("div", {},
              el("h2", { id: "details-name" }, head, el("span", { text: craft })),
              el("p", { class: "details-headline", text: d ? d.headline : app.desc[html.lang === "de" ? "de" : "en"] }),
              el("p", { class: "details-meta", text: "Version " + app.version + " · " + date })),
            el("a", { class: "details-open-app", href: app.id + "/", "data-open": app.id, text: t.open })),
          el("nav", { class: "details-links" },
            el("a", { href: app.websiteUrl, target: "_blank", rel: "noreferrer", text: "Website ↗" }),
            el("a", { href: app.repoUrl, target: "_blank", rel: "noreferrer", text: "GitHub ↗" }),
            el("a", { href: app.repoUrl + "/releases", target: "_blank", rel: "noreferrer", text: t.versions + " ↗" }))),
        el("div", { class: "details-body" },
          (pictures || (d && d.paragraphs.length)) &&
            el("div", { class: "details-about" }, pictures, ...(d ? d.paragraphs.map((p) => el("p", { text: p })) : [])),
          features && el("section", { class: "details-features" },
            el("h3", { text: "01 / " + t.features }),
            el("ol", {}, ...features.map((f, i) =>
              el("li", {}, el("strong", {}, el("span", { text: pad(i + 1) }), f.title), el("p", { text: f.text }))))),
          el("section", { class: "details-release" },
            el("h3", { text: pad(features ? 2 : 1) + " / " + t.release }),
            el("dl", {},
              el("div", {}, el("dt", { text: t.version }), el("dd", { text: app.version })),
              el("div", {}, el("dt", { text: t.published }), el("dd", { text: date })),
              el("div", {}, el("dt", { text: t.download }), el("dd", { text: size })),
              el("div", {}, el("dt", { text: t.platforms }), el("dd", { text: d ? d.platforms : "–" }))),
            el("a", { href: app.repoUrl + "/releases/tag/" + encodeURIComponent(app.tag), target: "_blank", rel: "noreferrer",
                      text: t.changelog + " ↗" }))));
      const focused = backdrop && document.activeElement && backdrop.contains(document.activeElement)
        ? document.activeElement.getAttribute("aria-label") : null;
      backdrop.replaceChildren(section);
      // After paging the focus stays on the same button, as far as there is one
      const again = focused && section.querySelector('[aria-label="' + focused.replace(/"/g, "") + '"]:not([disabled])');
      (again || section.querySelector(".details-nav button:last-child")).focus();
    }

    function open(id) {
      opener = document.activeElement;
      current = id;
      shot = 0;
      backdrop = el("div", { class: "details-backdrop", onmousedown: (e) => e.target === backdrop && close() });
      document.body.append(backdrop);
      document.body.classList.add("details-open");
      render();
    }

    function close() {
      backdrop.remove();
      backdrop = null;
      current = null;
      document.body.classList.remove("details-open");
      if (opener) opener.focus();
    }

    function go(step) {
      const ids = shown();
      const next = ids[ids.indexOf(current) + step];
      if (!next) return;
      current = next;
      shot = 0;
      render();
    }

    const infos = document.querySelectorAll(".app-info");
    for (const info of infos) info.addEventListener("click", () => open(info.dataset.details));
    // The info buttons are named in the language of the page
    const name = () => {
      for (const info of infos) {
        const label = TEXTS[html.lang === "de" ? "de" : "en"].info.replace("{app}", data[info.dataset.details].name);
        info.title = label;
        info.setAttribute("aria-label", label);
      }
    };
    document.addEventListener("keydown", (e) => {
      if (!current) return;
      if (e.key === "Escape") close();
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowRight") go(1);
    });
    new MutationObserver(() => {
      name();
      if (current) render();
    }).observe(html, { attributes: true, attributeFilter: ["lang"] });
    name();
    for (const info of infos) info.hidden = false;
  }
</script>
</body>
</html>
`;
  const status = {
    generatedAt: new Date().toISOString(),
    apps: apps.map((a) => ({ app: a.id, name: a.name, version: a.version, publishedAt: a.publishedAt?.toISOString() ?? null })),
  };
  await copyAssets(assetDir, dataDir);
  await writeAtomic(path.join(dataDir, 'index.html'), page);
  await writeAtomic(path.join(dataDir, 'status.json'), JSON.stringify(status, null, 2));
}
