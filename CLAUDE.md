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
language of the respective README.

The admin UI and the start page exist in German and English. UI texts live in
`admin/src/web/locales/de.json` and `en.json`, messages the server generates (activity log,
errors, job progress, Gotify notifications) in `admin/src/shared/messages.ts` as key +
parameters – add every new text in both languages. Log messages, the output of `dev.sh` and
the workflows' step names stay German.

## Push

A push to `main` goes straight into production: on changes in `admin/`, GitHub Actions (via
the mirror from Gitea to GitHub) and Gitea Actions build the admin image. Watchtower deploys
the image from `ghcr.io` and Portainer redeploys changes to `docker-compose.yml` or
`nginx.conf` – or, with the repo secret `PORTAINER_WEBHOOK`, Portainer deploys everything
right after the workflow.
