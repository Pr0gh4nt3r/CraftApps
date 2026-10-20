import type { NotifyEvent } from '../../shared/channels.js';
import { msg, renderMsg, type Lang, type Msg } from '../../shared/messages.js';
import type { ChannelTest } from '../../shared/types.js';
import { toMsg } from '../core/util.js';
import type { SettingsStore } from '../settings/settings.js';
import { checkConfig, type ChannelStore } from './channels.js';
import { send, type Note } from './drivers.js';

/** A channel a notification didn't get through */
export interface Failure {
  channel: string;
  error: Msg;
}

/** Sends notifications to the channels that report the event, each in its language. */
export class Notifier {
  constructor(
    private readonly channels: ChannelStore,
    private readonly settings: SettingsStore,
  ) {}

  /** At least one channel is turned on and reports something */
  async configured(): Promise<boolean> {
    return (await this.channels.list()).some((c) => c.enabled && c.events.length > 0);
  }

  async notify(event: NotifyEvent, title: Msg, message: Msg, priority: number): Promise<Failure[]> {
    const channels = (await this.channels.list()).filter((c) => c.enabled && c.events.includes(event));
    const { adminBaseUrl } = await this.settings.get();
    const failures: Failure[] = [];
    // All at once – a channel that doesn't answer doesn't hold up the others
    await Promise.all(
      channels.map(async (channel) => {
        let error: Msg | null = null;
        try {
          await send(channel.type, channel.config, note(channel.language, event, title, message, priority, adminBaseUrl));
        } catch (err) {
          error = toMsg(err);
          failures.push({ channel: channel.name, error });
        }
        await this.channels.record(channel.id, error);
      }),
    );
    return failures;
  }

  /** Test message, also with settings not saved yet; throws if it doesn't get through. */
  async test({ id, type, language, config }: ChannelTest): Promise<void> {
    const stored = id === undefined ? undefined : await this.channels.get(id);
    const values = checkConfig(type, config, stored?.type === type ? stored.config : {});
    const { adminBaseUrl } = await this.settings.get();
    await send(type, values, note(language, 'test', msg('notify.test.title'), msg('notify.test.body'), 5, adminBaseUrl));
  }
}

function note(lang: Lang, event: Note['event'], title: Msg, message: Msg, priority: number, link: string): Note {
  return {
    event,
    title: renderMsg(lang, title),
    message: renderMsg(lang, message),
    priority,
    link,
    linkText: renderMsg(lang, msg('notify.open')),
  };
}
