import type { ActivityColumn } from '../../shared/activity';
import type { UiKey } from '../i18n/i18n';

/** Headings of the activity log's columns – they name the columns in the choice as well */
export const COLUMN_LABELS: Record<ActivityColumn, UiKey> = {
  time: 'activity.time',
  app: 'activity.app',
  kind: 'activity.kind',
  what: 'activity.what',
  by: 'activity.by',
};
