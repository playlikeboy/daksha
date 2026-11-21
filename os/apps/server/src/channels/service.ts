// Messaging apps: text Daksha by SMS, WhatsApp or Telegram, and get the reply there.
//
// A sender is nobody until they link. The person makes a code in Settings, under Linked apps,
// and sends "/link CODE" from the app; that ties that phone number or chat to their account.
// Only then do messages go to Daksha, into their main chat, the same thread as the app. Anything
// risky a reply prepares still waits for a tap in the Daksha app (decision 28).
//
// Records: "channel-links" (one per linked app, id = the channel) and "channel-link-code".
// Message text is never logged.
import { createHash, randomInt } from "node:crypto";
import type { Store } from "../db.ts";
import { AppError } from "../errors.ts";
import { backgroundFailure } from "../log.ts";
import type { ChannelsConfig } from "./config.ts";
import { type Channel, type Inbound, sendSms, sendTelegram, sendWhatsApp } from "./transports.ts";

const LINKS = "channel-links";
const CODES = "channel-link-code";
const SEEN = "channel-seen";
const CODE_MINUTES = 15;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
/** Wrong /link codes one sender may try in an hour before being ignored. */
const LINK_TRIES = 5;
/** Messages one linked person may send in an hour across apps (each runs the model). */
const MESSAGES_PER_HOUR = 60;
const MESSAGE_MAX = 4000;

export interface ChannelLink {
  id: Channel;
  address: string;
  linkedAt: string;
}

/** Runs one message through Daksha on the person's main chat and returns the reply text. */
export interface ChannelBrain {
  reply(owner: string, channel: Channel, text: string): Promise<string>;
}

export interface ChannelDeps {
  db: Store;
  config: () => ChannelsConfig;
  brain: ChannelBrain;
  fetcher?: typeof fetch;
  now?: () => Date;
  /** Where replies run after the webhook has answered. Tests await it. */
  later?: (work: Promise<unknown>) => void;
}

const LABEL: Record<Channel, string> = { sms: "SMS", whatsapp: "WhatsApp", telegram: "Telegram" };
const hash = (text: string) => createHash("sha256").update(text).digest("hex").slice(0, 32);

export const NOT_LINKED = (channel: Channel) =>
  `This ${LABEL[channel]} isn't linked to a Daksha account. In the Daksha app, open Settings, then Linked apps, get a code and send it here as: /link CODE`;
const HELP = "Send /link CODE with the code from Daksha's Settings, under Linked apps. After that, just write to me here.";

export class ChannelService {
  private readonly tries = new Map<string, number[]>();
  private readonly sent = new Map<string, number[]>();

  constructor(private readonly deps: ChannelDeps) {}

  private now() {
    return this.deps.now?.() ?? new Date();
  }

  /** What Settings shows: which apps this server has, and which the person linked. */
  async status(owner: string) {
    const config = this.deps.config();
    const links = await this.deps.db.list<ChannelLink>(owner, LINKS);
    const code = await this.deps.db.get<{ code: string; expiresAt: string }>(owner, CODES, "code");
    const live = code && Date.parse(code.expiresAt) > this.now().getTime() ? code : undefined;
    return {
      available: {
        sms: config.sms ? { number: config.sms.from } : null,
        whatsapp: config.whatsapp ? {} : null,
        telegram: config.telegram ? { username: config.telegram.username } : null,
      },
      linked: links.map((l) => ({ channel: l.id, address: mask(l.address), linkedAt: l.linkedAt })),
      ...(live ? { code: live.code, expiresAt: live.expiresAt } : {}),
    };
  }

