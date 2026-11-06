import { SORTS, type Layout, type Sort } from '../../lib/appsView';
import { t } from '../../i18n/i18n';
import { GridIcon, ListIcon } from '../../App/Icons';
import { Select } from '../Select/Select';

interface Props {
  sort: Sort;
  onSort: (sort: Sort) => void;
  query: string;
  onQuery: (query: string) => void;
  layout: Layout;
  onLayout: (layout: Layout) => void;
}

/** Order, search and layout of the apps, like the bar above the apps in the launcher */
export function AppsControls({ sort, onSort, query, onQuery, layout, onLayout }: Props) {
  return (
    <div className="apps-controls">
      <label className="apps-sort">
        <span className="apps-sort-label">{t('apps.sort')}</span>
        <Select value={sort} onChange={(e) => onSort(e.target.value as Sort)}>
          {SORTS.map((key) => (
            <option key={key} value={key}>
              {t(`apps.sort.${key}`)}
            </option>
          ))}
        </Select>
      </label>
      <input
        className="apps-search"
        type="search"
        value={query}
        placeholder={t('apps.search')}
        aria-label={t('apps.search')}
        onChange={(e) => onQuery(e.target.value)}
      />
      <div className="layout-switch" role="group" aria-label={t('apps.layout')}>
        {(['grid', 'list'] as const).map((entry) => (
          <button
            key={entry}
            type="button"
            title={t(`apps.layout.${entry}`)}
            aria-label={t(`apps.layout.${entry}`)}
            aria-pressed={layout === entry}
            className={layout === entry ? 'active' : undefined}
            onClick={() => onLayout(entry)}
          >
            {entry === 'grid' ? <GridIcon /> : <ListIcon />}
          </button>
        ))}
      </div>
    </div>
  );
}
