import type { FastifyInstance } from 'fastify';
import { CHANNEL_TYPES, NOTIFY_EVENTS } from '../../shared/channels.js';
import { msg } from '../../shared/messages.js';
import type { ChannelInput, ChannelTest, NewChannel } from '../../shared/types.js';
import type { Manager } from '../apps/manager.js';
import { toMsg } from '../core/util.js';
import { channelView, type ChannelStore } from '../notify/channels.js';
import type { Notifier } from '../notify/notify.js';

const BOOL = { type: 'boolean' } as const;
const LANG = { type: 'string', enum: ['de', 'en'] } as const;
const TYPE = { type: 'string', enum: CHANNEL_TYPES } as const;
const PARAMS = { type: 'object', properties: { id: { type: 'integer', minimum: 1 } } } as const;
// The values are checked by checkConfig, against the fields of the type
const CONFIG = { type: 'object', maxProperties: 20 } as const;
const CHANNEL = {
  name: { type: 'string', minLength: 1, maxLength: 64 },
  enabled: BOOL,
  language: LANG,
  events: { type: 'array', items: { type: 'string', enum: NOTIFY_EVENTS }, uniqueItems: true },
  config: CONFIG,
} as const;
const REQUIRED = ['name', 'enabled', 'language', 'events', 'config'];

/** Notification channels: list, create, change, turn on and off, delete, test. */
export function registerChannelRoutes(
  app: FastifyInstance,
  { channels, notifier, manager }: { channels: ChannelStore; notifier: Notifier; manager: Manager },
): void {
  app.get('/api/channels', async () => (await channels.list()).map(channelView));

  app.post<{ Body: NewChannel }>(
    '/api/channels',
    {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: [...REQUIRED, 'type'],
          properties: { ...CHANNEL, type: TYPE },
        },
      },
    },
    async (req) => {
      const channel = await channels.create(req.body);
      await manager.event('setting', msg('event.channelCreated', { name: channel.name }), null, req.user!.username);
      return channelView(channel);
    },
  );

  app.put<{ Params: { id: number }; Body: ChannelInput }>(
    '/api/channels/:id',
    {
      schema: { params: PARAMS, body: { type: 'object', additionalProperties: false, required: REQUIRED, properties: CHANNEL } },
    },
    async (req) => {
      const channel = await channels.update(req.params.id, req.body);
      await manager.event('setting', msg('event.channelChanged', { name: channel.name }), null, req.user!.username);
      return channelView(channel);
    },
  );

  app.patch<{ Params: { id: number }; Body: { enabled: boolean } }>(
    '/api/channels/:id',
    { schema: { params: PARAMS, body: { type: 'object', required: ['enabled'], properties: { enabled: BOOL } } } },
    async (req) => {
      const channel = await channels.setEnabled(req.params.id, req.body.enabled);
      const text = msg(channel.enabled ? 'event.channelEnabled' : 'event.channelDisabled', { name: channel.name });
      await manager.event('setting', text, null, req.user!.username);
      return channelView(channel);
    },
  );

  app.delete<{ Params: { id: number } }>('/api/channels/:id', { schema: { params: PARAMS } }, async (req) => {
    const channel = await channels.remove(req.params.id);
    await manager.event('setting', msg('event.channelDeleted', { name: channel.name }), null, req.user!.username);
    return { ok: true };
  });

  // Test message – with the values from the form, which may not be saved yet
  app.post<{ Body: ChannelTest }>(
    '/api/channels/test',
    {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['type', 'language', 'config'],
          properties: { id: { type: 'integer', minimum: 1 }, type: TYPE, language: LANG, config: CONFIG },
        },
      },
    },
    async (req, reply) => {
      try {
        await notifier.test(req.body);
      } catch (err) {
        // Invalid settings or unknown channel: answered by the error handler with their status
        if ((err as { statusCode?: unknown }).statusCode) throw err;
        return reply.code(502).send({ error: toMsg(err) });
      }
      return { ok: true };
    },
  );
}
