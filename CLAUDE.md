# CLAUDE.md

Notes for Claude in this repo. The general commit rules are in `~/.claude/CLAUDE.md`.

## Checks before every commit

For the changed files, each without errors:

- **`admin/`:** run `npm run lint` (ESLint) and `npm run build` (`tsc` for UI and server,
  Vite build as in CI) there. Run `npm ci` first if `node_modules` is missing.
- **`docker-compose.yml`, `docker-compose.dev.yml`:** `docker compose -f <file> config -q`;
  for `docker-compose.yml`, set the required variables `CRAFTAPPS_*` to placeholders.
- **`nginx.conf`:** `nginx -t` in the container `nginx:alpine`, with the file mounted as
  `/etc/nginx/conf.d/default.conf`.
- **`.gitea/workflows/*.yaml`, `.github/workflows/*.yaml`:** valid YAML.
- **`dev.sh`:** `bash -n dev.sh` and shellcheck, e.g.
  `docker run --rm -v "$PWD:/mnt" koalaman/shellcheck:stable dev.sh`.

## Running locally

`./dev.sh` starts MySQL from `docker-compose.dev.yml`, server and Vite in `admin/` and nginx
for the start page; Ctrl+C stops everything again. The single steps are in the README,
section "Development".

## Documentation

Besides the READMEs, the comments in `docker-compose.yml`, `nginx.conf`, `dev.sh`,
`admin/Dockerfile` and in the workflows for Gitea and GitHub explain how everything fits
together – keep them up to date with every change. Screenshots in `docs/images/` only show
example values such as `gitea.example.com` and the account `user`, never real domains or
accounts.

## Styles

The admin UI's styles are SCSS, compiled by Vite with `sass`. Each component keeps its partial
in its own folder (`admin/src/web/App/`, `components/*/`, `pages/*/`); `admin/src/web/styles/`
holds the global ones: `_shared.scss` with everything that recurs (colors, hairlines, the
breakpoints, tone colors, the label mixin), plus base, buttons, page frame, forms and tables.
`styles/index.scss` loads all partials – add new ones there; their order is the cascade order,
so on equal specificity a later partial wins. Colors stay CSS custom properties – React sets
the app color `--c` at runtime. The start page's CSS sits inline in the HTML that
`admin/src/server/apps/overview.ts` generates.

## Icons

`admin/public/icon.svg` (admin UI) and `admin/public/overview/icon.svg` (start page; the
admin copies this set into the data volume) are the sources. `favicon.ico` (16, 32 and
48 px) and `apple-touch-icon.png` (180 px, the same motif on a square background) next to
them are rendered from the SVGs, e.g. with `rsvg-convert` – always update all three
together.

## Language

Comments in code and configuration – including the code examples in the READMEs – always in
English. The README exists in English (`README.md`, shown by default) and in German
(`README.de.md`) – keep both in sync. The labels in the READMEs' Mermaid diagrams follow the
language of the respective README, as do the screenshots of the admin UI and the start page
(`docs/images/*-en.png` and `*-de.png`).

The admin UI and the start page exist in German and English. UI texts live in
`admin/src/web/i18n/locales/de.json` and `en.json`, messages the server generates (activity
log, errors, job progress, notifications) in `admin/src/shared/messages.ts` as key +
parameters – add every new text in both languages. Log messages, the output of `dev.sh` and
the workflows' step names stay German.

## Notification channels

The channel types and their fields are defined once in `admin/src/shared/channels.ts`: the
server checks and sends with them (`admin/src/server/notify/`), the UI builds its form from
them. A new type needs an entry there, a driver in `notify/drivers.ts` and its texts in both
locales – `channels.type.<type>`, `channels.field.<type>.<key>` and optionally
`channels.hint.<type>.<key>`; a missing label fails the build. Secret fields never go back to
the UI.

## Push

A push to `main` goes straight into production: on changes in `admin/`, GitHub Actions (via
the mirror from Gitea to GitHub) and Gitea Actions build the admin image. Watchtower deploys
the image from `ghcr.io` and Portainer redeploys changes to `docker-compose.yml` or
`nginx.conf` – or, with the repo secret `PORTAINER_WEBHOOK`, Portainer deploys everything
right after the workflow.
