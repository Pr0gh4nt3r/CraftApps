#!/usr/bin/env bash
# ------------------------------------------------------------
#  Local test run: MySQL, admin UI and start page with one command
#    ./dev.sh
#
#  Admin UI:   http://localhost:5173 (Vite, picks up changes right away)
#  Start page: http://localhost:8080 (nginx with nginx.conf, as on the Pi)
#  Another port for the start page: START_PAGE_PORT=8090 ./dev.sh
#  Ctrl+C stops everything again – MySQL only if this script started it.
# ------------------------------------------------------------
set -euo pipefail
cd "$(dirname "$0")"

compose=(docker compose -f docker-compose.dev.yml)
nginx_name=craftapps-dev-nginx
port=${START_PAGE_PORT:-8080}

for tool in docker npm setsid; do
  if ! command -v "$tool" >/dev/null; then
    echo "$tool fehlt – siehe README, Abschnitt Entwicklung" >&2
    exit 1
  fi
done
# The server would only log the busy port and keep waiting for changes
if (: >/dev/tcp/127.0.0.1/3000) 2>/dev/null; then
  echo "Port 3000 ist schon belegt – läuft der Server schon, z.B. über VS Code?" >&2
  exit 1
fi

pids=()
started_mysql=
cleanup() {
  echo
  echo "Beende Server, Oberfläche und nginx …"
  # Each runs in its own process group – the minus sign stops the whole group
  for pid in "${pids[@]}"; do
    kill -TERM -- "-$pid" 2>/dev/null || true
  done
  docker rm -f "$nginx_name" >/dev/null 2>&1 || true
  if [ -n "$started_mysql" ]; then
    echo "Stoppe MySQL …"
    "${compose[@]}" stop
  fi
  wait
}
trap cleanup EXIT
trap 'exit 130' INT TERM

# MySQL is only stopped at the end if it wasn't running before
if [ -z "$("${compose[@]}" ps --quiet --status running mysql)" ]; then
  echo "Starte MySQL …"
  "${compose[@]}" up -d
  started_mysql=1
fi

# After a fresh clone or a changed package-lock.json
if [ admin/package-lock.json -nt admin/node_modules/.package-lock.json ]; then
  echo "Installiere Abhängigkeiten …"
  npm --prefix admin ci
fi
if [ ! -f admin/.env ]; then
  cp admin/.env.example admin/.env
  echo "admin/.env aus .env.example angelegt"
fi

# The admin writes the start page and the apps into admin/data. Create it first – otherwise
# Docker would create it as root for the bind mount, and the admin couldn't write to it.
mkdir -p admin/data
docker rm -f "$nginx_name" >/dev/null 2>&1 || true
docker run -d --rm --name "$nginx_name" -p "127.0.0.1:$port:80" \
  -v "$PWD/nginx.conf:/etc/nginx/conf.d/default.conf:ro" \
  -v "$PWD/admin/data:/srv/craftapps:ro" \
  nginx:alpine >/dev/null

# Server (restarts on changes) and Vite, each in its own process group so that stopping them
# takes their child processes along. --strictPort: fail instead of moving to another port.
setsid npm --prefix admin run dev:server </dev/null &
pids+=($!)
setsid npm --prefix admin run dev:web -- --strictPort </dev/null &
pids+=($!)

echo "Verwaltung: http://localhost:5173 · Startseite: http://localhost:$port · beenden mit Strg+C"
echo "Anmelden mit INITIAL_ADMIN_USER und INITIAL_ADMIN_PASSWORD aus admin/.env"

# Runs until Ctrl+C – or until the server or Vite stops by itself
wait -n "${pids[@]}" || true
echo "Server oder Oberfläche hat sich beendet"
