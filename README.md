# CraftApps

**English** | [Deutsch](README.de.md)

Self-hosted web versions of the craft apps by [storytold](https://github.com/storytold)
(PhotoCraft, VectorCraft, FilmCraft, …) on a Raspberry Pi, with an admin UI in the style of
the Craft Launcher:

- **nginx** serves the installed apps (`/photocraft/`, `/vectorcraft/`, …) and shows an
  overview at `/`.
- **The admin UI** (Node.js/TypeScript) lists all available apps, installs and removes
  them, applies updates automatically or at the push of a button and reports everything
  via Gotify. Its user interface is in German.

## Contents

- [Structure](#structure)
- [How everything fits together](#how-everything-fits-together)
- [What the admin UI can do](#what-the-admin-ui-can-do)
- [Setup](#setup)
- [Operation](#operation)
- [Notifications](#notifications)
- [Good to know](#good-to-know)
- [Development](#development)
- [Containers](#containers)

## Structure

```text
CraftApps\
├── .gitea\workflows\admin-image.yaml   Also builds the image in Gitea (optional)
├── .github\workflows\admin-image.yaml  Builds the admin image (ARM64) to ghcr.io when admin\ changes
├── .vscode\                            Launch and debug in VS Code, recommended extensions
├── admin\                              Admin UI: Fastify server and React frontend
│   ├── Dockerfile
│   └── src\
│       ├── server\                     API, login, installer, GitHub, Gotify
│       ├── shared\                     Types shared by server and frontend
│       └── web\                        Frontend
├── compose.dev.yaml                    MySQL for local development
├── compose.yaml                        Stack for Portainer: nginx and admin UI
└── nginx.conf                          nginx configuration
```

## How everything fits together

```text
Push to the repo
 ├─ admin\ changed  ─> GitHub Actions builds the image ─> ghcr.io ─> Watchtower updates CraftApps-Admin
 └─ compose.yaml or nginx.conf changed ─> Portainer pulls the repo (GitOps) and redeploys the stack

Admin UI ─> GitHub: new apps and releases ─> downloads <app>-web-*.zip into the volume craftapps_data ─> nginx serves it
         └─> Gotify: push notification

Browser ─> <host>:8085  ─> nginx (CraftApps)
        └─> <host>:8086 ─> admin UI (CraftApps-Admin)
```

- By default, apps and admin UI are only reachable in the local network via the Pi's
  ports. A reverse proxy such as Zoraxy makes them public with your own domains and HTTPS,
  see [step 5](#5-https-via-reverse-proxy-optional).
- Portainer can't build images from a Git repo itself
  ([Portainer FAQ](https://docs.portainer.io/2.39-lts/faqs/troubleshooting/stacks-deployments-and-updates/can-i-build-an-image-while-deploying-a-stack-application-from-git)).
  That's why GitHub Actions builds the image and the compose file only references it.
- If the repo lives in Gitea, Gitea mirrors it to GitHub. Gitea Actions can additionally
  build the image into the Gitea registry, see
  [Building the image yourself](#building-the-image-yourself).
- `nginx.conf` is bind-mounted straight from the repo. That only works with
  "Enable relative path volumes" of Portainer Business Edition
  ([Portainer docs](https://docs.portainer.io/advanced/relative-paths)).
- nginx is the official image `nginx:alpine`, Watchtower keeps it up to date.

## What the admin UI can do

- **Apps** in a grid like the Craft Launcher – with its icons, brand colors and German
  texts: install, update, reinstall, uninstall, toggle automatic updates per app.
- **New apps** it finds by itself: all storytold repos ending in `craft` whose latest
  release has a `<app>-web-*.zip`. New apps are reported and, if you like, installed
  automatically.
- **Updates without interruption:** new files go next to the old ones, `index.html` is
  switched last, the previous version stays until the next update. Every download is
  verified via SHA-256.
- **Login** with users in MySQL, activity log, settings (check interval, Gotify,
  addresses) and user management.
- **Push notifications** via Gotify, see [Notifications](#notifications).

Data: users, settings and history live in MySQL, the apps in the volume `craftapps_data`,
which nginx mounts read-only.

## Setup

The steps build on each other. How each container is set up is collected under
[Containers](#containers); the steps link there where needed. The admin image is available
ready-made as `ghcr.io/pr0gh4nt3r/craftapps-admin:latest`, you don't have to build it
yourself.

Addresses, commands and templates contain placeholders for your values:

| Placeholder        | Meaning                                            | Example                                 |
| ------------------ | -------------------------------------------------- | --------------------------------------- |
| `<host>`           | Address of the Pi in the local network             | `192.168.1.10`                          |
| `<repo-url>`       | Address of the repo for cloning                    | `https://github.com/user/CraftApps.git` |
| `<apps-domain>`    | Domain for the apps                                | `craft.example.com`                     |
| `<admin-domain>`   | Domain for the admin UI                            | `craft-admin.example.com`               |
| `<github-account>` | Your GitHub account, in lowercase                  | `user`                                  |
| `<gitea-host>`     | Address of your Gitea instance, without `https://` | `gitea.example.com`                     |
| `<owner>`          | Gitea account that owns the repo                   | `user`                                  |

You only need the domains for
[HTTPS via reverse proxy](#5-https-via-reverse-proxy-optional), the last three only if you
[build the image yourself](#building-the-image-yourself).

### Prerequisites

- **Raspberry Pi** with a 64-bit OS and Docker. The admin image exists for ARM64 only.
- **Portainer Business Edition.** Only it can mount `nginx.conf` straight from the repo
  ("Enable relative path volumes").
- **A Git repo with this project** that Portainer pulls the stack from: the public one on
  GitHub or your own, e.g. a fork or a repo in Gitea.
- **On the Pi** MySQL and Watchtower, optionally Zoraxy and Gotify. What CraftApps needs
  from them – and templates in case something is missing – is described under
  [Containers](#containers).

### 1. Create the database

In the `MySQL` container, e.g. in Portainer under **Containers → MySQL → Console** with
`mysql -uroot -p`:

```sql
CREATE DATABASE craftapps CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'craftapps'@'%' IDENTIFIED BY 'a-long-password';
GRANT ALL PRIVILEGES ON craftapps.* TO 'craftapps'@'%';
```

You need the password in step 3 as `CRAFTAPPS_DB_PASSWORD`. The admin UI creates the tables
itself on its first start.

### 2. Make the database reachable

The stack gets its own Docker network. The admin UI therefore reaches MySQL via the address
in `CRAFTAPPS_DB_HOST`, and there are two ways to do that:

- **Via the Pi:** MySQL publishes port `3306` on the Pi, `CRAFTAPPS_DB_HOST` is then
  `<host>`. The [MySQL template](#mysql) does it this way.
- **Via a shared network:** `CraftApps-Admin` additionally joins the MySQL network,
  `CRAFTAPPS_DB_HOST` is then the name of the MySQL container. This needs an addition to
  `compose.yaml`, see [Shared network](#shared-network-optional).

### 3. Create the stack in Portainer

Create the stack `craftapps` as described under
[CraftApps and CraftApps-Admin](#craftapps-and-craftapps-admin). Afterwards the containers
`CraftApps` and `CraftApps-Admin` are running, and the admin UI's log says
"Benutzer admin angelegt" (user admin created).

### 4. First login

Open `http://<host>:8086` and log in with `admin` and the password from
`CRAFTAPPS_ADMIN_PASSWORD`. Under **Einstellungen** (settings), enter:

- **Öffentliche Adresse der Apps** (public address of the apps): `http://<host>:8085`,
  with a reverse proxy `https://<apps-domain>` – for the "Öffnen" (open) buttons
- **Adresse dieser Verwaltung** (address of this admin UI): `http://<host>:8086` or
  `https://<admin-domain>` – opens when a notification is tapped
- **Gotify-Server** and **App-Token**, see [Gotify](#gotify), then
  **Testnachricht senden** (send test message)

About ten seconds after the start, the admin UI queries GitHub for the first time and then
shows all available apps. Finally, install an app and open it at `http://<host>:8085`.

### 5. HTTPS via reverse proxy (optional)

Browsers only allow WebGPU and the clipboard in a secure context, i.e. via HTTPS or
directly on `localhost`. Via `http://<host>:8085` the apps run, just without these
features. A reverse proxy in front adds HTTPS and your own domains, e.g. [Zoraxy](#zoraxy)
with certificates from Let's Encrypt:

| Domain           | Target        | Purpose  |
| ---------------- | ------------- | -------- |
| `<apps-domain>`  | `<host>:8085` | Apps     |
| `<admin-domain>` | `<host>:8086` | Admin UI |

Then switch both addresses in the admin UI's settings to `https://`.

### Building the image yourself

Only needed if you don't want to use the ready-made image. Both ways rebuild on every
change in `admin\`, the GitHub workflow additionally early on Mondays for security updates.
In the stack, `CRAFTAPPS_ADMIN_IMAGE` then points to your image.

#### On GitHub

The workflow [.github/workflows/admin-image.yaml](.github/workflows/admin-image.yaml)
builds in every GitHub repo with this project, such as a fork, to
`ghcr.io/<github-account>/craftapps-admin`. It runs natively on a GitHub ARM64 runner and
needs no secret.

1. In a fork, allow the workflows once under **Actions**.
2. Start the first build under **Actions → Verwaltung bauen → Run workflow**.
3. The package appears in your profile under **Packages** and inherits the repo's
   visibility. If it is private, set it to **Public** under
   **Package settings → Change visibility**, otherwise Portainer and Watchtower need
   credentials.
4. In the stack, set `CRAFTAPPS_ADMIN_IMAGE` to
   `ghcr.io/<github-account>/craftapps-admin:latest`.

**Mirror from Gitea:** If the repo lives in Gitea, add a push mirror to the GitHub repo in
the repo's **Settings** under the mirror settings and enable syncing on every push. The
GitHub token for it needs **Contents** and **Workflows**, both with read and write access.
Without **Workflows**, GitHub rejects every push that changes `.github/workflows/`.

#### In Gitea

The workflow [.gitea/workflows/admin-image.yaml](.gitea/workflows/admin-image.yaml) builds
to `<gitea-host>/<owner>/craftapps-admin`.

1. **Enable Actions:** Actions and packages (the container registry) are enabled by
   default in current Gitea versions. Otherwise set `ENABLED = true` under `[actions]` and
   `[packages]` in `app.ini`, in a container via `GITEA__actions__ENABLED=true` and
   `GITEA__packages__ENABLED=true`, and restart Gitea. If the repo has no **Actions** tab,
   enable it for the repo under **Settings**.
2. **Set up a runner** as described under [Gitea runner](#gitea-runner), until it shows up
   as online in Gitea.
3. **Token for the build:** in Gitea, with the account `<owner>`, create a token with
   **package: Read and Write** under **Settings → Applications**, e.g. `craftapps-build`,
   and add it in the repo under **Settings → Actions → Secrets** as the secret
   `REGISTRY_TOKEN`.
4. **Build the image:** under **Actions → Verwaltung bauen → Run workflow**. The first run
   downloads the runner's job image, about 0.5 GB. Afterwards the image is in your Gitea
   profile under **Packages**: `<gitea-host>/<owner>/craftapps-admin:latest`. The workflow
   writes the owner in lowercase because Docker doesn't allow uppercase letters in image
   names.
5. **Read access for Portainer and Watchtower,** if the packages aren't public – e.g.
   because your Gitea instance requires a login: create a token with **package: Read**,
   e.g. `pi-read`, and add it in Portainer under
   **Registries → Add registry → Custom registry**: name `Gitea`, registry URL
   `<gitea-host>`, **Authentication** on, user `<owner>`, the token as password.
   Watchtower gets it as `config.json`, see [Watchtower](#watchtower).
6. In the stack, set `CRAFTAPPS_ADMIN_IMAGE` to
   `<gitea-host>/<owner>/craftapps-admin:latest`.

## Operation

| You change …     | What happens                                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------------- |
| Code in `admin\` | GitHub Actions builds a new image, Watchtower deploys it.                                                           |
| `compose.yaml`   | Portainer redeploys the stack within the polling interval.                                                          |
| `nginx.conf`     | Portainer pulls the new file. Then restart the `CraftApps` container – nginx only reads it at startup.              |
| nothing          | Early on Mondays GitHub Actions rebuilds (security updates for Node and Alpine), Watchtower keeps nginx up to date. |

- **Without Watchtower** or to avoid waiting: in Portainer **Containers → CraftApps-Admin →
  Recreate** with **Re-pull image**.
- **A manual build:** on GitHub under **Actions → Verwaltung bauen → Run workflow**.
- **Scheduled runs** are paused by GitHub if nothing happens in the repo for 60 days. They
  can be re-enabled under **Actions**.

## Notifications

| Event                                                                          | Gotify priority |
| ------------------------------------------------------------------------------ | --------------- |
| New app available (on the very first start and as a summary from four at once) | 5               |
| Update available – only for apps with automatic updates turned off             | 5               |
| Update applied (automatically or by button), new app installed automatically   | 4               |
| Error – each error once, not again on every check                              | 8               |

Each category can be turned off in the settings. Tapping a notification opens the admin
UI.

## Good to know

- Each check needs about 16 requests to the GitHub API. Without a token GitHub allows 60
  per hour; for check intervals below about 20 minutes set `GITHUB_TOKEN` in
  `compose.yaml`.
- Login: at most 10 attempts per 15 minutes and IP address.
- The admin UI takes order, names, colors, German texts and icons from the
  [Craft Launcher](https://github.com/storytold/craft-launcher). If it is unreachable, the
  last known state applies.
- The admin container runs as user 1000 with a read-only file system and without Linux
  capabilities. A new volume `craftapps_data` belongs to this user automatically. If the
  admin UI still reports missing write access, run
  `sudo chown -R 1000:1000 /var/lib/docker/volumes/craftapps_data/_data` on the Pi.

## Development

Meant for Linux or WSL with Node.js 24 and Docker. On WSL the repo belongs in the Linux file
system (not under `/mnt/c`), otherwise Vite doesn't reliably notice changes. Docker runs
there either directly in the distribution or via Docker Desktop with WSL integration
enabled for the distribution, but not both.

```bash
docker compose -f compose.dev.yaml up -d   # MySQL for development
cd admin
npm ci
cp .env.example .env                       # once; matches compose.dev.yaml
npm run dev:server                         # server, restarts on changes
npm run dev:web                            # second terminal: UI at http://localhost:5173
```

Log in with `admin` and the password from `.env`. Installed apps end up in `admin/data`.

**Debugging in VS Code:** under **Run and Debug**, start "Server und Oberfläche" (server
and frontend). That starts both; breakpoints work directly in the server's TypeScript.
Debug the frontend with the browser's developer tools.

**Checks** – must pass without errors before every commit:

```bash
npm run lint    # ESLint, warnings count as errors
npm run build   # tsc for UI and server, Vite build as in CI
```

## Containers

All containers run on the Pi and are created in Portainer as stacks. `CraftApps` and
`CraftApps-Admin` are CraftApps itself; you only need the `gitea-runner` to build the image
in Gitea. For the others you'll find what CraftApps needs from them and a template in case
one is missing.

| Container         | Image                                       | Task                                |
| ----------------- | ------------------------------------------- | ----------------------------------- |
| `CraftApps`       | `nginx:alpine`                              | serves the apps                     |
| `CraftApps-Admin` | `ghcr.io/pr0gh4nt3r/craftapps-admin:latest` | the admin UI                        |
| `gitea-runner`    | `gitea/act_runner:latest`                   | builds the image in Gitea, optional |
| `MySQL`           | e.g. `mysql:8.4`                            | users, settings and history         |
| Watchtower        | e.g. `nickfedor/watchtower:latest`          | deploys new images                  |
| Zoraxy            | e.g. `zoraxydocker/zoraxy:latest`           | domains and HTTPS, optional         |
| Gotify            | e.g. `gotify/server:latest`                 | push notifications, optional        |

### CraftApps and CraftApps-Admin

Both are defined in [compose.yaml](compose.yaml) and run as the stack `craftapps`.
Portainer pulls the file from the repo and redeploys on every change.

**Create the stack:** in Portainer under **Stacks → Add stack**:

- **Name:** `craftapps`
- **Build method:** **Repository**
- **Repository URL:** `<repo-url>`
- **Authentication**, if the repo isn't public: user and a token with read access to the
  repo – in Gitea with **repository: Read**, on GitHub a fine-grained token with
  **Contents: Read**
- **Repository reference:** `refs/heads/main`
- **Compose path:** `compose.yaml`
- **GitOps updates** on, mechanism **Polling**, interval `5m`
- **Enable relative path volumes** on, **Local filesystem path** e.g. `/opt/stacks`.
  Portainer clones the repo there, nginx gets `nginx.conf` from there.
- **Environment variables:**

  | Variable                   | Value                                                                 |
  | -------------------------- | --------------------------------------------------------------------- |
  | `CRAFTAPPS_DB_HOST`        | Address of the database, see [step 2](#2-make-the-database-reachable) |
  | `CRAFTAPPS_DB_PASSWORD`    | Password from [step 1](#1-create-the-database)                        |
  | `CRAFTAPPS_ADMIN_PASSWORD` | Password for the first account `admin`, at least 10 characters        |
  | `CRAFTAPPS_WEB_PORT`       | only for a different apps port than `8085`                            |
  | `CRAFTAPPS_ADMIN_PORT`     | only for a different admin UI port than `8086`                        |
  | `CRAFTAPPS_DB_PORT`        | only if MySQL doesn't listen on port `3306`                           |
  | `CRAFTAPPS_ADMIN_IMAGE`    | only for your [own image](#building-the-image-yourself)               |

Then **Deploy the stack**.

**What compose.yaml contains:**

|                         | `CraftApps`                    | `CraftApps-Admin`                                                      |
| ----------------------- | ------------------------------ | ---------------------------------------------------------------------- |
| Image                   | `nginx:alpine`                 | `ghcr.io/pr0gh4nt3r/craftapps-admin:latest` or `CRAFTAPPS_ADMIN_IMAGE` |
| Port on the Pi          | `8085`                         | `8086`                                                                 |
| Volume `craftapps_data` | at `/srv/craftapps`, read-only | at `/data`                                                             |
| Updates                 | Watchtower                     | Watchtower, after every build                                          |

- nginx reads `nginx.conf` only at startup: restart the `CraftApps` container after a
  change.
- The admin UI connects to MySQL via `CRAFTAPPS_DB_HOST` and only creates the account
  `admin` while there is no user yet.
- It runs as user 1000 with a read-only file system, without Linux capabilities and with
  `no-new-privileges`. Docker checks via `/healthz` whether it is running.
- Optionally `GITHUB_TOKEN` for check intervals below about 20 minutes, see
  [Good to know](#good-to-know).

### Gitea runner

Only for the [image in Gitea](#in-gitea): the runner builds it whenever `admin\` changes.
On the Pi it builds natively for ARM64; on another machine the workflow emulates ARM64 via
QEMU, which takes considerably longer.

1. **Get a registration token:** in Gitea, in the repo under **Settings → Actions →
   Runners → Create new Runner**. A runner at repo level only runs this repo's workflows.
2. **Create the stack:** in Portainer under **Stacks → Add stack** a stack `gitea-runner`
   with the **Web editor**:

   ```yaml
   services:
     runner:
       image: gitea/act_runner:latest
       container_name: gitea-runner
       restart: unless-stopped
       environment:
         GITEA_INSTANCE_URL: https://<gitea-host>
         GITEA_RUNNER_REGISTRATION_TOKEN: "<registration-token>"
         GITEA_RUNNER_NAME: pi
         GITEA_RUNNER_LABELS: ubuntu-latest:docker://gitea/runner-images:ubuntu-latest
       volumes:
         - runner-data:/data
         - /var/run/docker.sock:/var/run/docker.sock

   volumes:
     runner-data:
   ```

   The workflow requires the label `ubuntu-latest`. Its jobs therefore run in the image
   `gitea/runner-images:ubuntu-latest`, which exists for ARM64 and includes the Docker CLI
   and Buildx. The build uses the Pi's Docker via the mounted socket.

3. **Check:** under **Settings → Actions → Runners** the runner `pi` shows up as online.
4. **Remove the registration token again:** the runner has now stored its own credentials
   in the volume `runner-data` and only registers again if they are missing. Delete the
   line `GITEA_RUNNER_REGISTRATION_TOKEN` in the stack and **Update the stack**.
   `GITEA_RUNNER_LABELS` stays, the runner applies the labels on every start. Optionally
   reset the registration token in Gitea – the runner logs in with its own credentials and
   keeps running.

> The runner can control Docker on the Pi. Only let it run workflows from repos you trust.
>
> Don't delete the volume `runner-data` along with the stack. Otherwise the runner has to
> register again with a new registration token; then delete the old entry under
> **Settings → Actions → Runners**.

### Shared network (optional)

Without further configuration the stack gets its own Docker network. If the admin UI should
reach MySQL via the container name, it additionally joins the MySQL network. For that, add
the following to `compose.yaml` in your repo, here for an existing network `<network>`:

```yaml
services:
  craftapps-admin:
    networks:
      - default
      - shared

networks:
  shared:
    name: <network>
    external: true
```

Likewise, `craftapps-web` can join the Zoraxy network. Zoraxy can then use `CraftApps:80`
and `CraftApps-Admin:3000` as targets instead of the Pi's ports.

### MySQL

**What CraftApps needs:** MySQL 8 with the database and user from
[step 1](#1-create-the-database), reachable for `CraftApps-Admin` at `CRAFTAPPS_DB_HOST`,
see [step 2](#2-make-the-database-reachable).

**If it's missing:** stack `mysql` with the **Web editor**, the root password under
**Environment variables** as `MYSQL_ROOT_PASSWORD`. Port `3306` is then reachable in the
whole local network, `CRAFTAPPS_DB_HOST` is `<host>`:

```yaml
services:
  mysql:
    image: mysql:8.4
    container_name: MySQL
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD}
      TZ: Europe/Berlin
    ports:
      - 3306:3306
    volumes:
      - mysql-data:/var/lib/mysql

volumes:
  mysql-data:
```

### Watchtower

**What CraftApps needs:**

- **Access to the registry,** only for an image from a registry that requires a login,
  such as the Gitea registry. The credentials for `<gitea-host>` then belong in a separate
  `config.json`. Log in on the Pi, with the read token from [In Gitea](#in-gitea) as
  password:

  ```bash
  sudo docker --config /opt/watchtower login <gitea-host> -u <owner>
  ```

  Then mount the file `/opt/watchtower/config.json` into Watchtower as `/config.json`, as
  in the template below. `REPO_USER` and `REPO_PASS` aren't suitable for this: Watchtower
  sends them to every registry, Docker Hub included.

- **Updates despite monitor-only.** `CraftApps` and `CraftApps-Admin` carry the label
  `com.centurylinklabs.watchtower.monitor-only=false`. If your Watchtower runs with
  `WATCHTOWER_MONITOR_ONLY=true`, the label only takes effect together with
  `WATCHTOWER_LABEL_TAKE_PRECEDENCE=true`. Otherwise Watchtower only reports the updates.
- **Docker 29.** The old image `containrrr/watchtower` has been unmaintained since December
  2025 and needs `DOCKER_API_VERSION=1.44` from Docker 29 on. The fork
  `nickfedor/watchtower` understands the same labels and variables and negotiates the API
  version itself.

**If it's missing:** stack `watchtower` with the **Web editor**. The `config.json` line is
only needed for a registry with login; create the file first as described above:

```yaml
services:
  watchtower:
    image: nickfedor/watchtower:latest
    container_name: Watchtower
    restart: unless-stopped
    environment:
      TZ: Europe/Berlin
      WATCHTOWER_CLEANUP: "true" # remove old images after an update
      WATCHTOWER_SCHEDULE: "0 0 4 * * *" # daily at 4 am
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - /opt/watchtower/config.json:/config.json:ro
```

### Zoraxy

**What CraftApps needs:** nothing, Zoraxy is optional and adds HTTPS and your own domains,
see [step 5](#5-https-via-reverse-proxy-optional). The targets are the Pi's ports,
`<host>:8085` and `<host>:8086`; in a [shared network](#shared-network-optional) also the
containers directly.

**If it's missing:** stack `zoraxy` with the **Web editor**. The router has to forward ports
80 and 443 to the Pi.

```yaml
services:
  zoraxy:
    image: zoraxydocker/zoraxy:latest
    container_name: Zoraxy
    restart: unless-stopped
    ports:
      - 80:80
      - 443:443
      - 8000:8000 # Zoraxy's own web UI
    environment:
      TZ: Europe/Berlin
    volumes:
      - zoraxy-config:/opt/zoraxy/config/
      - zoraxy-plugin:/opt/zoraxy/plugin/
    extra_hosts:
      - host.docker.internal:host-gateway

volumes:
  zoraxy-config:
  zoraxy-plugin:
```

Then open the web UI at `http://<host>:8000`, create an account and get the certificates via
ACME (Let's Encrypt).

### Gotify

**What CraftApps needs:** an app token. In Gotify under **Apps → Create Application**,
create an application `CraftApps` and enter the token together with the server's address in
the admin UI's settings, see [step 4](#4-first-login).

**If it's missing:** stack `gotify` with the **Web editor**, the password for the account
`admin` under **Environment variables** as `GOTIFY_ADMIN_PASSWORD`:

```yaml
services:
  gotify:
    image: gotify/server:latest
    container_name: Gotify
    restart: unless-stopped
    environment:
      TZ: Europe/Berlin
      GOTIFY_DEFAULTUSER_PASS: ${GOTIFY_ADMIN_PASSWORD}
    ports:
      - 8080:80
    volumes:
      - gotify-data:/app/data

volumes:
  gotify-data:
```

The address for the admin UI is then `http://<host>:8080`. For the phone app to reach Gotify
on the go as well, add a proxy rule in Zoraxy for a domain of your own with the target
`<host>:8080`.
