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

## Aufbau

```text
CraftApps\
├── .gitea\workflows\admin-image.yaml   Baut das Image der Verwaltung (ARM64), wenn sich admin\ ändert
├── admin\                              Verwaltung: Fastify-Server und React-Oberfläche
│   ├── Dockerfile
│   └── src\
│       ├── server\                     API, Anmeldung, Installer, GitHub, Gotify
│       ├── shared\                     Typen für Server und Oberfläche
│       └── web\                        Oberfläche
├── compose.yaml                        Stack für Portainer: nginx und Verwaltung
└── nginx.conf                          Konfiguration des nginx
```

## So greift alles ineinander

```text
Push nach Gitea
 ├─ admin\ geändert  ─> Gitea Actions baut das Image ─> Gitea-Registry ─> Watchtower aktualisiert CraftApps-Admin
 └─ compose.yaml oder nginx.conf geändert ─> Portainer holt das Repo (GitOps) und deployt den Stack neu

Verwaltung ─> GitHub: neue Apps und Releases ─> lädt <app>-web-*.zip ins Volume craftapps_data ─> nginx liefert aus
           └─> Gotify: Push-Nachricht
```

- Portainer kann Images aus einem Git-Repo nicht selbst bauen
  ([Portainer-FAQ](https://docs.portainer.io/2.39-lts/faqs/troubleshooting/stacks-deployments-and-updates/can-i-build-an-image-while-deploying-a-stack-application-from-git)).
  Deshalb baut Gitea Actions das Image, und die Compose-Datei verweist nur darauf.
- `nginx.conf` kommt per Bind-Mount direkt aus dem Repo. Das geht nur mit
  „Enable relative path volumes“ der Portainer Business Edition
  ([Portainer-Doku](https://docs.portainer.io/advanced/relative-paths)).
- nginx bleibt das offizielle Image `nginx:alpine` und wird wie bisher von Watchtower
  aktuell gehalten.

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

### 1. Gitea: Runner und Registry-Token

1. In Gitea müssen Actions aktiv sein und ein Runner
   ([act_runner](https://docs.gitea.com/usage/actions/act-runner)) laufen. Am besten auf
   dem Pi: Dann baut er nativ für ARM64. Auf einem anderen Rechner emuliert der Workflow
   ARM64 per QEMU, das dauert deutlich länger. Der Workflow nutzt das Runner-Label
   `ubuntu-latest`.
2. Token anlegen: in Gitea unter **Einstellungen → Anwendungen** einen Token mit der
   Berechtigung **package: Lesen und Schreiben** erzeugen – mit dem Konto, dem das Repo
   gehört.
3. Im Repo unter **Einstellungen → Actions → Secrets** ein Secret `REGISTRY_TOKEN` mit
   diesem Token anlegen.
4. Pushen. Unter **Actions** läuft „Verwaltung bauen“. Danach liegt das Image unter den
   Paketen des Besitzers: `<gitea-host>/<besitzer>/craftapps-admin:latest`.

> Der Runner kann Docker auf seinem Host steuern. Lass auf ihm nur Workflows aus Repos
> laufen, denen du vertraust.

### 2. Datenbank anlegen

Im MySQL-Container, z.B. in Portainer unter **Containers → (MySQL) → Console** mit
`mysql -uroot -p`:

```sql
CREATE DATABASE craftapps CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'craftapps'@'%' IDENTIFIED BY 'ein-langes-passwort';
GRANT ALL PRIVILEGES ON craftapps.* TO 'craftapps'@'%';
```

Die Tabellen legt die Verwaltung beim ersten Start selbst an. MySQL muss aus dem Netz
`custom` erreichbar sein; Name oder IP gehört in `DB_HOST` in [compose.yaml](compose.yaml).
Prüf dort auch die beiden IPs und committe die Änderungen.

### 3. Umstieg vom bisherigen Stack (einmalig)

Läuft noch der alte Stack `craftapps` (Web-Editor, nginx und Python-Updater):

1. In Portainer den alten Stack löschen. Das Volume `craftapps_data` mit den installierten
   Apps bleibt erhalten – falls Portainer fragt, Volumes **nicht** mitlöschen.
2. Die Verwaltung läuft als Benutzer 1000, der Python-Updater hat als root geschrieben.
   Einmal die Besitzrechte umstellen, z.B. per SSH auf dem Pi:

   ```bash
   sudo chown -R 1000:1000 /var/lib/docker/volumes/craftapps_data/_data
   ```

Die vom Python-Updater installierten Apps übernimmt die Verwaltung beim ersten Start.
Bei einer frischen Einrichtung entfällt dieser Schritt.

### 4. Stack in Portainer anlegen

1. **Nur wenn die Pakete in Gitea privat sind:** unter **Registries → Add registry →
   Custom registry** den Gitea-Host mit Benutzer und einem Token mit
   **package: Lesen** eintragen.
2. **Stacks → Add stack**, Name `craftapps`, Build method **Repository**:
   - **Repository URL:** `https://<gitea-host>/<besitzer>/CraftApps.git`, bei einem privaten
     Repo mit Authentifizierung (Token mit **repository: Lesen**)
   - **Repository reference:** `refs/heads/main`
   - **Compose path:** `compose.yaml`
   - **GitOps updates** an, Mechanismus **Polling**, Intervall z.B. `5m`
   - **Enable relative path volumes** an, **Local filesystem path** z.B. `/opt/stacks`.
     Portainer klont das Repo dorthin, nginx bekommt `nginx.conf` von dort.
   - **Environment variables:**

     | Variable                   | Wert                                                            |
     | -------------------------- | --------------------------------------------------------------- |
     | `CRAFTAPPS_ADMIN_IMAGE`    | `<gitea-host>/<besitzer>/craftapps-admin:latest`                |
     | `CRAFTAPPS_DB_PASSWORD`    | Passwort aus Schritt 2                                          |
     | `CRAFTAPPS_ADMIN_PASSWORD` | Passwort für das erste Konto `admin` (mindestens 10 Zeichen)    |

3. **Deploy the stack.**

### 5. Zoraxy

| Domain (Beispiel)              | Ziel               | Zweck      |
| ------------------------------ | ------------------ | ---------- |
| `craft.example.com`            | `172.18.0.22:80`   | Apps       |
| `craft-admin.example.com`      | `172.18.0.23:3000` | Verwaltung |

Beide mit Zertifikat: WebGPU und Zwischenablage gibt es in den Apps nur über HTTPS.

### 6. Erste Anmeldung

Mit `admin` und dem Passwort aus Schritt 4 anmelden. Unter **Einstellungen** eintragen:

- **Öffentliche Adresse der Apps**, z.B. `https://craft.example.com` – für die
  „Öffnen“-Knöpfe
- **Adresse dieser Verwaltung** – öffnet sich beim Antippen einer Benachrichtigung
- **Gotify-Server** und **App-Token** (in Gotify unter **Apps → Create Application**),
  dann **Testnachricht senden**

### 7. Aufräumen nach dem Umstieg (optional)

Wenn die Verwaltung die übernommenen Apps als installiert anzeigt:

```bash
# Altes Config-Volume (nginx.conf und updater.py) wird nicht mehr gebraucht
docker volume rm craftapps_config

# Stand des Python-Updaters, aus dem die Verwaltung die Apps übernommen hat
sudo rm -rf /var/lib/docker/volumes/craftapps_data/_data/.state
```

## Im Betrieb

| Du änderst …     | Was passiert                                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------------------------------- |
| Code in `admin\` | Gitea Actions baut ein neues Image, Watchtower spielt es ein.                                                 |
| `compose.yaml`   | Portainer deployt den Stack innerhalb des Polling-Intervalls neu.                                             |
| `nginx.conf`     | Portainer holt die neue Datei. Danach den Container `CraftApps` neu starten – nginx liest sie nur beim Start. |
| nichts           | Montags früh baut Gitea Actions neu (Sicherheitsupdates für Node und Alpine), nginx hält Watchtower aktuell.  |

- **Ohne Watchtower** oder um nicht zu warten: in Portainer **Containers → CraftApps-Admin →
  Recreate** mit **Re-pull image**.
- **Private Pakete:** Watchtower braucht dann Zugangsdaten für die Gitea-Registry, etwa
  über die Umgebungsvariablen `REPO_USER` und `REPO_PASS` im Watchtower-Container.
- **Ein Build von Hand:** in Gitea unter **Actions → Verwaltung bauen → Run workflow**.

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
  Dateisystem und ohne Linux-Capabilities.

## Entwicklung

```bash
cd admin
npm ci
npm run build
DB_HOST=… DB_USER=… DB_PASSWORD=… DB_NAME=… DATA_DIR=./data npm start
npm run dev:web    # Oberfläche mit Hot Reload; API-Aufrufe gehen an localhost:3000
```
