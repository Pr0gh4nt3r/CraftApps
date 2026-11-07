import { Icon, type IconName } from '../Icon/Icon';
import { t, type UiKey } from '../../i18n/i18n';
import { setTheme, useTheme, type Theme } from '../../lib/theme';

const THEMES: { id: Theme; label: UiKey; icon: IconName }[] = [
  { id: 'light', label: 'theme.light', icon: 'sun' },
  { id: 'dark', label: 'theme.dark', icon: 'moon' },
  { id: 'system', label: 'theme.system', icon: 'monitor' },
];

/** Light | dark | as the system, next to the language in the top bar and on the login page */
export function ThemeSwitch() {
  const theme = useTheme();
  return (
    <div className="theme-switch" role="group" aria-label={t('theme.label')}>
      {THEMES.map((entry) => (
        <button
          key={entry.id}
          type="button"
          title={t(entry.label)}
          aria-label={t(entry.label)}
          aria-pressed={entry.id === theme}
          onClick={() => setTheme(entry.id)}
        >
          <Icon name={entry.icon} />
        </button>
      ))}
    </div>
  );
}
