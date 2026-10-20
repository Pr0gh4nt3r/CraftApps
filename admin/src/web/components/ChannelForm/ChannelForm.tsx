import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  CHANNEL_TYPES,
  NOTIFY_EVENTS,
  channelFields,
  type CHANNEL_FIELDS,
  type ChannelField,
  type ChannelType,
  type NotifyEvent,
} from '../../../shared/channels';
import type { Lang } from '../../../shared/messages';
import type { ChannelInput, ChannelView, NewChannel } from '../../../shared/types';
import { api } from '../../lib/api';
import { getLang, hasText, t } from '../../i18n/i18n';
import { Toggle } from '../Toggle/Toggle';

// Each language under its own name, like in the language switch
const LANGUAGES = [
  { id: 'de', name: 'Deutsch' },
  { id: 'en', name: 'English' },
] as const;

// Text keys derived from the fields – a key missing in the locales fails the build
type FieldOf<T extends ChannelType> = (typeof CHANNEL_FIELDS)[T][number];
type FieldKey = { [T in ChannelType]: `${T}.${FieldOf<T>['key']}` }[ChannelType];
type OptionKey = {
  [T in ChannelType]: FieldOf<T> extends infer F
    ? F extends { key: string; options: readonly string[] }
      ? `${T}.${F['key']}.${F['options'][number]}`
      : never
    : never;
}[ChannelType];

const fieldLabel = (type: ChannelType, field: ChannelField) =>
  t(`channels.field.${type}.${field.key}` as `channels.field.${FieldKey}`);
const optionLabel = (type: ChannelType, field: ChannelField, option: string) =>
  t(`channels.option.${type}.${field.key}.${option}` as `channels.option.${OptionKey}`);

function fieldHint(type: ChannelType, field: ChannelField): string | null {
  const key = `channels.hint.${type}.${field.key}`;
  return hasText(key) ? t(key) : null;
}

/** Form values as in the inputs: all text */
type Values = Record<string, string>;

const defaults = (type: ChannelType): Values =>
  Object.fromEntries(channelFields(type).map((field) => [field.key, String(field.default ?? '')]));

type Message = { tone: 'ok' | 'error'; text: string } | null;

