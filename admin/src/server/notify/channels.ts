import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { NOTIFY_EVENTS, channelFields, type ChannelType, type ChannelValues, type NotifyEvent } from '../../shared/channels.js';
import { msg, parseMsg, type Lang, type Msg } from '../../shared/messages.js';
import type { ChannelInput, ChannelView, NewChannel } from '../../shared/types.js';
import { BadRequestError, ConflictError, NotFoundError } from '../core/util.js';
import { describeTarget } from './drivers.js';

export interface Channel {
  id: number;
  name: string;
  type: ChannelType;
  enabled: boolean;
  language: Lang;
  events: NotifyEvent[];
  /** Settings including the secrets */
  config: ChannelValues;
  lastSentAt: Date | null;
  lastError: Msg | null;
}

interface ChannelRow extends RowDataPacket {
  id: number;
  name: string;
  type: ChannelType;
  enabled: number;
  language: Lang;
  events: string;
  config: string;
  last_sent_at: Date | null;
  last_error: string | null;
}

const MAX_VALUE = 500;

const invalid = () => new BadRequestError(msg('error.channelInvalid'));

const toChannel = (row: ChannelRow): Channel => ({
  id: row.id,
  name: row.name,
  type: row.type,
  enabled: Boolean(row.enabled),
  language: row.language,
  events: JSON.parse(row.events) as NotifyEvent[],
  config: JSON.parse(row.config) as ChannelValues,
  lastSentAt: row.last_sent_at,
  lastError: parseMsg(row.last_error),
});

/**
 * Checks the settings against the fields of the type. An empty secret keeps the stored value,
 * null removes it; unknown keys are dropped.
 */
export function checkConfig(type: ChannelType, input: ChannelInput['config'], stored: ChannelValues = {}): ChannelValues {
  const config: ChannelValues = {};
  for (const field of channelFields(type)) {
    const raw: unknown = input[field.key];
    if (raw !== null && raw !== undefined && typeof raw !== 'string' && typeof raw !== 'number') throw invalid();
    let value = raw === null || raw === undefined ? '' : String(raw).trim();
    if (value === '' && field.secret && raw !== null) value = String(stored[field.key] ?? '');
    if (value === '' && field.default !== undefined) value = String(field.default);
    if (value === '') {
      if (field.required) throw invalid();
      config[field.key] = '';
      continue;
    }
    if (value.length > MAX_VALUE) throw invalid();
    if (field.input === 'number') {
      const number = Number(value);
      if (!Number.isInteger(number) || number < (field.min ?? -Infinity) || number > (field.max ?? Infinity)) throw invalid();
      config[field.key] = number;
      continue;
    }
    const valid =
      (!field.pattern || new RegExp(`^(?:${field.pattern})$`).test(value)) &&
      (!field.options || field.options.includes(value)) &&
      (field.input !== 'url' || URL.canParse(value));
    if (!valid) throw invalid();
    config[field.key] = value;
  }
  return config;
}

function checkName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 64) throw invalid();
  return trimmed;
}

/** Without duplicates, in the order of NOTIFY_EVENTS */
const checkEvents = (events: NotifyEvent[]): NotifyEvent[] => NOTIFY_EVENTS.filter((event) => events.includes(event));

/** Names are unique so that the activity log stays clear */
async function uniqueName<T>(query: Promise<T>): Promise<T> {
  try {
    return await query;
  } catch (err) {
    if ((err as { code?: string }).code === 'ER_DUP_ENTRY') throw new ConflictError(msg('error.channelNameTaken'));
    throw err;
  }
}

/** For the UI: the secrets stay on the server, the UI only learns whether they are set */
export function channelView(channel: Channel): ChannelView {
  const fields = channelFields(channel.type);
  return {
    id: channel.id,
    name: channel.name,
    type: channel.type,
    enabled: channel.enabled,
    language: channel.language,
    events: channel.events,
    config: Object.fromEntries(fields.filter((f) => !f.secret).map((f) => [f.key, channel.config[f.key] ?? ''])),
    secretsSet: fields.filter((f) => f.secret && (channel.config[f.key] ?? '') !== '').map((f) => f.key),
    target: describeTarget(channel.type, channel.config),
    lastSentAt: channel.lastSentAt?.toISOString() ?? null,
    lastError: channel.lastError,
  };
}

/** Notification channels in MySQL, their settings as JSON */
export class ChannelStore {
  constructor(private readonly db: Pool) {}

  async list(): Promise<Channel[]> {
    const [rows] = await this.db.query<ChannelRow[]>('SELECT * FROM notification_channels ORDER BY name, id');
    return rows.map(toChannel);
  }

  async get(id: number): Promise<Channel> {
    const [rows] = await this.db.query<ChannelRow[]>('SELECT * FROM notification_channels WHERE id = ?', [id]);
    if (!rows[0]) throw new NotFoundError(msg('error.notFound'));
    return toChannel(rows[0]);
  }

  async create(input: NewChannel): Promise<Channel> {
    const [result] = await uniqueName(
      this.db.query<ResultSetHeader>(
        'INSERT INTO notification_channels (name, type, enabled, language, events, config) VALUES (?, ?, ?, ?, ?, ?)',
        [
          checkName(input.name),
          input.type,
          Number(input.enabled),
          input.language,
          JSON.stringify(checkEvents(input.events)),
          JSON.stringify(checkConfig(input.type, input.config)),
        ],
      ),
    );
    return this.get(result.insertId);
  }

  /** Changes everything but the type; the error of the old settings goes away */
  async update(id: number, input: ChannelInput): Promise<Channel> {
    const current = await this.get(id);
    await uniqueName(
      this.db.query(
        `UPDATE notification_channels SET name = ?, enabled = ?, language = ?, events = ?, config = ?, last_error = NULL
         WHERE id = ?`,
        [
          checkName(input.name),
          Number(input.enabled),
          input.language,
          JSON.stringify(checkEvents(input.events)),
          JSON.stringify(checkConfig(current.type, input.config, current.config)),
          id,
        ],
      ),
    );
    return this.get(id);
  }

  async setEnabled(id: number, enabled: boolean): Promise<Channel> {
    await this.db.query('UPDATE notification_channels SET enabled = ? WHERE id = ?', [Number(enabled), id]);
    return this.get(id);
  }

  async remove(id: number): Promise<Channel> {
    const channel = await this.get(id);
    await this.db.query('DELETE FROM notification_channels WHERE id = ?', [id]);
    return channel;
  }

  /** How the last notification went: sent, or why not */
  async record(id: number, error: Msg | null): Promise<void> {
    if (error) {
      await this.db.query('UPDATE notification_channels SET last_error = ? WHERE id = ?', [JSON.stringify(error), id]);
    } else {
      await this.db.query(
        'UPDATE notification_channels SET last_sent_at = CURRENT_TIMESTAMP(3), last_error = NULL WHERE id = ?',
        [id],
      );
    }
  }
}
