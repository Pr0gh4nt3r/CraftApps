import { useEffect, useState, type FormEvent } from 'react';
import type { SettingsView } from '../../../shared/types';
import { api } from '../../lib/api';
import { t } from '../../i18n/i18n';
import { Toggle } from '../../components/Toggle/Toggle';

const INTERVALS = [30, 60, 180, 360, 720, 1440] as const;

type Message = { tone: 'ok' | 'error'; text: string } | null;

const intervalLabel = (minutes: number) =>
  (INTERVALS as readonly number[]).includes(minutes)
    ? t(`settings.interval.${minutes as (typeof INTERVALS)[number]}`)
    : t('settings.interval.custom', { minutes });

export function SettingsPage() {
  const [form, setForm] = useState<SettingsView | null>(null);
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
      setForm(await api<SettingsView>('PUT', '/api/settings', form));
      setMessage({ tone: 'ok', text: t('settings.saved') });
    } catch (err) {
      setMessage({ tone: 'error', text: (err as Error).message });
    } finally {
      setSaving(false);
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

      <div className="form-actions sticky-actions">
        <button className="btn primary narrow" disabled={saving}>
          {saving ? t('settings.saving') : t('settings.save')}
        </button>
        {message && <p className={message.tone === 'ok' ? 'form-ok' : 'form-error'}>{message.text}</p>}
      </div>
    </form>
  );
}
