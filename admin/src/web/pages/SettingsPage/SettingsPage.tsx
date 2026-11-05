import { useEffect, useState, type FormEvent } from 'react';
import type { SettingsUpdate, SettingsView } from '../../../shared/types';
import { api } from '../../lib/api';
import { hasText, t } from '../../i18n/i18n';
import { ScheduleField } from '../../components/ScheduleField/ScheduleField';
import { Toggle } from '../../components/Toggle/Toggle';

type Message = { tone: 'ok' | 'error'; text: string } | null;

/** Known channels have a label, others (nightly, preview, …) go by their name */
const channelLabel = (channel: string) => {
  const key = `settings.channel.${channel}`;
  return hasText(key) ? t(key) : channel;
};

/** The empty token field tells where the token in use comes from */
function tokenPlaceholder(source: SettingsView['githubTokenSource'], removing: boolean): string {
  if (removing) return t('settings.githubTokenRemoved');
  if (source === 'settings') return t('settings.githubTokenSaved');
  if (source === 'env') return t('settings.githubTokenEnv');
  return 'github_pat_…';
}

export function SettingsPage() {
  const [form, setForm] = useState<SettingsView | null>(null);
  // A new GitHub token – it only goes to the server; empty keeps the saved one
  const [token, setToken] = useState('');
  const [removeToken, setRemoveToken] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<SettingsView>('GET', '/api/settings').then(setForm, (err: Error) => setMessage({ tone: 'error', text: err.message }));
  }, []);

  if (!form) return message ? <p className="banner error">{message.text}</p> : <p className="muted">{t('common.loading')}</p>;

  const set = <K extends keyof SettingsView>(key: K, value: SettingsView[K]) => setForm({ ...form, [key]: value });
  // The saved channel stays selectable even when no app has releases in it right now
  const channels = form.releaseChannels.includes(form.updateChannel)
    ? form.releaseChannels
    : [...form.releaseChannels, form.updateChannel];

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    setMessage(null);
    const { githubTokenSource: _, releaseChannels: __, ...values } = form;
    const update: SettingsUpdate = values;
    // The token only goes along when it changes: a new one, or null to remove the saved one
    if (token) update.githubToken = token;
    else if (removeToken) update.githubToken = null;
    try {
      setForm(await api<SettingsView>('PUT', '/api/settings', update));
      setToken('');
      setRemoveToken(false);
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
        <ScheduleField value={form.checkSchedule} onChange={(schedule) => set('checkSchedule', schedule)} />
        <label className="field">
          {t('settings.channel')}
          <select value={form.updateChannel} onChange={(e) => set('updateChannel', e.target.value)}>
            {channels.map((channel) => (
              <option key={channel} value={channel}>
                {channelLabel(channel)}
              </option>
            ))}
          </select>
          <span className="hint">
            {t('settings.channelHint')}
            {form.releaseChannels.length === 1 && ` ${t('settings.channelOnlyStable')}`}
          </span>
        </label>
        <Toggle checked={form.defaultAutoUpdate} onChange={(v) => set('defaultAutoUpdate', v)}>
          {t('settings.defaultAutoUpdate')}
        </Toggle>
        <Toggle checked={form.autoInstallNew} onChange={(v) => set('autoInstallNew', v)}>
          {t('settings.autoInstallNew')}
        </Toggle>
      </section>

      <section className="panel">
        <h2>{t('settings.github')}</h2>
        <div className="field">
          <label htmlFor="github-token">{t('settings.githubToken')}</label>
          <input
            id="github-token"
            type="password"
            value={token}
            pattern="[\x21-\x7E]+"
            maxLength={255}
            placeholder={tokenPlaceholder(form.githubTokenSource, removeToken)}
            // Keeps the browser from filling in the login password
            autoComplete="new-password"
            onChange={(e) => setToken(e.target.value)}
          />
          <span className="hint">
            {t('settings.githubTokenHint')}
            {form.githubTokenSource === 'settings' && !removeToken && (
              <button type="button" className="link" onClick={() => setRemoveToken(true)}>
                {t('settings.githubTokenRemove')}
              </button>
            )}
          </span>
        </div>
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
