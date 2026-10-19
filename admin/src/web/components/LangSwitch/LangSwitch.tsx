import type { Lang } from '../../../shared/messages';
import { setLang, t, useLang } from '../../i18n/i18n';

const LANGS: { id: Lang; label: string; name: string }[] = [
  { id: 'de', label: 'DE', name: 'Deutsch' },
  { id: 'en', label: 'EN', name: 'English' },
];

export function LangSwitch() {
  const lang = useLang();
  return (
    <div className="lang-switch" role="group" aria-label={t('lang.label')}>
      {LANGS.map((l) => (
        <button
          key={l.id}
          type="button"
          lang={l.id}
          title={l.name}
          aria-pressed={l.id === lang}
          className={l.id === lang ? 'active' : undefined}
          onClick={() => setLang(l.id)}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
