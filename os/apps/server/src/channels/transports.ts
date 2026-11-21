// SMS (Twilio), WhatsApp (Meta's Cloud API) and Telegram (Bot API): checking that a webhook is
// really from the service, reading the message out of it, and sending a reply.
//
// Ported to TypeScript from Hermes Agent (https://github.com/NousResearch/hermes-agent, MIT,
// at aeb5a071069dbd85d85f2c8d44337f16df29d475; see os/third_party/hermes-agent/SOURCE.md):
//   - SMS from plugins/platforms/sms/adapter.py: the X-Twilio-Signature check (HMAC-SHA1 of the
//     URL plus the sorted form fields, base64), tried with and without the default port; fail
//     closed on an empty token; the 1600-character limit; the empty TwiML reply; markdown
//     stripped for SMS; the Messages.json form send with Basic auth.
//   - WhatsApp from plugins/platforms/whatsapp_cloud/adapter.py: the hub.verify_token handshake;
//     X-Hub-Signature-256 (sha256=<hex> HMAC of the raw body with the app secret), checked
//     before the JSON is read; only "whatsapp_business_account" payloads, "messages" changes and
//     the configured phone number id; the Graph /messages text payload.
// Telegram follows suparagent's backend/app/telegram_bot.py (Apache-2.0, at
// f2ae9d0f5cc40e9acca9133be1b7abe9cb9af4fc): /start and /link <code>, then plain text is a
// request. The secret-token header check is the Bot API's own webhook feature.
// Structure kept: one verify, one read and one send per service. Python's aiohttp server is
// replaced by Hono routes (routes.ts), so only the parts that are not about serving are here.
import { createHmac, timingSafeEqual } from "node:crypto";

export type Channel = "sms" | "whatsapp" | "telegram";
export interface Inbound {
  /** The sender's address on that service: a phone number, a WhatsApp id, a Telegram chat id. */
  from: string;
  text: string;
  /** The service's id for the message, for dropping repeats. */
  messageId: string;
}

const same = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

// ---- SMS (Twilio) -------------------------------------------------------------------------------

export const MAX_SMS_LENGTH = 1600; // about 10 SMS segments
export const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';
const TWILIO_API_BASE = "https://api.twilio.com/2010-04-01/Accounts";

export interface SmsConfig {
  accountSid: string;
  authToken: string;
  from: string;
  /** The public address Twilio posts to, exactly as set in the Twilio console. */
  webhookUrl: string;
}

function twilioCheck(token: string, url: string, params: Record<string, string>, signature: string) {
  if (!token) return false; // an empty HMAC key is public: fail closed
  const data = url + Object.keys(params).sort().map((key) => key + params[key]).join("");
  return same(signature, createHmac("sha1", token).update(data, "utf8").digest("base64"));
}

