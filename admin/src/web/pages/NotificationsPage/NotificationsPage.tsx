import { useCallback, useEffect, useState } from 'react';
import { NOTIFY_EVENTS } from '../../../shared/channels';
import type { ChannelView } from '../../../shared/types';
import { api } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { t, tm } from '../../i18n/i18n';
import { ChannelForm } from '../../components/ChannelForm/ChannelForm';
import { Toggle } from '../../components/Toggle/Toggle';

const LANGUAGE_NAMES = { de: 'Deutsch', en: 'English' } as const;

type Message = { tone: 'ok' | 'error'; text: string } | null;

function eventList(channel: ChannelView): string {
  if (channel.events.length === NOTIFY_EVENTS.length) return t('channels.allEvents');
  if (channel.events.length === 0) return t('channels.noEvents');
  return channel.events.map((event) => t(`channels.eventShort.${event}`)).join(', ');
}

export function NotificationsPage() {
  const [channels, setChannels] = useState<ChannelView[] | null>(null);
  // Channel in the form: null = closed, 'new' = a new one
  const [editing, setEditing] = useState<ChannelView | 'new' | null>(null);
  const [testing, setTesting] = useState<number | null>(null);
  const [message, setMessage] = useState<Message>(null);

  const load = useCallback(
    () =>
      api<ChannelView[]>('GET', '/api/channels').then(setChannels, (err: Error) =>
        setMessage({ tone: 'error', text: err.message }),
      ),
    [],
  );
  useEffect(() => void load(), [load]);

  async function run(action: () => Promise<unknown>, ok: string | null) {
    setMessage(null);
    try {
      await action();
      if (ok) setMessage({ tone: 'ok', text: ok });
    } catch (err) {
      setMessage({ tone: 'error', text: (err as Error).message });
    }
  }

  async function toggle(channel: ChannelView, enabled: boolean) {
    await run(() => api('PATCH', `/api/channels/${channel.id}`, { enabled }), null);
    await load();
  }

  // The server fills in the stored secrets
  async function test(channel: ChannelView) {
    setTesting(channel.id);
    const { id, type, language, config } = channel;
    await run(
      () => api('POST', '/api/channels/test', { id, type, language, config }),
      t('channels.testSent', { name: channel.name }),
    );
    setTesting(null);
  }

  async function remove(channel: ChannelView) {
    if (!window.confirm(t('channels.confirmDelete', { name: channel.name }))) return;
    await run(() => api('DELETE', `/api/channels/${channel.id}`), t('channels.deleted', { name: channel.name }));
    if (editing !== 'new' && editing?.id === channel.id) setEditing(null);
    await load();
  }

  function saved(channel: ChannelView) {
    setEditing(null);
    setMessage({ tone: 'ok', text: t('channels.saved', { name: channel.name }) });
    void load();
  }

  return (
    <>
      <section className="toolbar">
        <div>
          <h1>{t('channels.title')}</h1>
          <p className="muted">{t('channels.subtitle')}</p>
        </div>
      </section>

      <section className="panel">
        <h2>{t('channels.list')}</h2>
        {channels?.length === 0 && <p className="muted">{t('channels.empty')}</p>}
        {channels && channels.length > 0 && (
          <ul className="channels">
            {channels.map((c) => (
              <li key={c.id} className={c.enabled ? 'channel' : 'channel off'}>
                <div className="channel-head">
                  <Toggle checked={c.enabled} onChange={(on) => toggle(c, on)} label={t('channels.active')} />
                  <strong>{c.name}</strong>
                  <span className="channel-type">{t(`channels.type.${c.type}`)}</span>
                  <span className="channel-actions">
                    <button className="link" disabled={testing !== null} onClick={() => test(c)}>
                      {testing === c.id ? t('channels.testing') : t('channels.test')}
                    </button>
                    <button className="link" onClick={() => setEditing(c)}>
                      {t('channels.edit')}
                    </button>
                    <button className="link danger" onClick={() => remove(c)}>
                      {t('channels.delete')}
                    </button>
                  </span>
                </div>
                <p className="channel-meta">
                  <span>{c.target}</span>
                  <span>{LANGUAGE_NAMES[c.language]}</span>
                  <span>{t('channels.eventsLabel', { events: eventList(c) })}</span>
                  {!c.lastError && (
                    <span>
                      {c.lastSentAt ? t('channels.lastSent', { time: formatDateTime(c.lastSentAt) }) : t('channels.neverSent')}
                    </span>
                  )}
                </p>
                {c.lastError && <p className="channel-error">{t('channels.lastFailed', { error: tm(c.lastError) })}</p>}
              </li>
            ))}
          </ul>
        )}
        <div className="form-actions">
          <button className="btn" disabled={editing !== null} onClick={() => setEditing('new')}>
            {t('channels.add')}
          </button>
          {message && <p className={message.tone === 'ok' ? 'form-ok' : 'form-error'}>{message.text}</p>}
        </div>
      </section>

      {editing && (
        <ChannelForm
          key={editing === 'new' ? 'new' : editing.id}
          channel={editing === 'new' ? null : editing}
          onSaved={saved}
          onCancel={() => setEditing(null)}
        />
      )}
    </>
  );
}
