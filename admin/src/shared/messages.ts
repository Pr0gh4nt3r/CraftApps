// Messages the server generates and stores – events, job progress, errors, notifications.
// The server keeps them as key + parameters; the UI renders them in its language, each
// notification channel in the language set for it.

export type Lang = 'de' | 'en';

const de = {
  raw: '{text}',

  'job.install': 'Installation',
  'job.update': 'Update',
  'job.uninstall': 'Deinstallation',

  'phase.queued': 'Wartet',
  'phase.checking': 'Prüft Version',
  'phase.downloading': 'Lädt herunter',
  'phase.extracting': 'Entpackt',
  'phase.switching': 'Schaltet um',
  'phase.done': 'Fertig',
  'phase.failed': 'Fehlgeschlagen',

  // Only in activity entries from before the check results
  'event.checked': 'Nach Updates gesucht',
  'event.filesMissing': 'Dateien fehlen im Volume – als nicht installiert markiert',
  'event.updateAvailable': 'Update verfügbar: {change}',
  'event.available': 'Neu verfügbar: {version}',
  'event.jobFailed': '{job} fehlgeschlagen: {error}',
  'event.updated': 'Aktualisiert: {from} → {to}',
  'event.installed': 'Installiert: {version}',
  'event.reinstalled': 'Neu installiert: {version}',
  'event.uninstalled': 'Deinstalliert',
  'event.autoUpdateOn': 'Automatische Updates eingeschaltet',
  'event.autoUpdateOff': 'Automatische Updates ausgeschaltet',
  // Only in activity entries from before the list of changed settings
  'event.settingsChanged': 'Einstellungen geändert',
  'event.channelCreated': 'Benachrichtigungskanal „{name}“ angelegt',
  'event.channelChanged': 'Benachrichtigungskanal „{name}“ geändert',
  'event.channelEnabled': 'Benachrichtigungskanal „{name}“ eingeschaltet',
  'event.channelDisabled': 'Benachrichtigungskanal „{name}“ ausgeschaltet',
  'event.channelDeleted': 'Benachrichtigungskanal „{name}“ gelöscht',
  'event.channelFailed': 'Benachrichtigung über „{name}“ fehlgeschlagen: {error}',
  // Only in activity entries from before the notification channels
  'event.notifyFailed': 'Benachrichtigung fehlgeschlagen: {error}',
  'event.checkResult': 'Nach Updates gesucht: {result}',
  'event.checkNothing': 'nichts Neues',
  'event.settingsChangedFields': 'Einstellungen geändert: {fields}',
  'event.channelTested': 'Testnachricht über „{name}“ verschickt',
  'event.channelTestFailed': 'Testnachricht über „{name}“ fehlgeschlagen: {error}',
  'event.loggedIn': 'Angemeldet',
  'event.loggedOut': 'Abgemeldet',
  'event.passwordChanged': 'Eigenes Passwort geändert',
  'event.userCreated': 'Benutzer „{name}“ angelegt',
  'event.userDeleted': 'Benutzer „{name}“ gelöscht',
  'event.initialAdmin': 'Benutzer „{name}“ aus INITIAL_ADMIN_USER angelegt',
  'event.started': 'Verwaltung gestartet',

  'count.newApps.one': '1 neue App',
  'count.newApps.other': '{count} neue Apps',
  'count.updates.one': '1 Update',
  'count.updates.other': '{count} Updates',
  'count.errors.one': '1 Fehler',
  'count.errors.other': '{count} Fehler',

  'setting.checkSchedule': 'Zeitplan der Prüfungen',
  'setting.updateChannel': 'Update-Kanal',
  'setting.autoInstallNew': 'neue Apps automatisch installieren',
  'setting.defaultAutoUpdate': 'neu installierte Apps automatisch aktualisieren',
  'setting.appsBaseUrl': 'öffentliche Adresse der Apps',
  'setting.adminBaseUrl': 'Adresse dieser Verwaltung',
  'setting.githubToken': 'GitHub-Token',
  'setting.activityView': 'Standardansicht der Aktivität',

  'error.appSearchFailed': 'App-Suche auf GitHub fehlgeschlagen: {error}',
  'error.checkFailed': 'Prüfung fehlgeschlagen: {error}',
  'error.githubLimit': 'GitHub-API-Limit erreicht, wieder frei ab {time} Uhr',
  'error.githubToken': 'GitHub lehnt den Token ab – abgelaufen, widerrufen oder unvollständig kopiert?',
  'error.githubRepos': 'GitHub-API antwortet {status} beim Auflisten der Repos',
  'error.githubRelease': 'GitHub-API antwortet {status} für {repo}',
  'error.downloadFailed': 'Download von {name} fehlgeschlagen (HTTP {status})',
  'error.downloadIncomplete': '{name}: Download unvollständig',
  'error.checksum': '{name}: SHA-256 stimmt nicht, Datei verworfen',
  'error.zipUnreadable': 'Zip nicht lesbar',
  'error.entryUnreadable': '{file} nicht lesbar',
  'error.invalidAppId': 'Ungültige App-ID: {id}',
  'error.invalidZipPath': 'Ungültiger Pfad im Zip: {path}',
  'error.noIndex': 'Kein index.html im Zip',
  'error.noWebVersion': 'Keine Web-Version verfügbar',
  'error.unknownApp': 'Unbekannte App',
  'error.notInstalled': '{app} ist nicht installiert',
  'error.jobRunning': 'Für diese App läuft gerade schon eine andere Aktion',
  'error.noWriteAccess': 'Keine Schreibrechte auf {path} – das Daten-Volume muss dem Benutzer 1000 gehören (siehe README)',
  'error.serviceResponse': '{service} antwortet {status}: {text}',
  'error.serviceUnreachable': '{service} nicht erreichbar: {error}',
  'error.channelInvalid': 'Die Angaben zum Kanal sind unvollständig oder ungültig',
  'error.channelNameTaken': 'Einen Kanal mit diesem Namen gibt es schon',
  'error.timeZone': 'Unbekannte Zeitzone: {zone}',
  'error.scheduleTimes': 'Mindestens eine gültige Uhrzeit angeben',
  'error.scheduleWeekdays': 'Mindestens einen Wochentag wählen',
  'error.scheduleGap': 'Zwischen zwei Prüfungen müssen mindestens {minutes} Minuten liegen',
  // Only in activity entries from before the notification channels
  'error.gotify': 'Gotify antwortet {status}: {text}',
  'error.requestRejected': 'Anfrage abgelehnt',
  'error.notLoggedIn': 'Nicht angemeldet',
  'error.wrongLogin': 'Benutzername oder Passwort falsch',
  'error.passwordTooShort': 'Das Passwort muss mindestens {min} Zeichen haben',
  'error.wrongPassword': 'Das aktuelle Passwort stimmt nicht',
  'error.invalidUsername': 'Benutzername: 3–64 Zeichen, nur Buchstaben, Ziffern, . _ -',
  'error.usernameTaken': 'Diesen Benutzernamen gibt es schon',
  'error.deleteSelf': 'Du kannst dich nicht selbst löschen',
  'error.tooManyAttempts': 'Zu viele Versuche – bitte in ein paar Minuten noch einmal',
  'error.internal': 'Interner Fehler',
  'error.notFound': 'Nicht gefunden',

  'notify.updateAvailable.title': 'Update für {app}',
  'notify.updateAvailable.body': '**{change}** ist verfügbar.',
  'notify.newApps.title': '{count} Craft-Apps verfügbar',
  'notify.newApps.body': '{list}\n\n{all}',
  'notify.newApps.allAuto': 'Alle werden automatisch installiert.',
  'notify.newApps.allManual': 'Alle können installiert werden.',
  'notify.newApp.title': 'Neue App: {app}',
  'notify.newApp.auto': '**{app}** {version} wird automatisch installiert.{about}',
  'notify.newApp.manual': '**{app}** {version} kann installiert werden.{about}',
  'notify.jobFailed.title': '{app}: {job} fehlgeschlagen',
  'notify.updated.title': '{app} aktualisiert',
  'notify.updated.byUser': '**{from} → {to}** (von {user})',
  'notify.updated.auto': '**{from} → {to}** (automatisch)',
  'notify.installed.title': '{app} installiert',
  'notify.installed.body': 'Version **{version}** wurde automatisch installiert.',
  'notify.error.title': 'Fehler bei {app}',
  'notify.error.titleGlobal': 'Craft Apps: Fehler',
  'notify.test.title': 'Craft Apps',
  'notify.test.body': 'Testnachricht – die Benachrichtigungen funktionieren.',
  'notify.open': 'Verwaltung öffnen',
} as const;