/** The URL with the scheme's default port added or taken away; null for other ports. */
export function portVariantUrl(url: string): string | null {
  // By hand, because URL drops a default port on its own.
  const match = /^(https?):\/\/([^/?#:]+)(?::(\d+))?(.*)$/i.exec(url);
  if (!match) return null;
  const [, scheme, host, port, rest] = match;
  const standard = scheme!.toLowerCase() === "https" ? "443" : "80";
  if (port === undefined) return `${scheme}://${host}:${standard}${rest}`;
  return port === standard ? `${scheme}://${host}${rest}` : null;
}

/** X-Twilio-Signature: Twilio may sign the URL with or without the default port, so both are tried. */
export function verifyTwilio(config: SmsConfig, params: Record<string, string>, signature: string) {
  if (!signature) return false;
  if (twilioCheck(config.authToken, config.webhookUrl, params, signature)) return true;
  const variant = portVariantUrl(config.webhookUrl);
  return Boolean(variant && twilioCheck(config.authToken, variant, params, signature));
}

export function readTwilio(params: Record<string, string>, config: SmsConfig): Inbound | null {
  const from = (params.From ?? "").trim();
  const text = (params.Body ?? "").trim();
  const messageId = (params.MessageSid ?? "").trim();
  if (!from || !text || !messageId) return null;
  if (from === config.from) return null; // echo of our own message
  return { from, text, messageId };
}

const SMS_MARKDOWN: [RegExp, string][] = [
  [/\*\*(.+?)\*\*/gs, "$1"],
  [/\*(.+?)\*/gs, "$1"],
  [/__(.+?)__/gs, "$1"],
  [/_(.+?)_/gs, "$1"],
  [/```[a-z]*\n?/g, ""],
  [/`(.+?)`/g, "$1"],
  [/^#{1,6}\s+/gm, ""],
  [/\[([^\]]+)\]\([^)]+\)/g, "$1"],
  [/\n{3,}/g, "\n\n"],
];
/** SMS shows markdown as literal characters, so it is taken out. */
export function stripMarkdownForSms(message: string) {
  let out = message;
  for (const [pattern, repl] of SMS_MARKDOWN) out = out.replace(pattern, repl);
  return out.trim();
}

export async function sendSms(config: SmsConfig, to: string, body: string, fetcher: typeof fetch = fetch) {
  const auth = Buffer.from(`${config.accountSid}:${config.authToken}`, "ascii").toString("base64");
  for (const chunk of chunks(stripMarkdownForSms(body), MAX_SMS_LENGTH)) {
    const response = await fetcher(`${TWILIO_API_BASE}/${encodeURIComponent(config.accountSid)}/Messages.json`, {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ From: config.from, To: to, Body: chunk }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Twilio send failed (${response.status})`);
  }
}

// ---- WhatsApp (Cloud API) -----------------------------------------------------------------------

export const WHATSAPP_MAX_BODY_BYTES = 3 * 1024 * 1024;
const GRAPH_API_BASE = "https://graph.facebook.com";
const WHATSAPP_TEXT_LIMIT = 4096;

export interface WhatsAppConfig {
  accessToken: string;
  phoneNumberId: string;
  appSecret: string;
  verifyToken: string;
  apiVersion: string;
}

/** Meta's subscription handshake: the challenge comes back only for "subscribe" with the right token. */
export function whatsappHandshake(config: WhatsAppConfig, query: Record<string, string | undefined>): string | null {
  if (query["hub.mode"] !== "subscribe") return null;
  if (!config.verifyToken || !same(query["hub.verify_token"] ?? "", config.verifyToken)) return null;
  return query["hub.challenge"] || null;
}

/** sha256=<hex> HMAC of the raw body, keyed by the app secret. Checked before the JSON is read. */
export function verifyWhatsApp(config: WhatsAppConfig, rawBody: string, header: string) {
  if (!config.appSecret || !header.startsWith("sha256=")) return false;
  const expected = header.slice(7).trim().toLowerCase();
  if (!expected) return false;
  return same(expected, createHmac("sha256", config.appSecret).update(rawBody, "utf8").digest("hex"));
}

type Json = Record<string, unknown>;
const record = (value: unknown): Json => (value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {});
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/** The text messages in a signed payload, for this phone number only. Status receipts are skipped. */
export function readWhatsApp(payload: unknown, config: WhatsAppConfig): Inbound[] {
  const body = record(payload);
  if (body.object !== "whatsapp_business_account") return [];
  const out: Inbound[] = [];
  for (const entry of list(body.entry))
    for (const change of list(record(entry).changes)) {
      const c = record(change);
      if (c.field !== "messages") continue;
      const value = record(c.value);
      if (String(record(value.metadata).phone_number_id ?? "") !== config.phoneNumberId) continue;
      for (const raw of list(value.messages)) {
        const m = record(raw);
        const text = m.type === "text" ? String(record(m.text).body ?? "").trim() : m.type === "button" ? String(record(m.button).text ?? "").trim() : "";
        const from = String(m.from ?? "").trim();
        const messageId = String(m.id ?? "").trim();
        if (from && text && messageId) out.push({ from, text, messageId });
      }
    }
  return out;
}

export async function sendWhatsApp(config: WhatsAppConfig, to: string, body: string, fetcher: typeof fetch = fetch) {
  for (const chunk of chunks(body, WHATSAPP_TEXT_LIMIT)) {
    const response = await fetcher(`${GRAPH_API_BASE}/${config.apiVersion}/${encodeURIComponent(config.phoneNumberId)}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to, type: "text", text: { body: chunk, preview_url: false } }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`WhatsApp send failed (${response.status})`);
  }
}

// ---- Telegram (Bot API) -------------------------------------------------------------------------

const TELEGRAM_TEXT_LIMIT = 4096;

export interface TelegramConfig {
  botToken: string;
  /** Sent back by Telegram in X-Telegram-Bot-Api-Secret-Token; set with setWebhook's secret_token. */
  webhookSecret: string;
}

export function verifyTelegram(config: TelegramConfig, header: string) {
  return Boolean(config.webhookSecret) && same(header, config.webhookSecret);
}

/** A private chat's text message. Groups and channels are ignored: a link belongs to one person. */
export function readTelegram(update: unknown): Inbound | null {
  const u = record(update);
  const message = record(u.message);
  const chat = record(message.chat);
  if (chat.type !== "private") return null;
  const text = typeof message.text === "string" ? message.text.trim() : "";
  const from = chat.id === undefined ? "" : String(chat.id);
  const messageId = u.update_id === undefined ? "" : String(u.update_id);
  if (!from || !text || !messageId) return null;
  return { from, text, messageId };
}

export async function sendTelegram(config: TelegramConfig, chatId: string, body: string, fetcher: typeof fetch = fetch) {
  for (const chunk of chunks(body, TELEGRAM_TEXT_LIMIT)) {
    const response = await fetcher(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Plain text: no parse_mode, so nothing in a reply can break Telegram's markup.
      body: JSON.stringify({ chat_id: chatId, text: chunk, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Telegram send failed (${response.status})`);
  }
}

// ---- shared -------------------------------------------------------------------------------------

/** Split at paragraph, line or word breaks so each piece fits. A long word is cut. */
export function chunks(text: string, max: number): string[] {
  const out: string[] = [];
  let rest = text.trim();
  while (rest.length > max) {
    const window = rest.slice(0, max);
    let cut = Math.max(window.lastIndexOf("\n\n"), window.lastIndexOf("\n"));
    if (cut < max / 2) cut = window.lastIndexOf(" ");
    if (cut < max / 2) cut = max;
    out.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  if (rest) out.push(rest);
  return out;
}
