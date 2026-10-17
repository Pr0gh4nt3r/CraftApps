# CLAUDE.md

Notes for Claude in this repo. The general commit rules are in `~/.claude/CLAUDE.md`.

## Checks before every commit

For the changed files, each without errors:

- **`admin/`:** run `npm run lint` (ESLint) and `npm run build` (`tsc` for UI and server,
  Vite build as in CI) there. Run `npm ci` first if `node_modules` is missing.
- **`compose.yaml`, `compose.dev.yaml`:** `docker compose -f <file> config -q`; for
  `compose.yaml`, set the required variables `CRAFTAPPS_*` to placeholders.
- **`nginx.conf`:** `nginx -t` in the container `nginx:alpine`, with the file mounted as
  `/etc/nginx/conf.d/default.conf`.
- **`.gitea/workflows/*.yaml`, `.github/workflows/*.yaml`:** valid YAML.

## Running locally

See README, section "Development": MySQL from `compose.dev.yaml`, then `npm run dev:server`
and `npm run dev:web` in `admin/`.

## Documentation

Besides the READMEs, the comments in `compose.yaml`, `nginx.conf`, `admin/Dockerfile` and in
the workflows for Gitea and GitHub explain how everything fits together – keep them up to
date with every change.

## Language

Comments in code and configuration – including the code examples in the READMEs – always in
English. The README exists in English (`README.md`, shown by default) and in German
(`README.de.md`) – keep both in sync. UI and messages stay in German.

## Push

A push to `main` goes straight into production: on changes in `admin/`, GitHub Actions (via
the mirror from Gitea to GitHub) and Gitea Actions build the admin image, and Watchtower
deploys the image from `ghcr.io`. Portainer redeploys changes to `compose.yaml` or
`nginx.conf`.
