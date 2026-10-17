import { useEffect, useState } from 'react';
import type { MeView } from '../shared/types';
import { ActivityPage } from './ActivityPage';
import { api, onUnauthorized } from './api';
import { AppsPage } from './AppsPage';
import { Login } from './Login';
import { SettingsPage } from './SettingsPage';
import { UsersPage } from './UsersPage';

const TABS = [
  { id: 'apps', label: 'Apps' },
  { id: 'aktivitaet', label: 'Aktivität' },
  { id: 'einstellungen', label: 'Einstellungen' },
  { id: 'benutzer', label: 'Benutzer' },
] as const;

type TabId = (typeof TABS)[number]['id'];

const tabFromHash = (): TabId => TABS.find((t) => `#${t.id}` === location.hash)?.id ?? 'apps';

export function App() {
  // undefined = wird noch geprüft, null = nicht angemeldet
  const [me, setMe] = useState<MeView | null | undefined>(undefined);
  const [tab, setTab] = useState<TabId>(tabFromHash);

  useEffect(() => {
    api<MeView>('GET', '/api/auth/me').then(setMe, () => setMe(null));
    const offUnauthorized = onUnauthorized(() => setMe(null));
    const onHash = () => setTab(tabFromHash());
    window.addEventListener('hashchange', onHash);
    return () => {
      offUnauthorized();
      window.removeEventListener('hashchange', onHash);
    };
  }, []);

  if (me === undefined) return null;
  if (me === null) return <Login onLogin={setMe} />;

  async function logout() {
    await api('POST', '/api/auth/logout').catch(() => undefined);
    setMe(null);
  }

  return (
    <>
      <header className="topbar">
        <div className="brand">
          Craft<span>Apps</span>
          <small>Verwaltung</small>
        </div>
        <nav className="tabs">
          {TABS.map((t) => (
            <a key={t.id} href={`#${t.id}`} className={t.id === tab ? 'active' : undefined}>
              {t.label}
            </a>
          ))}
        </nav>
        <div className="user">
          {me.username}
          <button className="link" onClick={logout}>
            Abmelden
          </button>
        </div>
      </header>
      <main>
        {tab === 'apps' && <AppsPage />}
        {tab === 'aktivitaet' && <ActivityPage />}
        {tab === 'einstellungen' && <SettingsPage />}
        {tab === 'benutzer' && <UsersPage me={me} />}
      </main>
    </>
  );
}
