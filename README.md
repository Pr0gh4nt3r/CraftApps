# CraftApps

Selbst gehostete Web-Versionen der Craft-Apps von [storytold](https://github.com/storytold)
(PhotoCraft, VectorCraft, FilmCraft, …) auf dem Raspberry Pi, mit einer Verwaltung im Stil
des Craft Launchers:

- **nginx** liefert die installierten Apps aus (`/photocraft/`, `/vectorcraft/`, …) und
  zeigt unter `/` eine Übersicht.
- **Die Verwaltung** (Node.js/TypeScript) zeigt alle verfügbaren Apps, installiert und
  entfernt sie, spielt Updates automatisch oder per Knopf ein und meldet alles über Gotify.

## Inhalt

- [Aufbau](#aufbau)
- [So greift alles ineinander](#so-greift-alles-ineinander)
- [Was die Verwaltung kann](#was-die-verwaltung-kann)
- [Einrichtung](#einrichtung)
- [Im Betrieb](#im-betrieb)
- [Benachrichtigungen](#benachrichtigungen)
- [Gut zu wissen](#gut-zu-wissen)
- [Entwicklung](#entwicklung)
- [Container](#container)

## Aufbau

```text
CraftApps\
├── .gitea\workflows\admin-image.yaml   Baut das Image zusätzlich in Gitea (optional)
├── .github\workflows\admin-image.yaml  Baut das Image der Verwaltung (ARM64) nach ghcr.io, wenn sich admin\ ändert
├── .vscode\                            Starten und Debuggen in VS Code, empfohlene Erweiterungen
├── admin\                              Verwaltung: Fastify-Server und React-Oberfläche
│   ├── Dockerfile
│   └── src\
│       ├── server\                     API, Anmeldung, Installer, GitHub, Gotify
│       ├── shared\                     Typen für Server und Oberfläche
│       └── web\                        Oberfläche
├── compose.dev.yaml                    MySQL für die lokale Entwicklung
├── compose.yaml                        Stack für Portainer: nginx und Verwaltung
└── nginx.conf                          Konfiguration des nginx
```

## So greift alles ineinander

```text
Push ins Repo
 ├─ admin\ geändert  ─> GitHub Actions baut das Image ─> ghcr.io ─> Watchtower aktualisiert CraftApps-Admin
 └─ compose.yaml oder nginx.conf geändert ─> Portainer holt das Repo (GitOps) und deployt den Stack neu

Verwaltung ─> GitHub: neue Apps und Releases ─> lädt <app>-web-*.zip ins Volume craftapps_data ─> nginx liefert aus
           └─> Gotify: Push-Nachricht

Browser ─> <host>:8085  ─> nginx (CraftApps)
        └─> <host>:8086 ─> Verwaltung (CraftApps-Admin)
```

- Standardmäßig sind Apps und Verwaltung nur im lokalen Netz über die Ports des Pi
  erreichbar. Öffentlich mit eigenen Domains und HTTPS macht sie ein Reverse Proxy wie
  Zoraxy, siehe [Schritt 5](#5-https-mit-reverse-proxy-optional).
- Portainer kann Images aus einem Git-Repo nicht selbst bauen
  ([Portainer-FAQ](https://docs.portainer.io/2.39-lts/faqs/troubleshooting/stacks-deployments-and-updates/can-i-build-an-image-while-deploying-a-stack-application-from-git)).
  Deshalb baut GitHub Actions das Image, und die Compose-Datei verweist nur darauf.
- Liegt das Repo in Gitea, spiegelt Gitea es nach GitHub. Zusätzlich kann Gitea Actions das
  Image in die Gitea-Registry bauen, siehe [Image selbst bauen](#image-selbst-bauen).
- `nginx.conf` kommt per Bind-Mount direkt aus dem Repo. Das geht nur mit
  „Enable relative path volumes“ der Portainer Business Edition
  ([Portainer-Doku](https://docs.portainer.io/advanced/relative-paths)).
- nginx ist das offizielle Image `nginx:alpine`, Watchtower hält es aktuell.

## Was die Verwaltung kann

- **Apps** im Raster wie der Craft Launcher – mit dessen Icons, Markenfarben und deutschen
  Texten: installieren, aktualisieren, neu installieren, deinstallieren, automatische
  Updates je App an- oder ausschalten.
- **Neue Apps** findet sie selbst: alle Repos von storytold, die auf `craft` enden und
  deren neuestes Release ein `<app>-web-*.zip` hat. Neue Apps werden gemeldet und auf
  Wunsch automatisch installiert.
- **Updates ohne Unterbrechung:** Neue Dateien kommen neben die alten, `index.html` wird
  zuletzt umgeschaltet, die Vorversion bleibt bis zum nächsten Update liegen. Jeder
  Download wird per SHA-256 geprüft.
- **Anmeldung** mit Benutzern in MySQL, Aktivitätsverlauf, Einstellungen (Prüfintervall,
  Gotify, Adressen) und Benutzerverwaltung.
- **Push-Nachrichten** über Gotify, siehe [Benachrichtigungen](#benachrichtigungen).

Daten: Benutzer, Einstellungen und Verlauf liegen in MySQL, die Apps im Volume
`craftapps_data`, das nginx nur lesend einbindet.

## Einrichtung

Die Schritte bauen aufeinander auf. Wie die einzelnen Container eingerichtet werden, steht
gesammelt unter [Container](#container); die Schritte verweisen an der passenden Stelle
dorthin. Das Image der Verwaltung gibt es fertig als
`ghcr.io/pr0gh4nt3r/craftapps-admin:latest`, selbst bauen musst du es nicht.

In Adressen, Befehlen und Vorlagen stehen Platzhalter für deine Werte:

| Platzhalter      | Bedeutung                                     | Beispiel                                    |
| ---------------- | --------------------------------------------- | ------------------------------------------- |
| `<host>`         | Adresse des Pi im lokalen Netz                | `192.168.1.10`                              |
| `<repo-url>`     | Adresse des Repos zum Klonen                  | `https://github.com/benutzer/CraftApps.git` |
| `<apps-domain>`  | Domain für die Apps                           | `craft.example.com`                         |
| `<admin-domain>` | Domain für die Verwaltung                     | `craft-admin.example.com`                   |
| `<github-konto>` | Dein GitHub-Konto, klein geschrieben          | `benutzer`                                  |
| `<gitea-host>`   | Adresse deiner Gitea-Instanz, ohne `https://` | `gitea.example.com`                         |
| `<besitzer>`     | Konto in Gitea, dem das Repo gehört           | `benutzer`                                  |

Die Domains brauchst du nur für
[HTTPS mit Reverse Proxy](#5-https-mit-reverse-proxy-optional), die letzten drei nur,
wenn du das [Image selbst baust](#image-selbst-bauen).

### Voraussetzungen

- **Raspberry Pi** mit 64-Bit-System und Docker. Das Image der Verwaltung gibt es nur für
  ARM64.
- **Portainer Business Edition.** Nur sie kann `nginx.conf` direkt aus dem Repo einbinden
  („Enable relative path volumes“).
- **Ein Git-Repo mit diesem Projekt,** aus dem Portainer den Stack holt: das öffentliche
  auf GitHub oder ein eigenes, z.B. ein Fork oder ein Repo in Gitea.
- **Auf dem Pi** MySQL und Watchtower, optional Zoraxy und Gotify. Was CraftApps von ihnen
  braucht – und Vorlagen, falls etwas davon fehlt –, steht unter [Container](#container).

### 1. Datenbank anlegen

Im Container `MySQL`, z.B. in Portainer unter **Containers → MySQL → Console** mit
`mysql -uroot -p`:

```sql
CREATE DATABASE craftapps CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'craftapps'@'%' IDENTIFIED BY 'ein-langes-passwort';
GRANT ALL PRIVILEGES ON craftapps.* TO 'craftapps'@'%';
```

Das Passwort brauchst du in Schritt 3 als `CRAFTAPPS_DB_PASSWORD`. Die Tabellen legt die
Verwaltung beim ersten Start selbst an.

### 2. Datenbank erreichbar machen

Der Stack bekommt sein eigenes Docker-Netz. Die Verwaltung erreicht MySQL deshalb über die
Adresse in `CRAFTAPPS_DB_HOST`, und dafür gibt es zwei Wege:

- **Über den Pi:** MySQL gibt Port `3306` am Pi frei, `CRAFTAPPS_DB_HOST` ist dann
  `<host>`. So macht es auch die [Vorlage für MySQL](#mysql).
- **Über ein gemeinsames Netz:** `CraftApps-Admin` kommt zusätzlich in das Netz von MySQL,
  `CRAFTAPPS_DB_HOST` ist dann der Name des MySQL-Containers. Das braucht eine Ergänzung
  in `compose.yaml`, siehe [Gemeinsames Netz](#gemeinsames-netz-optional).

### 3. Stack in Portainer anlegen

Den Stack `craftapps` wie unter
[CraftApps und CraftApps-Admin](#craftapps-und-craftapps-admin) beschrieben anlegen.
Danach laufen die Container `CraftApps` und `CraftApps-Admin`, und im Log der Verwaltung
steht „Benutzer admin angelegt“.

### 4. Erste Anmeldung

`http://<host>:8086` öffnen und mit `admin` und dem Passwort aus
`CRAFTAPPS_ADMIN_PASSWORD` anmelden. Unter **Einstellungen** eintragen:

- **Öffentliche Adresse der Apps:** `http://<host>:8085`, mit Reverse Proxy
  `https://<apps-domain>` – für die „Öffnen“-Knöpfe
- **Adresse dieser Verwaltung:** `http://<host>:8086` bzw. `https://<admin-domain>` – öffnet
  sich beim Antippen einer Benachrichtigung
- **Gotify-Server** und **App-Token**, siehe [Gotify](#gotify), dann
  **Testnachricht senden**

Etwa zehn Sekunden nach dem Start fragt die Verwaltung zum ersten Mal GitHub ab und zeigt
dann alle verfügbaren Apps. Zum Abschluss eine App installieren und unter
`http://<host>:8085` öffnen.

### 5. HTTPS mit Reverse Proxy (optional)

WebGPU und die Zwischenablage erlauben Browser nur in einem sicheren Kontext, also über
HTTPS oder direkt auf `localhost`. Über `http://<host>:8085` laufen die Apps, nur ohne diese
Funktionen. HTTPS und eigene Domains bringt ein Reverse Proxy davor, z.B.
[Zoraxy](#zoraxy) mit Zertifikaten von Let's Encrypt:

| Domain           | Ziel          | Zweck      |
| ---------------- | ------------- | ---------- |
| `<apps-domain>`  | `<host>:8085` | Apps       |
| `<admin-domain>` | `<host>:8086` | Verwaltung |

Danach in den Einstellungen der Verwaltung beide Adressen auf `https://` umstellen.

### Image selbst bauen

Nur nötig, wenn du nicht das fertige Image nehmen willst. Beide Wege bauen bei jeder
Änderung in `admin\` neu, der GitHub-Workflow zusätzlich montags früh für
Sicherheitsupdates. Im Stack zeigt dann `CRAFTAPPS_ADMIN_IMAGE` auf dein Image.

#### Auf GitHub

Der Workflow [.github/workflows/admin-image.yaml](.github/workflows/admin-image.yaml)
baut in jedem GitHub-Repo mit diesem Projekt, etwa einem Fork, nach
`ghcr.io/<github-konto>/craftapps-admin`. Er läuft nativ auf einem ARM64-Runner von GitHub
und braucht kein Secret.

1. In einem Fork die Workflows unter **Actions** einmal erlauben.
2. Unter **Actions → Verwaltung bauen → Run workflow** den ersten Build starten.
3. Das Paket erscheint im Profil unter **Packages** und übernimmt die Sichtbarkeit des
   Repos. Ist es privat, unter **Package settings → Change visibility** auf **Public**
   stellen, sonst brauchen Portainer und Watchtower Zugangsdaten.
4. Im Stack `CRAFTAPPS_ADMIN_IMAGE` auf `ghcr.io/<github-konto>/craftapps-admin:latest`
   setzen.

**Spiegel aus Gitea:** Liegt das Repo in Gitea, im Repo unter **Einstellungen** bei den
Spiegel-Einstellungen einen Push-Mirror auf das GitHub-Repo anlegen und das Synchronisieren
bei jedem Push einschalten. Der GitHub-Token dafür braucht **Contents** und **Workflows**,
jeweils mit Lesen und Schreiben. Ohne **Workflows** lehnt GitHub jeden Push ab, der
`.github/workflows/` ändert.

#### In Gitea

Der Workflow [.gitea/workflows/admin-image.yaml](.gitea/workflows/admin-image.yaml) baut
nach `<gitea-host>/<besitzer>/craftapps-admin`.

1. **Actions einschalten:** Actions und Pakete (die Container-Registry) sind in aktuellen
   Gitea-Versionen standardmäßig an. Sonst in der `app.ini` unter `[actions]` und
   `[packages]` jeweils `ENABLED = true` setzen, im Container per
   `GITEA__actions__ENABLED=true` und `GITEA__packages__ENABLED=true`, und Gitea neu
   starten. Fehlt im Repo der Reiter **Actions**, ihn unter **Einstellungen** für das Repo
   einschalten.
2. **Runner einrichten** wie unter [Gitea-Runner](#gitea-runner) beschrieben, bis er in
   Gitea als online erscheint.
3. **Token für den Build:** in Gitea mit dem Konto `<besitzer>` unter
   **Einstellungen → Anwendungen** einen Token mit **package: Lesen und Schreiben**
   erzeugen, z.B. `craftapps-build`, und ihn im Repo unter
   **Einstellungen → Actions → Secrets** als Secret `REGISTRY_TOKEN` anlegen.
4. **Image bauen:** unter **Actions → Verwaltung bauen → Run workflow**. Der erste Lauf lädt
   das Job-Image des Runners, etwa 0,5 GB. Danach liegt das Image in deinem Gitea-Profil
   unter **Pakete**: `<gitea-host>/<besitzer>/craftapps-admin:latest`. Den Besitzer
   schreibt der Workflow klein, weil Docker in Image-Namen keine Großbuchstaben erlaubt.
5. **Lesezugriff für Portainer und Watchtower,** falls die Pakete nicht öffentlich sind –
   etwa weil deine Gitea-Instanz eine Anmeldung verlangt: einen Token mit
   **package: Lesen** erzeugen, z.B. `pi-lesen`, und in Portainer unter
   **Registries → Add registry → Custom registry** eintragen: Name `Gitea`, Registry URL
   `<gitea-host>`, **Authentication** an, Benutzer `<besitzer>`, als Passwort den Token.
   Watchtower bekommt ihn als `config.json`, siehe [Watchtower](#watchtower).
6. Im Stack `CRAFTAPPS_ADMIN_IMAGE` auf `<gitea-host>/<besitzer>/craftapps-admin:latest`
   setzen.

## Im Betrieb

| Du änderst …     | Was passiert                                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------------------------------- |
| Code in `admin\` | GitHub Actions baut ein neues Image, Watchtower spielt es ein.                                                |
| `compose.yaml`   | Portainer deployt den Stack innerhalb des Polling-Intervalls neu.                                             |
| `nginx.conf`     | Portainer holt die neue Datei. Danach den Container `CraftApps` neu starten – nginx liest sie nur beim Start. |
| nichts           | Montags früh baut GitHub Actions neu (Sicherheitsupdates für Node und Alpine), nginx hält Watchtower aktuell. |

- **Ohne Watchtower** oder um nicht zu warten: in Portainer **Containers → CraftApps-Admin →
  Recreate** mit **Re-pull image**.
- **Ein Build von Hand:** auf GitHub unter **Actions → Verwaltung bauen → Run workflow**.
- **Geplante Läufe** pausiert GitHub, wenn sich 60 Tage lang nichts im Repo tut. Unter
  **Actions** lassen sie sich wieder einschalten.

## Benachrichtigungen

| Ereignis                                                                             | Gotify-Priorität |
| ------------------------------------------------------------------------------------ | ---------------- |
| Neue App verfügbar (beim allerersten Start und ab vier auf einmal als Sammelmeldung) | 5                |
| Update verfügbar – nur für Apps, deren automatische Updates aus sind                 | 5                |
| Update eingespielt (automatisch oder per Knopf), neue App automatisch installiert    | 4                |
| Fehler – jeder Fehler einmal, nicht bei jeder Prüfung erneut                         | 8                |

Jede Kategorie lässt sich in den Einstellungen abschalten. Antippen öffnet die
Verwaltung.

## Gut zu wissen

- Pro Prüfung braucht die Verwaltung etwa 16 Anfragen an die GitHub-API. Ohne Token erlaubt
  GitHub 60 pro Stunde; für Prüfintervalle unter etwa 20 Minuten in `compose.yaml`
  `GITHUB_TOKEN` setzen.
- Anmeldung: höchstens 10 Versuche pro 15 Minuten und IP-Adresse.
- Reihenfolge, Namen, Farben, deutsche Texte und Icons übernimmt die Verwaltung aus dem
  [Craft Launcher](https://github.com/storytold/craft-launcher). Ist der nicht erreichbar,
  gilt der zuletzt bekannte Stand.
- Der Container der Verwaltung läuft als Benutzer 1000 mit schreibgeschütztem
  Dateisystem und ohne Linux-Capabilities. Ein neues Volume `craftapps_data` gehört
  automatisch diesem Benutzer. Meldet die Verwaltung trotzdem fehlende Schreibrechte, auf
  dem Pi `sudo chown -R 1000:1000 /var/lib/docker/volumes/craftapps_data/_data` ausführen.

## Entwicklung

Gedacht für Linux oder WSL mit Node.js 24 und Docker. Unter WSL gehört das Repo ins
Linux-Dateisystem (nicht unter `/mnt/c`), sonst bemerkt Vite Änderungen nicht zuverlässig.
Docker läuft dort entweder direkt in der Distribution oder über Docker Desktop mit
eingeschalteter WSL-Integration für die Distribution, aber nicht beides.

```bash
docker compose -f compose.dev.yaml up -d   # MySQL for development
cd admin
npm ci
cp .env.example .env                       # once; matches compose.dev.yaml
npm run dev:server                         # server, restarts on changes
npm run dev:web                            # second terminal: UI at http://localhost:5173
```

Anmelden mit `admin` und dem Passwort aus `.env`. Installierte Apps landen in `admin/data`.

**Debuggen in VS Code:** unter **Ausführen und Debuggen** „Server und Oberfläche“ starten.
Das startet beides; Breakpoints gehen direkt im TypeScript des Servers. Die Oberfläche
debuggst du mit den Entwicklertools des Browsers.

**Prüfen** – muss vor jedem Commit fehlerfrei durchlaufen:

```bash
npm run lint    # ESLint, warnings count as errors
npm run build   # tsc for UI and server, Vite build as in CI
```

## Container

Alle Container laufen auf dem Pi und werden in Portainer als Stack angelegt. `CraftApps`
und `CraftApps-Admin` sind CraftApps selbst, den `gitea-runner` brauchst du nur, um das
Image in Gitea zu bauen. Bei den übrigen steht, was CraftApps von ihnen braucht, und eine
Vorlage, falls einer davon fehlt.

| Container         | Image                                       | Aufgabe                             |
| ----------------- | ------------------------------------------- | ----------------------------------- |
| `CraftApps`       | `nginx:alpine`                              | liefert die Apps aus                |
| `CraftApps-Admin` | `ghcr.io/pr0gh4nt3r/craftapps-admin:latest` | die Verwaltung                      |
| `gitea-runner`    | `gitea/act_runner:latest`                   | baut das Image in Gitea, optional   |
| `MySQL`           | z.B. `mysql:8.4`                            | Benutzer, Einstellungen und Verlauf |
| Watchtower        | z.B. `nickfedor/watchtower:latest`          | spielt neue Images ein              |
| Zoraxy            | z.B. `zoraxydocker/zoraxy:latest`           | Domains und HTTPS, optional         |
| Gotify            | z.B. `gotify/server:latest`                 | Push-Nachrichten, optional          |

### CraftApps und CraftApps-Admin

Beide stehen in [compose.yaml](compose.yaml) und laufen als Stack `craftapps`. Portainer
holt die Datei aus dem Repo und deployt bei jeder Änderung neu.

**Stack anlegen:** in Portainer unter **Stacks → Add stack**:

- **Name:** `craftapps`
- **Build method:** **Repository**
- **Repository URL:** `<repo-url>`
- **Authentication**, falls das Repo nicht öffentlich ist: Benutzer und ein Token mit
  Lesezugriff auf das Repo – in Gitea mit **repository: Lesen**, auf GitHub ein
  Fine-grained Token mit **Contents: Read**
- **Repository reference:** `refs/heads/main`
- **Compose path:** `compose.yaml`
- **GitOps updates** an, Mechanismus **Polling**, Intervall `5m`
- **Enable relative path volumes** an, **Local filesystem path** z.B. `/opt/stacks`.
  Portainer klont das Repo dorthin, nginx bekommt `nginx.conf` von dort.
- **Environment variables:**

  | Variable                   | Wert                                                                     |
  | -------------------------- | ------------------------------------------------------------------------ |
  | `CRAFTAPPS_DB_HOST`        | Adresse der Datenbank, siehe [Schritt 2](#2-datenbank-erreichbar-machen) |
  | `CRAFTAPPS_DB_PASSWORD`    | Passwort aus [Schritt 1](#1-datenbank-anlegen)                           |
  | `CRAFTAPPS_ADMIN_PASSWORD` | Passwort für das erste Konto `admin`, mindestens 10 Zeichen              |
  | `CRAFTAPPS_WEB_PORT`       | nur für einen anderen Port der Apps als `8085`                           |
  | `CRAFTAPPS_ADMIN_PORT`     | nur für einen anderen Port der Verwaltung als `8086`                     |
  | `CRAFTAPPS_DB_PORT`        | nur, wenn MySQL nicht auf Port `3306` lauscht                            |
  | `CRAFTAPPS_ADMIN_IMAGE`    | nur für ein [eigenes Image](#image-selbst-bauen)                         |

Dann **Deploy the stack**.

**Was in compose.yaml steht:**

|                         | `CraftApps`                        | `CraftApps-Admin`                                                        |
| ----------------------- | ---------------------------------- | ------------------------------------------------------------------------ |
| Image                   | `nginx:alpine`                     | `ghcr.io/pr0gh4nt3r/craftapps-admin:latest` oder `CRAFTAPPS_ADMIN_IMAGE` |
| Port auf dem Pi         | `8085`                             | `8086`                                                                   |
| Volume `craftapps_data` | unter `/srv/craftapps`, nur lesend | unter `/data`                                                            |
| Updates                 | Watchtower                         | Watchtower, nach jedem Build                                             |

- nginx liest `nginx.conf` nur beim Start: Nach einer Änderung den Container `CraftApps`
  neu starten.
- Die Verwaltung verbindet sich über `CRAFTAPPS_DB_HOST` mit MySQL und legt das Konto
  `admin` nur an, solange es noch keinen Benutzer gibt.
- Sie läuft als Benutzer 1000 mit schreibgeschütztem Dateisystem, ohne Linux-Capabilities
  und mit `no-new-privileges`. Ob sie läuft, prüft Docker über `/healthz`.
- Optional `GITHUB_TOKEN` für Prüfintervalle unter etwa 20 Minuten, siehe
  [Gut zu wissen](#gut-zu-wissen).

### Gitea-Runner

Nur für das [Image in Gitea](#in-gitea): Der Runner baut es, sobald sich `admin\` ändert.
Auf dem Pi baut er nativ für ARM64; auf einem anderen Rechner emuliert der Workflow ARM64
per QEMU, das dauert deutlich länger.

1. **Registrierungstoken holen:** in Gitea im Repo unter **Einstellungen → Actions →
   Runner → Neuen Runner erstellen**. Ein Runner auf Repo-Ebene führt nur die Workflows
   dieses Repos aus.
2. **Stack anlegen:** in Portainer unter **Stacks → Add stack** einen Stack `gitea-runner`
   mit dem **Web editor**:

   ```yaml
   services:
     runner:
       image: gitea/act_runner:latest
       container_name: gitea-runner
       restart: unless-stopped
       environment:
         GITEA_INSTANCE_URL: https://<gitea-host>
         GITEA_RUNNER_REGISTRATION_TOKEN: "<registrierungstoken>"
         GITEA_RUNNER_NAME: pi
         GITEA_RUNNER_LABELS: ubuntu-latest:docker://gitea/runner-images:ubuntu-latest
       volumes:
         - runner-data:/data
         - /var/run/docker.sock:/var/run/docker.sock

   volumes:
     runner-data:
   ```

   Das Label `ubuntu-latest` verlangt der Workflow. Seine Jobs laufen damit im Image
   `gitea/runner-images:ubuntu-latest`, das es für ARM64 gibt und das Docker-CLI und
   Buildx mitbringt. Gebaut wird über den eingebundenen Socket mit dem Docker des Pi.

3. **Prüfen:** Unter **Einstellungen → Actions → Runner** steht der Runner `pi` als online.
4. **Registrierungstoken wieder entfernen:** Der Runner hat jetzt eigene Zugangsdaten im
   Volume `runner-data` gespeichert und registriert sich nur neu, wenn die fehlen. Im
   Stack die Zeile `GITEA_RUNNER_REGISTRATION_TOKEN` löschen und **Update the stack**.
   `GITEA_RUNNER_LABELS` bleibt stehen, die Labels übernimmt der Runner bei jedem Start.
   Optional den Registrierungstoken in Gitea zurücksetzen – der Runner meldet sich mit
   seinen eigenen Zugangsdaten an und läuft weiter.

> Der Runner kann Docker auf dem Pi steuern. Lass auf ihm nur Workflows aus Repos laufen,
> denen du vertraust.
>
> Das Volume `runner-data` beim Löschen des Stacks nicht mitlöschen. Sonst muss sich der
> Runner mit einem neuen Registrierungstoken neu registrieren; den alten Eintrag dann
> unter **Einstellungen → Actions → Runner** löschen.

### Gemeinsames Netz (optional)

Ohne weitere Angaben bekommt der Stack sein eigenes Docker-Netz. Soll die Verwaltung MySQL
über den Containernamen erreichen, kommt sie zusätzlich in das Netz von MySQL. Dafür in
`compose.yaml` deines Repos ergänzen, hier für ein bestehendes Netz `<netz>`:

```yaml
services:
  craftapps-admin:
    networks:
      - default
      - shared

networks:
  shared:
    name: <netz>
    external: true
```

Genauso kann `craftapps-web` in das Netz von Zoraxy. Als Ziele in Zoraxy gehen dann statt
der Ports des Pi `CraftApps:80` und `CraftApps-Admin:3000`.

### MySQL

**Was CraftApps braucht:** MySQL 8 mit der Datenbank und dem Benutzer aus
[Schritt 1](#1-datenbank-anlegen), erreichbar für `CraftApps-Admin` unter
`CRAFTAPPS_DB_HOST`, siehe [Schritt 2](#2-datenbank-erreichbar-machen).

**Falls er fehlt:** Stack `mysql` mit dem **Web editor**, das Root-Passwort unter
**Environment variables** als `MYSQL_ROOT_PASSWORD`. Port `3306` ist damit im ganzen
lokalen Netz erreichbar, `CRAFTAPPS_DB_HOST` ist `<host>`:

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

**Was CraftApps braucht:**

- **Zugang zur Registry,** nur für ein Image aus einer Registry mit Anmeldung, etwa der
  Gitea-Registry. Die Zugangsdaten für `<gitea-host>` gehören dann in eine eigene
  `config.json`. Dafür auf dem Pi anmelden, als Passwort den Lese-Token aus
  [In Gitea](#in-gitea):

  ```bash
  sudo docker --config /opt/watchtower login <gitea-host> -u <besitzer>
  ```

  Die Datei `/opt/watchtower/config.json` dann in Watchtower als `/config.json` einbinden,
  wie in der Vorlage unten. `REPO_USER` und `REPO_PASS` eignen sich dafür nicht:
  Watchtower schickt sie an jede Registry, auch an Docker Hub.

- **Updates trotz monitor-only.** `CraftApps` und `CraftApps-Admin` tragen das Label
  `com.centurylinklabs.watchtower.monitor-only=false`. Läuft dein Watchtower mit
  `WATCHTOWER_MONITOR_ONLY=true`, wirkt das Label nur zusammen mit
  `WATCHTOWER_LABEL_TAKE_PRECEDENCE=true`. Sonst meldet Watchtower die Updates nur.
- **Docker 29.** Das alte Image `containrrr/watchtower` wird seit Dezember 2025 nicht mehr
  gepflegt und braucht ab Docker 29 `DOCKER_API_VERSION=1.44`. Der Fork
  `nickfedor/watchtower` versteht dieselben Labels und Variablen und handelt die
  API-Version selbst aus.

**Falls er fehlt:** Stack `watchtower` mit dem **Web editor**. Die Zeile mit `config.json`
braucht es nur für eine Registry mit Anmeldung; die Datei dann vorher wie oben anlegen:

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

**Was CraftApps braucht:** nichts, Zoraxy ist optional und bringt HTTPS und eigene Domains,
siehe [Schritt 5](#5-https-mit-reverse-proxy-optional). Die Ziele sind die Ports des Pi,
`<host>:8085` und `<host>:8086`; in einem [gemeinsamen Netz](#gemeinsames-netz-optional)
auch die Container direkt.

**Falls es fehlt:** Stack `zoraxy` mit dem **Web editor**. Der Router muss die Ports 80 und
443 an den Pi weiterleiten.

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

Danach die Oberfläche unter `http://<host>:8000` öffnen, ein Konto anlegen und die
Zertifikate per ACME (Let's Encrypt) holen.

### Gotify

**Was CraftApps braucht:** einen App-Token. In Gotify unter **Apps → Create Application**
eine Anwendung `CraftApps` anlegen und den Token zusammen mit der Adresse des Servers in
den Einstellungen der Verwaltung eintragen, siehe [Schritt 4](#4-erste-anmeldung).

**Falls es fehlt:** Stack `gotify` mit dem **Web editor**, das Passwort für das Konto
`admin` unter **Environment variables** als `GOTIFY_ADMIN_PASSWORD`:

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

Die Adresse für die Verwaltung ist dann `http://<host>:8080`. Damit die App auf dem Handy
Gotify auch unterwegs erreicht, in Zoraxy eine Proxy-Regel für eine eigene Domain mit dem
Ziel `<host>:8080` anlegen.
