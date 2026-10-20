import nodemailer from 'nodemailer';
import type { ChannelConfig, ChannelType, ChannelValues, NotifyEvent } from '../../shared/channels.js';
import { msg } from '../../shared/messages.js';
import { MsgError, USER_AGENT } from '../core/util.js';
import { escapeHtml, markdownToHtml, markdownToTelegram, markdownToText } from './format.js';

/** A notification, already in the channel's language */
export interface Note {
  event: NotifyEvent | 'test';
  title: string;
  /** Markdown, see format.ts */
  message: string;
  /** Gotify scale: 0–3 quiet, 4–7 normal, 8–10 urgent */
  priority: number;
  /** Address of the admin UI, '' if not set – opens when the notification is tapped */
  link: string;
  /** Text for that link */
  linkText: string;
}

interface Driver<T extends ChannelType> {
  /** Short description of the target for the list – without secrets */
  target(config: ChannelConfig<T>): string;
  send(config: ChannelConfig<T>, note: Note): Promise<void>;
}

const TIMEOUT = 15_000;
/** Sender name of the e-mails and the Discord messages */
const SENDER = 'Craft Apps';
// Colors of the admin UI: errors red, done updates green, everything else blue
const DISCORD_COLORS: Partial<Record<Note['event'], number>> = { errors: 0xff6b6b, updated: 0x3ddc97 };

function host(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}

/** The services put the reason for an error into different JSON fields */
function reason(body: string): string {
  try {
    const data = JSON.parse(body) as Record<string, unknown>;
    for (const key of ['description', 'errorDescription', 'message', 'error']) {
      const value = data[key];
      if (typeof value === 'string') return value.slice(0, 200);
    }
  } catch {
    // not JSON
  }
  return body.slice(0, 200);
}

/** POST with JSON; errors name the service and the reason it gives */
async function post(service: string, url: string, body: unknown, headers: Record<string, string> = {}): Promise<void> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': USER_AGENT, ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT),
    });
  } catch (err) {
    // fetch itself only says "fetch failed", the reason is in cause
    const cause = (err as { cause?: unknown }).cause;
    const error = cause instanceof Error ? cause.message : (err as Error).message;
    throw new MsgError(msg('error.serviceUnreachable', { service, error }));
  }
  if (!res.ok) {
    throw new MsgError(msg('error.serviceResponse', { service, status: res.status, text: reason(await res.text()) }));
  }
}

function emailHtml(note: Note): string {
  const link = note.link ? `\n<p><a href="${escapeHtml(note.link)}">${escapeHtml(note.linkText)}</a></p>` : '';
  return `<!doctype html>
<html><body style="font-family: system-ui, sans-serif; font-size: 15px; line-height: 1.5">
<h2 style="font-size: 18px">${escapeHtml(note.title)}</h2>
${markdownToHtml(note.message)}${link}
</body></html>`;
}

const DRIVERS: { [T in ChannelType]: Driver<T> } = {
  gotify: {
    target: ({ url }) => host(url),
    async send({ url, token }, note) {
      const extras: Record<string, unknown> = { 'client::display': { contentType: 'text/markdown' } };
      if (note.link) extras['client::notification'] = { click: { url: note.link } };
      const { title, message, priority } = note;
      const endpoint = new URL('message', url.endsWith('/') ? url : `${url}/`).href;
      await post('Gotify', endpoint, { title, message, priority, extras }, { 'X-Gotify-Key': token });
    },
  },

  email: {
    target: ({ to }) => to,
    async send(config, note) {
      const transport = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.security === 'tls',
        requireTLS: config.security === 'starttls',
        ignoreTLS: config.security === 'none',
        // Login only with both – if the server wants one, it says so in its answer
        auth: config.username && config.password ? { user: config.username, pass: config.password } : undefined,
        connectionTimeout: TIMEOUT,
        greetingTimeout: TIMEOUT,
        socketTimeout: 2 * TIMEOUT,
      });
      try {
        await transport.sendMail({
          from: { name: SENDER, address: config.from },
          to: config.to,
          subject: note.title,
          text: [markdownToText(note.message), ...(note.link ? [`${note.linkText}: ${note.link}`] : [])].join('\n\n'),
          html: emailHtml(note),
          priority: note.priority >= 8 ? 'high' : 'normal',
        });
      } finally {
        transport.close();
      }
    },
  },

  ntfy: {
    target: ({ url, topic }) => `${host(url)}/${topic}`,
    async send({ url, topic, token }, note) {
      const body = {
        topic,
        title: note.title,
        message: note.message,
        markdown: true,
        // ntfy counts 1–5: errors high, everything else default
        priority: note.priority >= 8 ? 4 : 3,
        ...(note.event === 'errors' ? { tags: ['warning'] } : {}),
        ...(note.link ? { click: note.link } : {}),
      };
      await post('ntfy', url, body, token ? { Authorization: `Bearer ${token}` } : {});
    },
  },

  webhook: {
    target: ({ url }) => host(url),
    async send({ url, authorization }, note) {
      const { event, title, message, priority } = note;
      const body = { event, title, message, priority, url: note.link || null };
      await post('Webhook', url, body, authorization ? { Authorization: authorization } : {});
    },
  },

  telegram: {
    target: ({ chatId }) => chatId,
    async send({ botToken, chatId }, note) {
      // At most 4096 characters per message
      const parts = [`<b>${escapeHtml(note.title)}</b>`, markdownToTelegram(note.message.slice(0, 3500))];
      // As text – Telegram turns the address into a link itself
      if (note.link) parts.push(`${escapeHtml(note.linkText)}: ${escapeHtml(note.link)}`);
      await post('Telegram', `https://api.telegram.org/bot${botToken}/sendMessage`, {
        chat_id: chatId,
        text: parts.join('\n\n'),
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
      });
    },
  },

  discord: {
    target: ({ webhookUrl }) => host(webhookUrl),
    async send({ webhookUrl }, note) {
      const description = note.link ? `${note.message}\n\n[${note.linkText}](${note.link})` : note.message;
      await post('Discord', webhookUrl, {
        username: SENDER,
        // Names in the texts don't ping anybody
        allowed_mentions: { parse: [] },
        embeds: [
          {
            title: note.title.slice(0, 256),
            description: description.slice(0, 4096),
            color: DISCORD_COLORS[note.event] ?? 0x2f7bf5,
          },
        ],
      });
    },
  },
};

// For code that handles all types alike – the settings were checked against the same fields
// (checkConfig in channels.ts)
type AnyDriver = { target(config: ChannelValues): string; send(config: ChannelValues, note: Note): Promise<void> };
const driver = (type: ChannelType) => DRIVERS[type] as unknown as AnyDriver;

export const send = (type: ChannelType, config: ChannelValues, note: Note): Promise<void> => driver(type).send(config, note);

export const describeTarget = (type: ChannelType, config: ChannelValues): string => driver(type).target(config);