export type MsgKey = keyof typeof de;

const en: Record<MsgKey, string> = {
  raw: '{text}',

  'job.install': 'Installation',
  'job.update': 'Update',
  'job.uninstall': 'Uninstall',

  'phase.queued': 'Waiting',
  'phase.checking': 'Checking version',
  'phase.downloading': 'Downloading',
  'phase.extracting': 'Extracting',
  'phase.switching': 'Switching over',
  'phase.done': 'Done',
  'phase.failed': 'Failed',

  'event.checked': 'Checked for updates',
  'event.filesMissing': 'Files missing in the volume – marked as not installed',
  'event.updateAvailable': 'Update available: {change}',
  'event.available': 'Newly available: {version}',
  'event.jobFailed': '{job} failed: {error}',
  'event.updated': 'Updated: {from} → {to}',
  'event.installed': 'Installed: {version}',
  'event.reinstalled': 'Reinstalled: {version}',
  'event.uninstalled': 'Uninstalled',
  'event.autoUpdateOn': 'Automatic updates turned on',
  'event.autoUpdateOff': 'Automatic updates turned off',
  'event.settingsChanged': 'Settings changed',
  'event.channelCreated': 'Notification channel "{name}" created',
  'event.channelChanged': 'Notification channel "{name}" changed',
  'event.channelEnabled': 'Notification channel "{name}" turned on',
  'event.channelDisabled': 'Notification channel "{name}" turned off',
  'event.channelDeleted': 'Notification channel "{name}" deleted',
  'event.channelFailed': 'Notification via "{name}" failed: {error}',
  'event.notifyFailed': 'Notification failed: {error}',
  'event.checkResult': 'Checked for updates: {result}',
  'event.checkNothing': 'nothing new',
  'event.settingsChangedFields': 'Settings changed: {fields}',
  'event.channelTested': 'Test message via "{name}" sent',
  'event.channelTestFailed': 'Test message via "{name}" failed: {error}',
  'event.loggedIn': 'Logged in',
  'event.loggedOut': 'Logged out',
  'event.passwordChanged': 'Changed own password',
  'event.userCreated': 'User "{name}" created',
  'event.userDeleted': 'User "{name}" deleted',
  'event.initialAdmin': 'User "{name}" created from INITIAL_ADMIN_USER',
  'event.started': 'Admin UI started',

  'count.newApps.one': '1 new app',
  'count.newApps.other': '{count} new apps',
  'count.updates.one': '1 update',
  'count.updates.other': '{count} updates',
  'count.errors.one': '1 error',
  'count.errors.other': '{count} errors',

  'setting.checkSchedule': 'check schedule',
  'setting.updateChannel': 'update channel',
  'setting.autoInstallNew': 'install new apps automatically',
  'setting.defaultAutoUpdate': 'update newly installed apps automatically',
  'setting.appsBaseUrl': 'public address of the apps',
  'setting.adminBaseUrl': 'address of this admin UI',
  'setting.githubToken': 'GitHub token',
  'setting.activityView': 'default view of the activity',

  'error.appSearchFailed': 'App search on GitHub failed: {error}',
  'error.checkFailed': 'Check failed: {error}',
  'error.githubLimit': 'GitHub API limit reached, available again at {time}',
  'error.githubToken': 'GitHub rejects the token – expired, revoked or not copied completely?',
  'error.githubRepos': 'GitHub API responded {status} when listing the repos',
  'error.githubRelease': 'GitHub API responded {status} for {repo}',
  'error.downloadFailed': 'Download of {name} failed (HTTP {status})',
  'error.downloadIncomplete': '{name}: download incomplete',
  'error.checksum': '{name}: SHA-256 mismatch, file discarded',
  'error.zipUnreadable': 'Zip not readable',
  'error.entryUnreadable': '{file} not readable',
  'error.invalidAppId': 'Invalid app ID: {id}',
  'error.invalidZipPath': 'Invalid path in the zip: {path}',
  'error.noIndex': 'No index.html in the zip',
  'error.noWebVersion': 'No web version available',
  'error.unknownApp': 'Unknown app',
  'error.notInstalled': '{app} is not installed',
  'error.jobRunning': 'Another action is already running for this app',
  'error.noWriteAccess': 'No write access to {path} – the data volume must belong to user 1000 (see README)',
  'error.serviceResponse': '{service} responded {status}: {text}',
  'error.serviceUnreachable': '{service} not reachable: {error}',
  'error.channelInvalid': "The channel's details are incomplete or invalid",
  'error.channelNameTaken': 'A channel with this name already exists',
  'error.timeZone': 'Unknown time zone: {zone}',
  'error.scheduleTimes': 'Enter at least one valid time',
  'error.scheduleWeekdays': 'Choose at least one weekday',
  'error.scheduleGap': 'There must be at least {minutes} minutes between two checks',
  'error.gotify': 'Gotify responded {status}: {text}',
  'error.requestRejected': 'Request rejected',
  'error.notLoggedIn': 'Not logged in',
  'error.wrongLogin': 'Wrong username or password',
  'error.passwordTooShort': 'The password must have at least {min} characters',
  'error.wrongPassword': 'The current password is wrong',
  'error.invalidUsername': 'Username: 3–64 characters, only letters, digits, . _ -',
  'error.usernameTaken': 'This username already exists',
  'error.deleteSelf': "You can't delete yourself",
  'error.tooManyAttempts': 'Too many attempts – please try again in a few minutes',
  'error.internal': 'Internal error',
  'error.notFound': 'Not found',

  'notify.updateAvailable.title': 'Update for {app}',
  'notify.updateAvailable.body': '**{change}** is available.',
  'notify.newApps.title': '{count} craft apps available',
  'notify.newApps.body': '{list}\n\n{all}',
  'notify.newApps.allAuto': 'All of them will be installed automatically.',
  'notify.newApps.allManual': 'All of them can be installed.',
  'notify.newApp.title': 'New app: {app}',
  'notify.newApp.auto': '**{app}** {version} will be installed automatically.{about}',
  'notify.newApp.manual': '**{app}** {version} can be installed.{about}',
  'notify.jobFailed.title': '{app}: {job} failed',
  'notify.updated.title': '{app} updated',
  'notify.updated.byUser': '**{from} → {to}** (by {user})',
  'notify.updated.auto': '**{from} → {to}** (automatically)',
  'notify.installed.title': '{app} installed',
  'notify.installed.body': 'Version **{version}** was installed automatically.',
  'notify.error.title': 'Error with {app}',
  'notify.error.titleGlobal': 'Craft Apps: error',
  'notify.test.title': 'Craft Apps',
  'notify.test.body': 'Test message – notifications are working.',
  'notify.open': 'Open the admin UI',
};

