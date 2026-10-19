import { useEffect, useState, type FormEvent } from 'react';
import type { SettingsView } from '../shared/types';
import { api } from './api';
import { t } from './i18n';
import { Toggle } from './Toggle';

const INTERVALS = [30, 60, 180, 360, 720, 1440] as const;

// Each language under its own name, like in the language switch
const NOTIFY_LANGUAGES = [
  { id: 'de', name: 'Deutsch' },
  { id: 'en', name: 'English' },
] as const;

type Message = { tone: 'ok' | 'error'; text: string } | null;

const intervalLabel = (minutes: number) =>
  (INTERVALS as readonly number[]).includes(minutes)
    ? t(`settings.interval.${minutes as (typeof INTERVALS)[number]}`)
    : t('settings.interval.custom', { minutes });

export function SettingsPage() {
  const [form, setForm] = useState<SettingsView | null>(null);
  const [token, setToken] = useState('');
  const [message, setMessage] = useState<Message>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<SettingsView>('GET', '/api/settings').then(setForm, (err: Error) => setMessage({ tone: 'error', text: err.message }));
  }, []);

  if (!form) return message ? <p className="banner error">{message.text}</p> : <p className="muted">{t('common.loading')}</p>;

  const set = <K extends keyof SettingsView>(key: K, value: SettingsView[K]) => setForm({ ...form, [key]: value });
  const intervals: number[] = (INTERVALS as readonly number[]).includes(form.checkIntervalMinutes)
    ? [...INTERVALS]
    : [...INTERVALS, form.checkIntervalMinutes];

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    setMessage(null);
    try {
      const { gotifyTokenSet: _, ...values } = form;
      setForm(await api<SettingsView>('PUT', '/api/settings', { ...values, ...(token ? { gotifyToken: token } : {}) }));
      setToken('');
      setMessage({ tone: 'ok', text: t('settings.saved') });
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
      await api('POST', '/api/settings/test-notification', {
        gotifyUrl: form.gotifyUrl,
        notifyLanguage: form.notifyLanguage,
        ...(token ? { gotifyToken: token } : {}),
      });
      setMessage({ tone: 'ok', text: t('settings.testSent') });
    } catch (err) {
      setMessage({ tone: 'error', text: (err as Error).message });
    }
  }

  return (
    <form onSubmit={save}>
      <section className="toolbar">
        <div>
          <h1>{t('settings.title')}</h1>
          <p className="muted">{t('settings.subtitle')}</p>
        </div>
      </section>

      <section className="panel">
        <h2>{t('settings.updates')}</h2>
        <label className="field">
          {t('settings.interval')}
          <select value={form.checkIntervalMinutes} onChange={(e) => set('checkIntervalMinutes', Number(e.target.value))}>
            {intervals.map((minutes) => (
              <option key={minutes} value={minutes}>
                {intervalLabel(minutes)}
              </option>
            ))}
          </select>
          <span className="hint">{t('settings.intervalHint')}</span>
        </label>
        <Toggle checked={form.defaultAutoUpdate} onChange={(v) => set('defaultAutoUpdate', v)}>
          {t('settings.defaultAutoUpdate')}
        </Toggle>
        <Toggle checked={form.autoInstallNew} onChange={(v) => set('autoInstallNew', v)}>
          {t('settings.autoInstallNew')}
        </Toggle>
      </section>

      <section className="panel">
        <h2>{t('settings.addresses')}</h2>
        <label className="field">
          {t('settings.appsBaseUrl')}
          <input
            type="url"
            placeholder="https://craft.example.com"
            value={form.appsBaseUrl}
            onChange={(e) => set('appsBaseUrl', e.target.value)}
          />
          <span className="hint">{t('settings.appsBaseUrlHint')}</span>
        </label>
        <label className="field">
          {t('settings.adminBaseUrl')}
          <input
            type="url"
            placeholder="https://craft-admin.example.com"
            value={form.adminBaseUrl}
            onChange={(e) => set('adminBaseUrl', e.target.value)}
          />
          <span className="hint">{t('settings.adminBaseUrlHint')}</span>
        </label>
      </section>

      <section className="panel">
        <h2>{t('settings.gotify')}</h2>
        <label className="field">
          {t('settings.gotifyUrl')}
          <input
            type="url"
            placeholder="https://gotify.example.com"
            value={form.gotifyUrl}
            onChange={(e) => set('gotifyUrl', e.target.value)}
          />
        </label>
        <label className="field">
          {t('settings.gotifyToken')}
          <input
            type="password"
            autoComplete="off"
            placeholder={form.gotifyTokenSet ? t('settings.gotifyTokenSet') : t('settings.gotifyTokenNew')}
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
        </label>
        <label className="field">
          {t('settings.notifyLanguage')}
          <select value={form.notifyLanguage} onChange={(e) => set('notifyLanguage', e.target.value === 'en' ? 'en' : 'de')}>
            {NOTIFY_LANGUAGES.map((l) => (
              <option key={l.id} value={l.id} lang={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <p className="muted small">{t('settings.notifyAbout')}</p>
        <Toggle checked={form.notifyNewApps} onChange={(v) => set('notifyNewApps', v)}>
          {t('settings.notifyNewApps')}
        </Toggle>
        <Toggle checked={form.notifyUpdateAvailable} onChange={(v) => set('notifyUpdateAvailable', v)}>
          {t('settings.notifyUpdateAvailable')}
        </Toggle>
        <Toggle checked={form.notifyUpdated} onChange={(v) => set('notifyUpdated', v)}>
          {t('settings.notifyUpdated')}
        </Toggle>
        <Toggle checked={form.notifyErrors} onChange={(v) => set('notifyErrors', v)}>
          {t('settings.notifyErrors')}
        </Toggle>
        <div className="form-actions">
          <button type="button" className="btn" onClick={sendTest}>
            {t('settings.sendTest')}
          </button>
        </div>
      </section>

      <div className="form-actions sticky-actions">
        <button className="btn primary narrow" disabled={saving}>
          {saving ? t('settings.saving') : t('settings.save')}
        </button>
        {message && <p className={message.tone === 'ok' ? 'form-ok' : 'form-error'}>{message.text}</p>}
      </div>
    </form>
  );
}
