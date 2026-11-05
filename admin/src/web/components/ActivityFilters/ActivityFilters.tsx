import {
  ACTIVITY_COLUMNS,
  ACTIVITY_GROUP_IDS,
  type ActivityColumn,
  type ActivityGroup,
} from '../../../shared/activity';
import { t } from '../../i18n/i18n';
import { COLUMN_LABELS } from '../../lib/activity';
import { MultiSelect } from '../MultiSelect/MultiSelect';

interface Props<T extends string> {
  selected: T[];
  onChange: (selected: T[]) => void;
  /** At least this many stay ticked */
  minSelected?: number;
}

/** Which kinds of entries the activity log shows – in the list and as default in the settings */
export function KindFilter({ selected, onChange, minSelected = 0 }: Props<ActivityGroup>) {
  return (
    <MultiSelect
      label={t('activity.filter')}
      options={ACTIVITY_GROUP_IDS.map((group) => ({ value: group, label: t(`activity.filter.${group}`) }))}
      selected={selected}
      onChange={onChange}
      minSelected={minSelected}
      allLabel={t('activity.filter.all')}
      noneLabel={t('activity.filter.none')}
      someLabel={(count, total) => t('activity.filter.some', { count, total })}
    />
  );
}

/** Which columns the activity log shows – at least one */
export function ColumnFilter({ selected, onChange }: Props<ActivityColumn>) {
  return (
    <MultiSelect
      label={t('activity.columns')}
      className="narrow"
      options={ACTIVITY_COLUMNS.map((column) => ({ value: column, label: t(COLUMN_LABELS[column]) }))}
      selected={selected}
      onChange={onChange}
      minSelected={1}
      allLabel={t('activity.columns.all')}
      noneLabel={t('activity.filter.none')}
      someLabel={(count, total) => t('activity.columns.some', { count, total })}
    />
  );
}
