import { useEffect, useState, type FormEvent } from 'react';
import type { SettingsView } from '../shared/types';
import { api } from './api';
import { Toggle } from './Toggle';

const INTERVALS = [
  { minutes: 30, label: 'alle 30 Minuten' },
  { minutes: 60, label: 'stündlich' },
  { minutes: 180, label: 'alle 3 Stunden' },
  { minutes: 360, label: 'alle 6 Stunden' },
  { minutes: 720, label: 'alle 12 Stunden' },
  { minutes: 1440, label: 'täglich' },
];

type Message = { tone: 'ok' | 'error'; text: string } | null;

export function SettingsPage() {
  const [form, setForm] = useState<SettingsView | null>(null);
  const [token, setToken] = useState('');
  const [message, setMessage] = useState<Message>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<SettingsView>('GET', '/api/settings').then(setForm, (err: Error) => setMessage({ tone: 'error', text: err.message }));
  }, []);

  if (!form) return message ? <p className="banner error">{message.text}</p> : <p className="muted">Lädt …</p>;

  const set = <K extends keyof SettingsView>(key: K, value: SettingsView[K]) => setForm({ ...form, [key]: value });
  const intervals = INTERVALS.some((i) => i.minutes === form.checkIntervalMinutes)
    ? INTERVALS
    : [...INTERVALS, { minutes: form.checkIntervalMinutes, label: `alle ${form.checkIntervalMinutes} Minuten` }];

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    setMessage(null);
    try {
      const { gotifyTokenSet: _, ...values } = form;
      setForm(await api<SettingsView>('PUT', '/api/settings', { ...values, ...(token ? { gotifyToken: token } : {}) }));
      setToken('');
      setMessage({ tone: 'ok', text: 'Gespeichert' });
    } catch (err) {
      setMessage({ tone: 'error', text: (err as Error).message });
    } finally {
      setSaving(false);
    }
  }

  async function sendTest() {
    if (!form) return;
    setMessage(null);
    try {
      await api('POST', '/api/settings/test-notification', { gotifyUrl: form.gotifyUrl, ...(token ? { gotifyToken: token } : {}) });
      setMessage({ tone: 'ok', text: 'Testnachricht verschickt – sieh in Gotify nach' });
    } catch (err) {
      setMessage({ tone: 'error', text: (err as Error).message });
    }
  }

  return (
    <form onSubmit={save}>
      <section className="toolbar">
        <div>
          <h1>Einstellungen</h1>
          <p className="muted">Gilt für alle Benutzer dieser Verwaltung</p>
        </div>
      </section>

      <section className="panel">
        <h2>Updates</h2>
        <label className="field">
          Auf neue Apps und Versionen prüfen
          <select value={form.checkIntervalMinutes} onChange={(e) => set('checkIntervalMinutes', Number(e.target.value))}>
            {intervals.map((i) => (
              <option key={i.minutes} value={i.minutes}>
                {i.label}
              </option>
            ))}
          </select>
          <span className="hint">Ohne GitHub-Token erlaubt GitHub 60 Anfragen pro Stunde; ein Durchlauf braucht etwa 16.</span>
        </label>
        <Toggle checked={form.defaultAutoUpdate} onChange={(v) => set('defaultAutoUpdate', v)}>
          Neu installierte Apps automatisch aktualisieren
        </Toggle>
        <Toggle checked={form.autoInstallNew} onChange={(v) => set('autoInstallNew', v)}>
          Neu erschienene Apps automatisch installieren (sonst nur benachrichtigen)
        </Toggle>
      </section>

      <section className="panel">
        <h2>Adressen</h2>
        <label className="field">
          Öffentliche Adresse der Apps
          <input
            type="url"
            placeholder="https://craft.example.com"
            value={form.appsBaseUrl}
            onChange={(e) => set('appsBaseUrl', e.target.value)}
          />
          <span className="hint">Der nginx mit den Apps, z.B. über Zoraxy – für die „Öffnen“-Knöpfe.</span>
        </label>
        <label className="field">
          Adresse dieser Verwaltung
          <input
            type="url"
            placeholder="https://craft-admin.example.com"
            value={form.adminBaseUrl}
            onChange={(e) => set('adminBaseUrl', e.target.value)}
          />
          <span className="hint">Öffnet sich, wenn du eine Benachrichtigung antippst.</span>
        </label>
      </section>

      <section className="panel">
        <h2>Benachrichtigungen über Gotify</h2>
        <label className="field">
          Gotify-Server
          <input
            type="url"
            placeholder="https://gotify.example.com"
            value={form.gotifyUrl}
            onChange={(e) => set('gotifyUrl', e.target.value)}
          />
        </label>
        <label className="field">
          App-Token
          <input
            type="password"
            autoComplete="off"
            placeholder={form.gotifyTokenSet ? 'gespeichert – leer lassen, um es zu behalten' : 'In Gotify unter „Apps“ anlegen'}
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
        </label>
        <p className="muted small">Benachrichtigen bei …</p>
        <Toggle checked={form.notifyNewApps} onChange={(v) => set('notifyNewApps', v)}>
          neuen Apps, die installiert werden können
        </Toggle>
        <Toggle checked={form.notifyUpdateAvailable} onChange={(v) => set('notifyUpdateAvailable', v)}>
          verfügbaren Updates (für Apps ohne automatische Updates)
        </Toggle>
        <Toggle checked={form.notifyUpdated} onChange={(v) => set('notifyUpdated', v)}>
          durchgeführten Updates
        </Toggle>
        <Toggle checked={form.notifyErrors} onChange={(v) => set('notifyErrors', v)}>
          Fehlern
        </Toggle>
        <div className="form-actions">
          <button type="button" className="btn" onClick={sendTest}>
            Testnachricht senden
          </button>
        </div>
      </section>

      <div className="form-actions sticky-actions">
        <button className="btn primary narrow" disabled={saving}>
          {saving ? 'Speichert …' : 'Speichern'}
        </button>
        {message && <p className={message.tone === 'ok' ? 'form-ok' : 'form-error'}>{message.text}</p>}
      </div>
    </form>
  );
}
