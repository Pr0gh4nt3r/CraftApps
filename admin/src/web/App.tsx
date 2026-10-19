import { useEffect, useState } from 'react';
import type { MeView } from '../shared/types';
import { ActivityPage } from './ActivityPage';
import { api, onUnauthorized } from './api';
import { AppsPage } from './AppsPage';
import { t, useLang } from './i18n';
import { LangSwitch } from './LangSwitch';
import { Login } from './Login';
import { SettingsPage } from './SettingsPage';
import { UsersPage } from './UsersPage';

// The ids end up in the URL (#einstellungen) and stay the same in every language
const TABS = [
  { id: 'apps', label: 'tab.apps' },
  { id: 'aktivitaet', label: 'tab.activity' },
  { id: 'einstellungen', label: 'tab.settings' },
  { id: 'benutzer', label: 'tab.users' },
] as const;

type TabId = (typeof TABS)[number]['id'];

const tabFromHash = (): TabId => TABS.find((entry) => `#${entry.id}` === location.hash)?.id ?? 'apps';

export function App() {
  // undefined = still checking, null = not logged in
  const [me, setMe] = useState<MeView | null | undefined>(undefined);
  const [tab, setTab] = useState<TabId>(tabFromHash);
  // Changing the language renders the whole UI again
  const lang = useLang();

  useEffect(() => {
    document.title = t('app.title');
  }, [lang]);

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
          <small>{t('app.subtitle')}</small>
        </div>
        <nav className="tabs">
          {TABS.map((entry) => (
            <a key={entry.id} href={`#${entry.id}`} className={entry.id === tab ? 'active' : undefined}>
              {t(entry.label)}
            </a>
          ))}
        </nav>
        <div className="user">
          <LangSwitch />
          {me.username}
          <button className="link" onClick={logout}>
            {t('app.logout')}
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
