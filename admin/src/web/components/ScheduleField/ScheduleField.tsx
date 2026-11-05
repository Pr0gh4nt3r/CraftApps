import { useMemo } from 'react';
import {
  CHECK_INTERVALS,
  currentTime,
  nextRuns,
  prepareSchedule,
  scheduleProblem,
  timesKind,
  type CheckInterval,
  type CheckSchedule,
} from '../../../shared/schedule';
import { getLocale, t, tm } from '../../i18n/i18n';

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];
const MONTH_DAYS = Array.from({ length: 31 }, (_, i) => i + 1);
const pad = (n: number) => String(n).padStart(2, '0');

/** Short weekday name in the UI's language – 1 January 2024 was a Monday */
const weekdayName = (day: number) =>
  new Date(Date.UTC(2024, 0, day)).toLocaleDateString(getLocale(), { weekday: 'short', timeZone: 'UTC' });

const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Every time zone the browser knows, plus the saved one, the browser's and UTC */
function timeZones(current: string): string[] {
  const known = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  return [...new Set([...known, current, browserZone(), 'UTC'])].sort();
}

interface Props {
  value: CheckSchedule;
  onChange: (schedule: CheckSchedule) => void;
}

/** When to check: interval, weekdays or day of the month, times and time zone – with a preview */
export function ScheduleField({ value, onChange }: Props) {
  const set = <K extends keyof CheckSchedule>(key: K, next: CheckSchedule[K]) => onChange({ ...value, [key]: next });
  const kind = timesKind(value.interval);
  const zones = useMemo(() => timeZones(value.timeZone), [value.timeZone]);

  // The preview shows what the server will save: empty times become the current one
  const prepared = prepareSchedule(value, value.anchor);
  const problem = scheduleProblem(prepared);
  const preview = problem ? [] : nextRuns(prepared, new Date(), 3);
  const formatRun = (at: Date) =>
    at.toLocaleString(getLocale(), {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      // Quarterly the next check may be next year
      ...(at.getFullYear() !== new Date().getFullYear() && { year: 'numeric' }),
      hour: '2-digit',
      minute: '2-digit',
      timeZone: prepared.timeZone,
    });

  const setTime = (index: number, time: string) => set('times', value.times.map((old, i) => (i === index ? time : old)));
  // For the intervals where only the minute counts, equal minutes become one entry
  const changeInterval = (interval: CheckInterval) => {
    const times =
      timesKind(interval) === 'minute'
        ? [...new Set(value.times.map((time) => (time ? `00:${time.slice(3)}` : time)))]
        : value.times;
    onChange({ ...value, interval, times });
  };
  const toggleWeekday = (day: number) =>
    set('weekdays', value.weekdays.includes(day) ? value.weekdays.filter((d) => d !== day) : [...value.weekdays, day]);

  return (
    <>
      <label className="field">
        {t('settings.interval')}
        <select value={value.interval} onChange={(e) => changeInterval(e.target.value as CheckInterval)}>
          {CHECK_INTERVALS.map((interval) => (
            <option key={interval} value={interval}>
              {t(`settings.interval.${interval}`)}
            </option>
          ))}
        </select>
        <span className="hint">{t('settings.intervalHint')}</span>
      </label>

      {(value.interval === '1w' || value.interval === '2w') && (
        <div className="field" role="group" aria-label={t('settings.weekdays')}>
          <span>{t('settings.weekdays')}</span>
          <div className="schedule-row">
            {WEEKDAYS.map((day) => (
              <button
                key={day}
                type="button"
                className="weekday"
                aria-pressed={value.weekdays.includes(day)}
                onClick={() => toggleWeekday(day)}
              >
                {weekdayName(day)}
              </button>
            ))}
          </div>
        </div>
      )}

      {(value.interval === '1M' || value.interval === '3M') && (
        <label className="field">
          {t('settings.monthDay')}
          <select value={value.monthDay} onChange={(e) => set('monthDay', Number(e.target.value))}>
            {MONTH_DAYS.map((day) => (
              <option key={day} value={day}>
                {t('settings.monthDayOption', { day })}
              </option>
            ))}
          </select>
          <span className="hint">
            {t(value.interval === '3M' ? 'settings.monthDayHintQuarter' : 'settings.monthDayHint')}
          </span>
        </label>
      )}

      <div className="field" role="group" aria-label={t(`settings.times.${kind}`)}>
        <span>{t(`settings.times.${kind}`)}</span>
        <div className="schedule-row">
          {value.times.map((time, index) => (
            <span key={index} className="schedule-time">
              {kind === 'minute' ? (
                // Only the minute counts – kept as 00:MM
                <input
                  type="number"
                  min={0}
                  max={59}
                  aria-label={t('settings.minute')}
                  placeholder={currentTime(value.timeZone).slice(3)}
                  value={time.slice(3)}
                  onChange={(e) =>
                    setTime(index, e.target.value === '' ? '' : `00:${pad(Math.min(59, Math.max(0, Number(e.target.value))))}`)
                  }
                />
              ) : (
                <input type="time" value={time} onChange={(e) => setTime(index, e.target.value)} />
              )}
              <button
                type="button"
                className="btn square"
                aria-label={t('settings.timeRemove')}
                title={t('settings.timeRemove')}
                disabled={value.times.length === 1}
                onClick={() => set('times', value.times.filter((_, i) => i !== index))}
              >
                ×
              </button>
            </span>
          ))}
          <button
            type="button"
            className="btn"
            disabled={value.times.length >= 48}
            onClick={() => set('times', [...value.times, currentTime(value.timeZone)])}
          >
            {t('settings.timeAdd')}
          </button>
        </div>
        <span className="hint">{t(`settings.timesHint.${kind}`)}</span>
      </div>

      <label className="field">
        {t('settings.timeZone')}
        <select value={value.timeZone} onChange={(e) => set('timeZone', e.target.value)}>
          {zones.map((zone) => (
            <option key={zone} value={zone}>
              {zone}
            </option>
          ))}
        </select>
        <span className="hint">
          {value.timeZone === browserZone() ? (
            t('settings.timeZoneHint')
          ) : (
            <>
              {t('settings.timeZoneBrowser', { zone: browserZone() })}
              <button type="button" className="link" onClick={() => set('timeZone', browserZone())}>
                {t('settings.timeZoneUse')}
              </button>
            </>
          )}
        </span>
      </label>

      <p className={problem ? 'form-error schedule-preview' : 'muted schedule-preview'}>
        {problem ? tm(problem) : t('settings.nextRuns', { list: preview.map(formatRun).join(' · ') })}
      </p>
    </>
  );
}