/** Creates a channel (channel null) or changes one; secrets only go to the server. */
export function ChannelForm({
  channel,
  onSaved,
  onCancel,
}: {
  channel: ChannelView | null;
  onSaved: (channel: ChannelView) => void;
  onCancel: () => void;
}) {
  const [type, setType] = useState<ChannelType>(channel?.type ?? 'gotify');
  const [name, setName] = useState(channel?.name ?? t('channels.type.gotify'));
  const [enabled, setEnabled] = useState(channel?.enabled ?? true);
  const [language, setLanguage] = useState<Lang>(channel?.language ?? getLang());
  const [events, setEvents] = useState<NotifyEvent[]>(channel?.events ?? [...NOTIFY_EVENTS]);
  const [values, setValues] = useState<Values>(() =>
    channel
      ? { ...defaults(channel.type), ...Object.fromEntries(Object.entries(channel.config).map(([key, v]) => [key, String(v)])) }
      : defaults('gotify'),
  );
  // Stored secrets to be removed when saving
  const [removed, setRemoved] = useState<string[]>([]);
  const [message, setMessage] = useState<Message>(null);
  const [busy, setBusy] = useState<'save' | 'test' | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // In braces: newer browsers return a promise, React would take it for the cleanup function
  useEffect(() => {
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const stored = (key: string) => channel?.secretsSet.includes(key) === true;
  const set = (key: string, value: string) => setValues({ ...values, [key]: value });

  function changeType(next: ChannelType) {
    // A name nobody changed follows the type
    if (name === t(`channels.type.${type}`)) setName(t(`channels.type.${next}`));
    setType(next);
    setValues(defaults(next));
  }

  /** For the server: an empty secret keeps the stored value, null removes it */
  function config(): ChannelInput['config'] {
    return Object.fromEntries(
      channelFields(type).map((field) => {
        const value = values[field.key];
        return [field.key, field.secret && value === '' && removed.includes(field.key) ? null : value];
      }),
    );
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy('save');
    setMessage(null);
    const input: ChannelInput = { name, enabled, language, events, config: config() };
    try {
      onSaved(
        channel
          ? await api<ChannelView>('PUT', `/api/channels/${channel.id}`, input)
          : await api<ChannelView>('POST', '/api/channels', { ...input, type } satisfies NewChannel),
      );
    } catch (err) {
      setMessage({ tone: 'error', text: (err as Error).message });
      setBusy(null);
    }
  }

  async function sendTest() {
    if (!formRef.current?.reportValidity()) return;
    setBusy('test');
    setMessage(null);
    try {
      await api('POST', '/api/channels/test', { id: channel?.id, type, language, config: config() });
      setMessage({ tone: 'ok', text: t('channels.testSentForm') });
    } catch (err) {
      setMessage({ tone: 'error', text: (err as Error).message });
    } finally {
      setBusy(null);
    }
  }

  function placeholder(field: ChannelField): string | undefined {
    if (!field.secret || !stored(field.key)) return field.placeholder;
    return removed.includes(field.key) ? t('channels.secretRemoved') : t('channels.secretSet');
  }

  return (
    <form ref={formRef} className="panel channel-form" onSubmit={save}>
      <h2>{channel ? t('channels.editTitle', { name: channel.name }) : t('channels.new')}</h2>
      <label className="field">
        {t('channels.type')}
        <select value={type} disabled={channel !== null} onChange={(e) => changeType(e.target.value as ChannelType)}>
          {CHANNEL_TYPES.map((id) => (
            <option key={id} value={id}>
              {t(`channels.type.${id}`)}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        {t('channels.name')}
        <input value={name} maxLength={64} required onChange={(e) => setName(e.target.value)} />
        <span className="hint">{t('channels.nameHint')}</span>
      </label>
      <Toggle checked={enabled} onChange={setEnabled}>
        {t('channels.enabled')}
      </Toggle>

      {channelFields(type).map((field) => {
        const id = `channel-${field.key}`;
        const hint = fieldHint(type, field);
        // Optional secrets can be removed, required ones only replaced
        const removable = field.secret && !field.required && stored(field.key) && !removed.includes(field.key);
        return (
          <div className="field" key={`${type}.${field.key}`}>
            <label htmlFor={id}>{fieldLabel(type, field)}</label>
            {field.input === 'select' ? (
              <select id={id} value={values[field.key]} onChange={(e) => set(field.key, e.target.value)}>
                {field.options?.map((option) => (
                  <option key={option} value={option}>
                    {optionLabel(type, field, option)}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id={id}
                type={field.input}
                value={values[field.key]}
                required={field.required && !(field.secret && stored(field.key))}
                pattern={field.pattern}
                min={field.min}
                max={field.max}
                maxLength={500}
                placeholder={placeholder(field)}
                // Keeps the browser from filling in the login password
                autoComplete={field.input === 'password' ? 'new-password' : 'off'}
                onChange={(e) => set(field.key, e.target.value)}
              />
            )}
            {(hint || removable) && (
              <span className="hint">
                {hint}
                {removable && (
                  <button type="button" className="link" onClick={() => setRemoved([...removed, field.key])}>
                    {t('channels.secretRemove')}
                  </button>
                )}
              </span>
            )}
          </div>
        );
      })}

      <label className="field">
        {t('channels.language')}
        <select value={language} onChange={(e) => setLanguage(e.target.value === 'en' ? 'en' : 'de')}>
          {LANGUAGES.map((l) => (
            <option key={l.id} value={l.id} lang={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </label>
      <p className="muted small">{t('channels.notifyAbout')}</p>
      {NOTIFY_EVENTS.map((event) => (
        <Toggle
          key={event}
          checked={events.includes(event)}
          onChange={(on) => setEvents(on ? [...events, event] : events.filter((e) => e !== event))}
        >
          {t(`channels.event.${event}`)}
        </Toggle>
      ))}

      <div className="form-actions">
        <button className="btn primary narrow" disabled={busy !== null}>
          {busy === 'save' ? t('channels.saving') : t('channels.save')}
        </button>
        <button type="button" className="btn" disabled={busy !== null} onClick={sendTest}>
          {busy === 'test' ? t('channels.testing') : t('channels.sendTest')}
        </button>
        <button type="button" className="link" onClick={onCancel}>
          {t('channels.cancel')}
        </button>
        {message && <p className={message.tone === 'ok' ? 'form-ok' : 'form-error'}>{message.text}</p>}
      </div>
    </form>
  );
}
