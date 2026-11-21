// Which messaging apps this server can use. Each is off unless all of its keys are set.
//
//   SMS        TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_SMS_NUMBER
//   WhatsApp   WHATSAPP_CLOUD_ACCESS_TOKEN, WHATSAPP_CLOUD_PHONE_NUMBER_ID,
//              WHATSAPP_CLOUD_APP_SECRET, WHATSAPP_CLOUD_VERIFY_TOKEN (WHATSAPP_CLOUD_API_VERSION optional)
//   Telegram   TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET (at least 16 characters), TELEGRAM_BOT_USERNAME optional
import type { SmsConfig, TelegramConfig, WhatsAppConfig } from "./transports.ts";

type Env = Record<string, string | undefined>;
const read = (env: Env, name: string) => env[name]?.trim() || undefined;

export interface ChannelsConfig {
  sms?: SmsConfig;
  whatsapp?: WhatsAppConfig;
  telegram?: TelegramConfig & { username?: string };
}

export function readChannelsConfig(env: Env, publicUrl: string): ChannelsConfig {
  const out: ChannelsConfig = {};
  const sid = read(env, "TWILIO_ACCOUNT_SID");
  const token = read(env, "TWILIO_AUTH_TOKEN");
  const from = read(env, "TWILIO_SMS_NUMBER");
  if (sid && token && from)
    out.sms = { accountSid: sid, authToken: token, from, webhookUrl: read(env, "TWILIO_SMS_WEBHOOK_URL") ?? new URL("/api/channels/sms", publicUrl).toString() };
  const wa = {
    accessToken: read(env, "WHATSAPP_CLOUD_ACCESS_TOKEN"),
    phoneNumberId: read(env, "WHATSAPP_CLOUD_PHONE_NUMBER_ID"),
    appSecret: read(env, "WHATSAPP_CLOUD_APP_SECRET"),
    verifyToken: read(env, "WHATSAPP_CLOUD_VERIFY_TOKEN"),
  };
  if (wa.accessToken && wa.phoneNumberId && wa.appSecret && wa.verifyToken)
    out.whatsapp = {
      accessToken: wa.accessToken,
      phoneNumberId: wa.phoneNumberId,
      appSecret: wa.appSecret,
      verifyToken: wa.verifyToken,
      apiVersion: read(env, "WHATSAPP_CLOUD_API_VERSION") ?? "v21.0",
    };
  const bot = read(env, "TELEGRAM_BOT_TOKEN");
  const secret = read(env, "TELEGRAM_WEBHOOK_SECRET");
  if (bot && secret && /^[A-Za-z0-9_-]{16,256}$/.test(secret)) {
    const username = read(env, "TELEGRAM_BOT_USERNAME");
    out.telegram = { botToken: bot, webhookSecret: secret, ...(username ? { username } : {}) };
  }
  return out;
}
