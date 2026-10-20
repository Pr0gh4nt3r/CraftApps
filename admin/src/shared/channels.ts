// Notification channels: the types with the settings each one needs, and the events a channel
// can report. The server checks and sends with these definitions, the UI builds its form from
// them – labels and hints are UI texts (channels.field.<type>.<key>, channels.hint.<type>.<key>).

/** What a channel can report – chosen per channel */
export const NOTIFY_EVENTS = ['newApps', 'updateAvailable', 'updated', 'errors'] as const;
export type NotifyEvent = (typeof NOTIFY_EVENTS)[number];

export interface ChannelField {
  key: string;
  /** Kind of form field */
  input: 'text' | 'url' | 'email' | 'password' | 'number' | 'select';
  required?: boolean;
  /** Never goes back to the UI; left empty when saving, the stored value stays */
  secret?: boolean;
  /** Regular expression for the whole value – valid in JavaScript and as an HTML pattern */
  pattern?: string;
  min?: number;
  max?: number;
  options?: readonly string[];
  default?: string | number;
  /** Example value, the same in every language */
  placeholder?: string;
}

const HTTP_URL = 'https?://\\S+';
const EMAIL = '[^\\s@,;<>]+@[^\\s@,;<>]+';
// Ends up in an HTTP header – printable ASCII only
const TOKEN = '[\\x21-\\x7E]+';

export const CHANNEL_FIELDS = {
  gotify: [
    { key: 'url', input: 'url', required: true, pattern: HTTP_URL, placeholder: 'https://gotify.example.com' },
    { key: 'token', input: 'password', required: true, secret: true, pattern: TOKEN },
  ],
  email: [
    { key: 'host', input: 'text', required: true, pattern: '[A-Za-z0-9.\\-]+', placeholder: 'smtp.example.com' },
    { key: 'port', input: 'number', required: true, min: 1, max: 65535, default: 587 },
    { key: 'security', input: 'select', required: true, options: ['starttls', 'tls', 'none'], default: 'starttls' },
    { key: 'username', input: 'text' },
    { key: 'password', input: 'password', secret: true },
    { key: 'from', input: 'email', required: true, pattern: EMAIL, placeholder: 'craftapps@example.com' },
    { key: 'to', input: 'text', required: true, pattern: `${EMAIL}(\\s*,\\s*${EMAIL})*`, placeholder: 'me@example.com' },
  ],
  ntfy: [
    { key: 'url', input: 'url', required: true, pattern: HTTP_URL, default: 'https://ntfy.sh' },
    { key: 'topic', input: 'text', required: true, pattern: '[A-Za-z0-9_\\-]{1,64}', placeholder: 'craftapps' },
    { key: 'token', input: 'password', secret: true, pattern: TOKEN },
  ],
  webhook: [
    { key: 'url', input: 'url', required: true, secret: true, pattern: HTTP_URL, placeholder: 'https://example.com/webhook' },
    { key: 'authorization', input: 'password', secret: true, pattern: '[\\x20-\\x7E]+' },
  ],
  telegram: [
    { key: 'botToken', input: 'password', required: true, secret: true, pattern: '[0-9]+:[A-Za-z0-9_\\-]+' },
    { key: 'chatId', input: 'text', required: true, pattern: '-?[0-9]+|@[A-Za-z0-9_]{5,32}', placeholder: '123456789' },
  ],
  discord: [
    {
      key: 'webhookUrl',
      input: 'url',
      required: true,
      secret: true,
      pattern: 'https://\\S+/api/webhooks/\\S+',
      placeholder: 'https://discord.com/api/webhooks/…',
    },
  ],
} as const satisfies Record<string, readonly ChannelField[]>;

export type ChannelType = keyof typeof CHANNEL_FIELDS;
export const CHANNEL_TYPES = Object.keys(CHANNEL_FIELDS) as ChannelType[];

/** The fields of a type, for code that handles all types alike */
export const channelFields = (type: ChannelType): readonly ChannelField[] => CHANNEL_FIELDS[type];

/** Settings of a channel, key → value */
export type ChannelValues = Record<string, string | number>;

type FieldOf<T extends ChannelType> = (typeof CHANNEL_FIELDS)[T][number];

/** Settings of one type, e.g. { url: string; token: string } for Gotify */
export type ChannelConfig<T extends ChannelType> = {
  [F in FieldOf<T> as F['key']]: F extends { input: 'number' } ? number : string;
};