  /** A fresh code to send from the app, good for 15 minutes. It replaces any earlier one. */
  async makeCode(owner: string) {
    const config = this.deps.config();
    if (!config.sms && !config.whatsapp && !config.telegram) throw new AppError("Messaging apps aren't set up yet.", 503);
    const code = Array.from({ length: 8 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
    const expiresAt = new Date(this.now().getTime() + CODE_MINUTES * 60_000).toISOString();
    await this.deps.db.put(owner, CODES, { id: "code", code, expiresAt });
    return this.status(owner);
  }

  async unlink(owner: string, channel: Channel) {
    await this.deps.db.remove(owner, LINKS, channel);
    return this.status(owner);
  }

  /** One signed message from a service. Answers at once; the reply is sent when it is ready. */
  receive(channel: Channel, message: Inbound) {
    const work = this.handle(channel, message).catch((error) => backgroundFailure(`${channel} message`, error));
    if (this.deps.later) this.deps.later(work);
    else void work;
  }

  private async send(channel: Channel, to: string, text: string) {
    const config = this.deps.config();
    const fetcher = this.deps.fetcher ?? fetch;
    if (channel === "sms" && config.sms) return sendSms(config.sms, to, text, fetcher);
    if (channel === "whatsapp" && config.whatsapp) return sendWhatsApp(config.whatsapp, to, text, fetcher);
    if (channel === "telegram" && config.telegram) return sendTelegram(config.telegram, to, text, fetcher);
  }

  private limited(map: Map<string, number[]>, key: string, max: number) {
    const now = this.now().getTime();
    const recent = (map.get(key) ?? []).filter((at) => now - at < 3_600_000);
    if (recent.length >= max) {
      map.set(key, recent);
      return true;
    }
    map.set(key, [...recent, now]);
    if (map.size > 10_000) map.delete(map.keys().next().value!);
    return false;
  }

  private async ownerOf(channel: Channel, address: string) {
    for (const { owner, value } of await this.deps.db.scan<ChannelLink>(LINKS)) if (value.id === channel && value.address === address) return owner;
    return null;
  }

  private async handle(channel: Channel, message: Inbound) {
    const text = message.text.slice(0, MESSAGE_MAX);
    const command = /^\/(start|help|link)(?:@\w+)?(?:\s+(\S+))?/i.exec(text);
    // Telegram's t.me/<bot>?start=CODE link arrives as "/start CODE".
    if (command?.[1]?.toLowerCase() === "link" || (command?.[1]?.toLowerCase() === "start" && command[2])) return this.claim(channel, message.from, (command[2] ?? "").toUpperCase());
    const owner = await this.ownerOf(channel, message.from);
    if (!owner) return this.send(channel, message.from, command ? HELP : NOT_LINKED(channel));
    if (command) return this.send(channel, message.from, HELP);
    // A service may send the same message twice; only the first runs.
    if (!(await this.deps.db.insertIfAbsent(owner, SEEN, { id: hash(`${channel}\n${message.messageId}`), at: this.now().toISOString() }))) return;
    if (this.limited(this.sent, owner, MESSAGES_PER_HOUR))
      return this.send(channel, message.from, "That's a lot of messages this hour. Try again a little later, or use the Daksha app.");
    const reply = await this.deps.brain.reply(owner, channel, text).catch((error) => {
      backgroundFailure(`${channel} reply`, error);
      return "Sorry, I couldn't answer just now. Please try again in a moment.";
    });
    await this.send(channel, message.from, reply || "Done.");
  }

  private async claim(channel: Channel, address: string, code: string) {
    if (this.limited(this.tries, `${channel}:${address}`, LINK_TRIES)) return;
    const now = this.now().getTime();
    let owner: string | null = null;
    if (/^[A-Z0-9]{8}$/.test(code))
      for (const row of await this.deps.db.scan<{ code: string; expiresAt: string }>(CODES))
        if (row.value.code === code && Date.parse(row.value.expiresAt) > now) owner = row.owner;
    if (!owner) return this.send(channel, address, "That code isn't right or has run out. Get a new one in Daksha's Settings, under Linked apps.");
    const taken = await this.ownerOf(channel, address);
    if (taken && taken !== owner)
      return this.send(channel, address, `This ${LABEL[channel]} is linked to another Daksha account. Unlink it there first.`);
    await this.deps.db.remove(owner, CODES, "code");
    await this.deps.db.put<ChannelLink>(owner, LINKS, { id: channel, address, linkedAt: this.now().toISOString() });
    this.tries.delete(`${channel}:${address}`);
    return this.send(channel, address, `Linked. You can write to Daksha here now. Anything that sends, pays or changes something still waits for your tap in the app.`);
  }

  private lastSweep = 0;
  /** From the upkeep loop, at most once a day: forget message ids older than a week. */
  async sweep() {
    if (this.now().getTime() - this.lastSweep < 86_400_000) return;
    this.lastSweep = this.now().getTime();
    const cutoff = this.now().getTime() - 7 * 86_400_000;
    for (const { owner, value } of await this.deps.db.scan<{ id: string; at: string }>(SEEN))
      if (Date.parse(value.at) < cutoff) await this.deps.db.remove(owner, SEEN, value.id);
  }
}

/** "+1 415 555 0100" shown as "…0100". */
export const mask = (address: string) => `…${address.slice(-4)}`;
