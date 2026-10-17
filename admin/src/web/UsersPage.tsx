import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { MeView, UserView } from '../shared/types';
import { api } from './api';
import { formatDateTime } from './format';

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

  const load = useCallback(async () => {
    try {
      setUsers(await api<UserView[]>('GET', '/api/users'));
    } catch (err) {
      setListMessage({ tone: 'error', text: (err as Error).message });
    }
  }, []);
  useEffect(() => void load(), [load]);

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    try {
      await api('POST', '/api/auth/password', { current, next });
      setCurrent('');
      setNext('');
      setPasswordMessage({ tone: 'ok', text: 'Passwort geändert – andere Sitzungen wurden abgemeldet' });
    } catch (err) {
      setPasswordMessage({ tone: 'error', text: (err as Error).message });
    }
  }

  async function addUser(e: FormEvent) {
    e.preventDefault();
    try {
      await api('POST', '/api/users', { username: newName, password: newPassword });
      setListMessage({ tone: 'ok', text: `${newName} angelegt` });
      setNewName('');
      setNewPassword('');
      await load();
    } catch (err) {
      setListMessage({ tone: 'error', text: (err as Error).message });
    }
  }

  async function removeUser(user: UserView) {
    if (!window.confirm(`${user.username} löschen?`)) return;
    try {
      await api('DELETE', `/api/users/${user.id}`);
      setListMessage({ tone: 'ok', text: `${user.username} gelöscht` });
      await load();
    } catch (err) {
      setListMessage({ tone: 'error', text: (err as Error).message });
    }
  }

  return (
    <>
      <section className="toolbar">
        <div>
          <h1>Benutzer</h1>
          <p className="muted">Alle Benutzer haben die gleichen Rechte</p>
        </div>
      </section>

      <form className="panel" onSubmit={changePassword}>
        <h2>Mein Passwort ändern</h2>
        <label className="field">
          Aktuelles Passwort
          <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
        </label>
        <label className="field">
          Neues Passwort
          <input
            type="password"
            autoComplete="new-password"
            minLength={10}
            value={next}
            onChange={(e) => setNext(e.target.value)}
            required
          />
          <span className="hint">Mindestens 10 Zeichen</span>
        </label>
        <div className="form-actions">
          <button className="btn">Passwort ändern</button>
          <Feedback message={passwordMessage} />
        </div>
      </form>

      <section className="panel">
        <h2>Alle Benutzer</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Angelegt</th>
                <th>Zuletzt angemeldet</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    {u.username}
                    {u.id === me.id && <span className="muted"> (du)</span>}
                  </td>
                  <td className="nowrap mono">{formatDateTime(u.createdAt)}</td>
                  <td className="nowrap mono">{formatDateTime(u.lastLoginAt)}</td>
                  <td className="right">
                    {u.id !== me.id && (
                      <button className="link danger" onClick={() => removeUser(u)}>
                        Löschen
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
            Neuer Benutzer
            <input autoComplete="off" value={newName} onChange={(e) => setNewName(e.target.value)} required />
          </label>
          <label className="field">
            Passwort
            <input
              type="password"
              autoComplete="new-password"
              minLength={10}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
          </label>
          <button className="btn">Anlegen</button>
        </form>
        <Feedback message={listMessage} />
      </section>
    </>
  );
}
