import { useEffect, useRef, useState } from 'react';
import type { MeView } from '../../shared/types';
import { ActivityPage } from '../pages/ActivityPage/ActivityPage';
import { api, onUnauthorized } from '../lib/api';
import { AppsPage } from '../pages/AppsPage/AppsPage';
import { LogoutIcon, UserIcon } from './Icons';
import { t, useLang } from '../i18n/i18n';
import { LangSwitch } from '../components/LangSwitch/LangSwitch';
import { Login } from '../pages/Login/Login';
import { NotificationsPage } from '../pages/NotificationsPage/NotificationsPage';
import { SettingsPage } from '../pages/SettingsPage/SettingsPage';
import { UsersPage } from '../pages/UsersPage/UsersPage';

// The ids end up in the URL (#einstellungen) and stay the same in every language. Pages with
// forms are a narrow column in the middle of the screen, the others use its width.
const TABS = [
  { id: 'apps', label: 'tab.apps', column: false },
  { id: 'aktivitaet', label: 'tab.activity', column: false },
  { id: 'benachrichtigungen', label: 'tab.notifications', column: true },
  { id: 'einstellungen', label: 'tab.settings', column: true },
  { id: 'benutzer', label: 'tab.users', column: true },
] as const;

type TabId = (typeof TABS)[number]['id'];

/** Menus of the top bar on narrow screens: the tabs (burger) or name and logout (user) */
type Menu = 'tabs' | 'user';

const tabFromHash = (): TabId => TABS.find((entry) => `#${entry.id}` === location.hash)?.id ?? 'apps';

export function App() {
  // undefined = still checking, null = not logged in
  const [me, setMe] = useState<MeView | null | undefined>(undefined);
  const [tab, setTab] = useState<TabId>(tabFromHash);
  const [open, setOpen] = useState<Menu | null>(null);
  const headerRef = useRef<HTMLElement>(null);
  const tabsButton = useRef<HTMLButtonElement>(null);
  const userButton = useRef<HTMLButtonElement>(null);
  // Changing the language renders the whole UI again
  const lang = useLang();

  useEffect(() => {
    document.title = t('app.title');
  }, [lang]);

  useEffect(() => {
    api<MeView>('GET', '/api/auth/me').then(setMe, () => setMe(null));
    const offUnauthorized = onUnauthorized(() => {
      setMe(null);
      setOpen(null);
    });
    const onHash = () => {
      setTab(tabFromHash());
      setOpen(null);
    };
    window.addEventListener('hashchange', onHash);
    return () => {
      offUnauthorized();
      window.removeEventListener('hashchange', onHash);
    };
  }, []);

  // An open menu closes on a click outside the top bar and on Escape
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!headerRef.current?.contains(e.target as Node)) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(null);
      (open === 'tabs' ? tabsButton : userButton).current?.focus();
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (me === undefined) return null;
  if (me === null) return <Login onLogin={setMe} />;

  async function logout() {
    await api('POST', '/api/auth/logout').catch(() => undefined);
    setMe(null);
    setOpen(null);
  }

  const toggle = (menu: Menu) => setOpen((current) => (current === menu ? null : menu));

  return (
    <>
      <header className="topbar" ref={headerRef}>
        <div className="brand">
          Craft<span>Apps</span>
          <small>{t('app.subtitle')}</small>
        </div>
        {/* In the bar; on narrow screens in the burger menu */}
        <nav id="topbar-tabs" className={open === 'tabs' ? 'tabs open' : 'tabs'}>
          {TABS.map((entry) => (
            <a
              key={entry.id}
              href={`#${entry.id}`}
              className={entry.id === tab ? 'active' : undefined}
              onClick={() => setOpen(null)}
            >
              {t(entry.label)}
            </a>
          ))}
        </nav>
        <div className="topbar-side">
          <LangSwitch />
          <button
            ref={userButton}
            type="button"
            className="bar-button user-toggle"
            aria-label={t('app.userMenu')}
            title={t('app.userMenu')}
            aria-expanded={open === 'user'}
            aria-controls="topbar-user"
            onClick={() => toggle('user')}
          >
            <UserIcon />
          </button>
          {/* In the bar; on narrow screens in the user menu */}
          <div id="topbar-user" className={open === 'user' ? 'user open' : 'user'}>
            {me.username}
            <button type="button" className="logout" aria-label={t('app.logout')} title={t('app.logout')} onClick={logout}>
              <LogoutIcon />
            </button>
          </div>
          <button
            ref={tabsButton}
            type="button"
            className="bar-button menu-toggle"
            aria-label={t('app.menu')}
            aria-expanded={open === 'tabs'}
            aria-controls="topbar-tabs"
            onClick={() => toggle('tabs')}
          >
            <span aria-hidden="true" />
          </button>
        </div>
      </header>
      <main className={TABS.find((entry) => entry.id === tab)?.column ? 'column' : undefined}>
        {tab === 'apps' && <AppsPage />}
        {tab === 'aktivitaet' && <ActivityPage />}
        {tab === 'benachrichtigungen' && <NotificationsPage />}
        {tab === 'einstellungen' && <SettingsPage />}
        {tab === 'benutzer' && <UsersPage me={me} />}
      </main>
    </>
  );
}
