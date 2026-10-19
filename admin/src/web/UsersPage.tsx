import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { MeView, UserView } from '../shared/types';
import { api } from './api';
import { formatDateTime } from './format';
import { t } from './i18n';

type Message = { tone: 'ok' | 'error'; text: string } | null;

function Feedback({ message }: { message: Message }) {
  return message ? <p className={message.tone === 'ok' ? 'form-ok' : 'form-error'}>{message.text}</p> : null;
}

export function UsersPage({ me }: { me: MeView }) {
  const [users, setUsers] = useState<UserView[]>([]);
  const [listMessage, setListMessage] = useState<Message>(null);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [passwordMessage, setPasswordMessage] = useState<Message>(null);
  const [newName, setNewName] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const load = useCallback(
    () => api<UserView[]>('GET', '/api/users').then(setUsers, (err: Error) => setListMessage({ tone: 'error', text: err.message })),
    [],
  );
  useEffect(() => void load(), [load]);

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    try {
      await api('POST', '/api/auth/password', { current, next });
      setCurrent('');
      setNext('');
      setPasswordMessage({ tone: 'ok', text: t('users.passwordChanged') });
    } catch (err) {
      setPasswordMessage({ tone: 'error', text: (err as Error).message });
    }
  }

  async function addUser(e: FormEvent) {
    e.preventDefault();
    try {
      await api('POST', '/api/users', { username: newName, password: newPassword });
      setListMessage({ tone: 'ok', text: t('users.created', { name: newName }) });
      setNewName('');
      setNewPassword('');
      await load();
    } catch (err) {
      setListMessage({ tone: 'error', text: (err as Error).message });
    }
  }

  async function removeUser(user: UserView) {
    if (!window.confirm(t('users.confirmDelete', { name: user.username }))) return;
    try {
      await api('DELETE', `/api/users/${user.id}`);
      setListMessage({ tone: 'ok', text: t('users.deleted', { name: user.username }) });
      await load();
    } catch (err) {
      setListMessage({ tone: 'error', text: (err as Error).message });
    }
  }

  return (
    <>
      <section className="toolbar">
        <div>
          <h1>{t('users.title')}</h1>
          <p className="muted">{t('users.subtitle')}</p>
        </div>
      </section>

      <form className="panel" onSubmit={changePassword}>
        <h2>{t('users.myPassword')}</h2>
        <label className="field">
          {t('users.currentPassword')}
          <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
        </label>
        <label className="field">
          {t('users.newPassword')}
          <input
            type="password"
            autoComplete="new-password"
            minLength={10}
            value={next}
            onChange={(e) => setNext(e.target.value)}
            required
          />
          <span className="hint">{t('users.passwordHint')}</span>
        </label>
        <div className="form-actions">
          <button className="btn">{t('users.changePassword')}</button>
          <Feedback message={passwordMessage} />
        </div>
      </form>

      <section className="panel">
        <h2>{t('users.all')}</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t('users.name')}</th>
                <th>{t('users.createdAt')}</th>
                <th>{t('users.lastLogin')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    {u.username}
                    {u.id === me.id && <span className="muted"> {t('users.you')}</span>}
                  </td>
                  <td className="nowrap mono">{formatDateTime(u.createdAt)}</td>
                  <td className="nowrap mono">{formatDateTime(u.lastLoginAt)}</td>
                  <td className="right">
                    {u.id !== me.id && (
                      <button className="link danger" onClick={() => removeUser(u)}>
                        {t('users.delete')}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <form className="inline-form" onSubmit={addUser}>
          <label className="field">
            {t('users.newUser')}
            <input autoComplete="off" value={newName} onChange={(e) => setNewName(e.target.value)} required />
          </label>
          <label className="field">
            {t('users.password')}
            <input
              type="password"
              autoComplete="new-password"
              minLength={10}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
          </label>
          <button className="btn">{t('users.create')}</button>
        </form>
        <Feedback message={listMessage} />
      </section>
    </>
  );
}
