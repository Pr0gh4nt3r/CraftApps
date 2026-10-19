import { useState, type FormEvent } from 'react';
import type { MeView } from '../../../shared/types';
import { api } from '../../lib/api';
import { t } from '../../i18n/i18n';
import { LangSwitch } from '../../components/LangSwitch/LangSwitch';

export function Login({ onLogin }: { onLogin: (me: MeView) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onLogin(await api<MeView>('POST', '/api/auth/login', { username, password }));
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <form className="login-box" onSubmit={submit}>
        <div className="login-head">
          <h1>
            Craft<span>Apps</span>
          </h1>
          <LangSwitch />
        </div>
        <p className="muted">{t('login.prompt')}</p>
        <label className="field">
          {t('login.username')}
          <input autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus />
        </label>
        <label className="field">
          {t('login.password')}
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error && <p className="form-error">{error}</p>}
        <button className="btn primary" disabled={busy}>
          {busy ? t('login.submitting') : t('login.submit')}
        </button>
      </form>
    </div>
  );
}