const CATALOG: Record<Lang, Record<MsgKey, string>> = { de, en };

/** A text in both languages, e.g. an app description */
export interface Localized {
  de: string;
  en: string;
}

/** A list of messages is rendered comma-separated, e.g. "2 updates, 1 error" */
export type MsgParam = string | number | Msg | Msg[] | Localized;

export interface Msg {
  key: MsgKey;
  params?: Record<string, MsgParam>;
}

export const msg = (key: MsgKey, params?: Record<string, MsgParam>): Msg => (params ? { key, params } : { key });

/** A count with its noun: count.<noun>.one for 1, count.<noun>.other otherwise */
export const countMsg = (noun: 'newApps' | 'updates' | 'errors', count: number): Msg =>
  count === 1 ? msg(`count.${noun}.one`) : msg(`count.${noun}.other`, { count });

export function renderMsg(lang: Lang, m: Msg): string {
  // Unknown key, e.g. from an older or newer version: show the text if there is one
  const template: string | undefined = CATALOG[lang][m.key];
  if (template === undefined) return String(m.params?.text ?? m.key);
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) => {
    const value = m.params?.[name];
    if (value === undefined) return placeholder;
    if (typeof value !== 'object') return String(value);
    if (Array.isArray(value)) return value.map((item) => renderMsg(lang, item)).join(', ');
    return 'key' in value ? renderMsg(lang, value) : value[lang];
  });
}

/** Message stored as JSON; plain text from earlier versions becomes a "raw" message. */
export function parseMsg(stored: string | null): Msg | null {
  if (!stored) return null;
  try {
    const value = JSON.parse(stored) as Partial<Msg> | null;
    if (value && typeof value.key === 'string') return value as Msg;
  } catch {
    // plain text
  }
  return msg('raw', { text: stored });
}
