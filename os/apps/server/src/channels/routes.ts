import { Hono } from "hono";
import { z } from "zod";
import { AppError } from "../errors.ts";
import type { ChannelsConfig } from "./config.ts";
import type { ChannelService } from "./service.ts";
import {
  EMPTY_TWIML,
  readTelegram,
  readTwilio,
  readWhatsApp,
  verifyTelegram,
  verifyTwilio,
  verifyWhatsApp,
  WHATSAPP_MAX_BODY_BYTES,
  whatsappHandshake,
} from "./transports.ts";

const TWILIO_MAX_BODY = 64 * 1024;
const TELEGRAM_MAX_BODY = 1024 * 1024;

async function limited(request: Request, max: number) {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > max) throw new AppError("Too large.", 413);
  const text = await request.text();
  if (Buffer.byteLength(text) > max) throw new AppError("Too large.", 413);
  return text;
}

/**
 * The services' webhooks. Mount BEFORE the owner sign-in check: each request proves where it
 * came from with that service's signature, checked on the raw body before anything is read.
 * A service that isn't set up answers 404.
 */
export function channelHookRoutes(channels: ChannelService, config: () => ChannelsConfig) {
  const app = new Hono();
  app.post("/sms", async (c) => {
    const sms = config().sms;
    if (!sms) return c.notFound();
    const raw = await limited(c.req.raw, TWILIO_MAX_BODY);
    const params: Record<string, string> = {};
    for (const [key, value] of new URLSearchParams(raw)) if (!(key in params)) params[key] = value;
    if (!verifyTwilio(sms, params, c.req.header("x-twilio-signature") ?? "")) return c.body(EMPTY_TWIML, 403, { "Content-Type": "application/xml" });
    const message = readTwilio(params, sms);
    if (message) channels.receive("sms", message);
    // Replies go out through the REST API, never inline TwiML.
    return c.body(EMPTY_TWIML, 200, { "Content-Type": "application/xml" });
  });
  app.get("/whatsapp", (c) => {
    const wa = config().whatsapp;
    if (!wa) return c.notFound();
    const challenge = whatsappHandshake(wa, c.req.query());
    return challenge ? c.text(challenge) : c.text("Forbidden", 403);
  });
  app.post("/whatsapp", async (c) => {
    const wa = config().whatsapp;
    if (!wa) return c.notFound();
    const raw = await limited(c.req.raw, WHATSAPP_MAX_BODY_BYTES);
    if (!verifyWhatsApp(wa, raw, c.req.header("x-hub-signature-256") ?? "")) return c.text("Unauthorized", 401);
    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      return c.text("Bad request", 400);
    }
    for (const message of readWhatsApp(payload, wa)) channels.receive("whatsapp", message);
    // Always 200 once signed: Meta retries anything else for days.
    return c.text("ok");
  });
  app.post("/telegram", async (c) => {
    const tg = config().telegram;
    if (!tg) return c.notFound();
    if (!verifyTelegram(tg, c.req.header("x-telegram-bot-api-secret-token") ?? "")) return c.text("Unauthorized", 401);
    let update: unknown;
    try {
      update = JSON.parse(await limited(c.req.raw, TELEGRAM_MAX_BODY));
    } catch (error) {
      if (error instanceof AppError) throw error;
      return c.text("Bad request", 400);
    }
    const message = readTelegram(update);
    if (message) channels.receive("telegram", message);
    return c.text("ok");
  });
  return app;
}

/** /api/channels for the signed-in person. Mount AFTER the owner sign-in check. */
export function channelRoutes(channels: ChannelService) {
  const app = new Hono<{ Variables: { owner: string } }>();
  app.get("/", async (c) => c.json(await channels.status(c.get("owner"))));
  app.post("/code", async (c) => c.json(await channels.makeCode(c.get("owner"))));
  app.delete("/:channel", async (c) => {
    const channel = z.enum(["sms", "whatsapp", "telegram"]).parse(c.req.param("channel"));
    return c.json(await channels.unlink(c.get("owner"), channel));
  });
  return app;
}
