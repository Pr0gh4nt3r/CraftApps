# CLAUDE.md

Hinweise für Claude in diesem Repo. Die allgemeinen Commit-Regeln stehen in
`~/.claude/CLAUDE.md`.

## Prüfungen vor jedem Commit

Für die geänderten Dateien, jeweils fehlerfrei:

- **`admin/`:** dort `npm run lint` (ESLint) und `npm run build` (`tsc` für Oberfläche und
  Server, Vite-Build wie im CI). Vorher `npm ci`, falls `node_modules` fehlt.
- **`compose.yaml`, `compose.dev.yaml`:** `docker compose -f <Datei> config -q`; für
  `compose.yaml` die Pflichtvariablen `CRAFTAPPS_*` mit Platzhaltern setzen.
- **`nginx.conf`:** `nginx -t` im Container `nginx:alpine`, die Datei eingebunden als
  `/etc/nginx/conf.d/default.conf`.
- **`.gitea/workflows/*.yaml`:** gültiges YAML.

## Lokal starten

Siehe README, Abschnitt „Entwicklung“: MySQL aus `compose.dev.yaml`, dann in `admin/`
`npm run dev:server` und `npm run dev:web`.

## Doku

Neben der README erklären die Kommentare in `compose.yaml`, `nginx.conf`, `admin/Dockerfile`
und im Gitea-Workflow, wie alles zusammenspielt – bei Änderungen mitpflegen.

## Push

Ein Push nach `main` geht direkt in Betrieb: Bei Änderungen in `admin/` baut Gitea Actions
das Image der Verwaltung, und Watchtower spielt es ein; Änderungen an `compose.yaml` oder
`nginx.conf` deployt Portainer neu.
