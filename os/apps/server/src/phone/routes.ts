import { Hono } from "hono";
import { z } from "zod";
import { AppError } from "../errors.ts";
import { readVoiceConfig } from "../voice/config.ts";
import { isVoiceAgent } from "../voice/secret.ts";
import type { PhoneService } from "./service.ts";

type Env = Record<string, string | undefined>;

/**
 * /api/phone for the signed-in person: their number, its check, the PIN, reminder calls,
 * and "Call me now". Mount AFTER the owner sign-in check in app.ts.
 */
export function phoneRoutes(phone: PhoneService) {
  const app = new Hono<{ Variables: { owner: string } }>();
  app.get("/", async (c) => c.json(await phone.status(c.get("owner"))));
  app.post("/number", async (c) => c.json(await phone.addNumber(c.get("owner"), await c.req.json())));
  app.put("/pin", async (c) => c.json(await phone.setPin(c.get("owner"), await c.req.json())));
  app.patch("/settings", async (c) => c.json(await phone.setSettings(c.get("owner"), await c.req.json())));
  app.delete("/", async (c) => c.json(await phone.remove(c.get("owner"))));
  app.post("/call-me", async (c) =>
    c.json(await phone.callMe(c.get("owner"), "test", "This is the test call you asked for. It works.")),
  );
  return app;
}

const digits = z.string().regex(/^\d{1,12}$/);
const token = z.string().min(20).max(2000);

/**
 * /api/voice/phone for the voice agent only (VOICE_AGENT_SECRET). Mount BEFORE the owner
 * sign-in check: a phone caller has no session. Digits are never logged.
 */
export function phoneAgentRoutes(phone: PhoneService, env: () => Env = () => process.env) {
  const app = new Hono();
  app.use("*", async (c, next) => {
    const voice = readVoiceConfig(env());
    if (!voice || !isVoiceAgent(c.req.header("authorization"), voice.agentSecret)) throw new AppError("Not allowed.", 401);
    await next();
  });
  app.post("/start", async (c) => {
    const body = z.object({ callerNumber: z.string().min(1).max(40) }).parse(await c.req.json());
    return c.json(await phone.start(body.callerNumber));
  });
  app.post("/code", async (c) => {
    const body = z.object({ callToken: token, code: digits }).parse(await c.req.json());
    return c.json(await phone.checkCode(body.callToken, body.code));
  });
  app.post("/pin", async (c) => {
    const body = z.object({ callToken: token, pin: digits }).parse(await c.req.json());
    return c.json(await phone.checkPin(body.callToken, body.pin));
  });
  app.post("/ended", async (c) => {
    const body = z.object({ userId: z.string().min(1).max(200) }).parse(await c.req.json());
    phone.ended(body.userId);
    return c.json({ ok: true });
  });
  return app;
}
