import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { after, before, test } from "node:test";
import { Hono } from "hono";
import { readChannelsConfig } from "../apps/server/src/channels/config.ts";
import { channelHookRoutes, channelRoutes } from "../apps/server/src/channels/routes.ts";
import { ChannelService } from "../apps/server/src/channels/service.ts";
import { chunks, portVariantUrl, stripMarkdownForSms } from "../apps/server/src/channels/transports.ts";
import { createStore, type Store } from "../apps/server/src/db.ts";
import { AppError } from "../apps/server/src/errors.ts";

const ALICE = "11111111-1111-4111-8111-111111111111";
const BOB = "22222222-2222-4222-8222-222222222222";
const ENV = {
  TWILIO_ACCOUNT_SID: "AC_test",
  TWILIO_AUTH_TOKEN: "twilio-test-token",
  TWILIO_SMS_NUMBER: "+15550000000",
  WHATSAPP_CLOUD_ACCESS_TOKEN: "wa-token",
  WHATSAPP_CLOUD_PHONE_NUMBER_ID: "1234",
  WHATSAPP_CLOUD_APP_SECRET: "wa-app-secret",
  WHATSAPP_CLOUD_VERIFY_TOKEN: "wa-verify",
  TELEGRAM_BOT_TOKEN: "123:abc",
  TELEGRAM_WEBHOOK_SECRET: "telegram-secret-0123456789",
};

let db: Store;
before(async () => {
  db = await createStore();
});
after(async () => {
  await db.close();
});

function rig(env: Record<string, string> = ENV) {
  const sent: { url: string; body: string }[] = [];
  const asked: { owner: string; text: string }[] = [];
  const pending: Promise<unknown>[] = [];
  const config = () => readChannelsConfig(env, "https://daksha.example");
  const channels = new ChannelService({
    db,
    config,
    // A fake network: nothing reaches Twilio, Meta or Telegram.
    fetcher: (async (url: string, init: RequestInit) => {
      sent.push({ url: String(url), body: String(init.body) });
      return new Response("{}", { status: 200 });
    }) as typeof fetch,
    brain: { reply: async (owner, _channel, text) => (asked.push({ owner, text }), `**Hi** from Daksha`) },
    later: (work) => void pending.push(work),
  });
  const app = new Hono<{ Variables: { owner: string } }>();
  app.onError((error, c) => c.json({ error: error.message }, error instanceof AppError ? (error.status as 400) : 400));
  app.route("/api/channels", channelHookRoutes(channels, config));
  app.use("/api/linked-apps/*", async (c, next) => {
    c.set("owner", c.req.header("x-owner") ?? ALICE);
    await next();
  });
  app.route("/api/linked-apps", channelRoutes(channels));
  const settle = async () => {
    while (pending.length) await pending.shift();
  };
  return { channels, app, sent, asked, settle };
}

const twilioSign = (url: string, params: Record<string, string>, token = ENV.TWILIO_AUTH_TOKEN) =>
  createHmac("sha1", token).update(url + Object.keys(params).sort().map((k) => k + params[k]).join("")).digest("base64");

function sms(app: Hono<never>, params: Record<string, string>, signature = twilioSign("https://daksha.example/api/channels/sms", params)) {
  return app.request("/api/channels/sms", {
    method: "POST",
    body: new URLSearchParams(params).toString(),
    headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Twilio-Signature": signature },
  });
}

test("each app is off until all its keys are set", () => {
  assert.deepEqual(readChannelsConfig({}, "https://x.example"), {});
  const some = readChannelsConfig({ TWILIO_ACCOUNT_SID: "a", TWILIO_AUTH_TOKEN: "b" }, "https://x.example");
  assert.equal(some.sms, undefined);
  assert.equal(readChannelsConfig({ TELEGRAM_BOT_TOKEN: "1:a", TELEGRAM_WEBHOOK_SECRET: "short" }, "https://x.example").telegram, undefined);
});

test("SMS: a bad signature is refused; an unlinked number is told how to link; /link links it", async () => {
  const { app, sent, asked, settle } = rig();
  const msg = { From: "+14155550100", To: ENV.TWILIO_SMS_NUMBER, Body: "hello", MessageSid: "SM1" };
  assert.equal((await sms(app as never, msg, "bad")).status, 403);
  // The same signature with the default port added also counts (Twilio may sign either).
  assert.equal((await sms(app as never, { ...msg, MessageSid: "SM0" }, twilioSign("https://daksha.example:443/api/channels/sms", { ...msg, MessageSid: "SM0" }))).status, 200);
  await settle();
  assert.match(new URLSearchParams(sent.at(-1)!.body).get("Body")!, /isn.t linked/);
  assert.equal(asked.length, 0);
  const made = await (await app.request("/api/linked-apps/code", { method: "POST" })).json();
  const linked = { ...msg, Body: `/link ${made.code.toLowerCase()}`, MessageSid: "SM2" };
  assert.equal((await sms(app as never, linked)).status, 200);
  await settle();
  assert.match(new URLSearchParams(sent.at(-1)!.body).get("Body")!, /Linked/);
  const status = await (await app.request("/api/linked-apps")).json();
  assert.deepEqual(status.linked.map((l: { channel: string; address: string }) => [l.channel, l.address]), [["sms", "…0100"]]);
  assert.equal(status.code, undefined);
  // Now a message goes to Daksha, as Alice, and the reply comes back without markdown.
  const ask = { ...msg, Body: "what's on today?", MessageSid: "SM3" };
  await sms(app as never, ask);
  await sms(app as never, ask); // Twilio retry: answered once
  await settle();
  assert.deepEqual(asked, [{ owner: ALICE, text: "what's on today?" }]);
  assert.ok(sent.at(-1)!.url.includes("/Accounts/AC_test/Messages.json"));
  assert.match(new URLSearchParams(sent.at(-1)!.body).get("Body")!, /^Hi from Daksha$/);
  await db.removeOwner(ALICE);
});

test("WhatsApp: handshake, signature over the raw body, and only this number's messages", async () => {
  const { app, sent, settle } = rig();
  const hand = await app.request("/api/channels/whatsapp?hub.mode=subscribe&hub.verify_token=wa-verify&hub.challenge=42");
  assert.equal(await hand.text(), "42");
  assert.equal((await app.request("/api/channels/whatsapp?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=42")).status, 403);
  const payload = (phoneNumberId: string, id: string) =>
    JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{ changes: [{ field: "messages", value: { metadata: { phone_number_id: phoneNumberId }, messages: [{ from: "919800000000", id, type: "text", text: { body: "hi" } }] } }] }],
    });
  const post = (body: string, secret = ENV.WHATSAPP_CLOUD_APP_SECRET) =>
    app.request("/api/channels/whatsapp", { method: "POST", body, headers: { "X-Hub-Signature-256": `sha256=${createHmac("sha256", secret).update(body).digest("hex")}` } });
  assert.equal((await post(payload("1234", "w1"), "wrong")).status, 401);
  assert.equal((await post(payload("9999", "w2"))).status, 200);
  await settle();
  assert.equal(sent.length, 0); // another number's message is ignored
  await post(payload("1234", "w3"));
  await settle();
  assert.ok(sent.at(-1)!.url.endsWith("/1234/messages"));
  assert.match(sent.at(-1)!.body, /isn't linked/);
});

test("Telegram: the secret header is required, groups are ignored, /start CODE links", async () => {
  const { app, sent, asked, settle } = rig();
  const update = (id: number, text: string, type = "private") => JSON.stringify({ update_id: id, message: { chat: { id: 777, type }, text } });
  const post = (body: string, secret = ENV.TELEGRAM_WEBHOOK_SECRET) =>
    app.request("/api/channels/telegram", { method: "POST", body, headers: { "X-Telegram-Bot-Api-Secret-Token": secret } });
  assert.equal((await post(update(1, "hi"), "nope-nope-nope-nope")).status, 401);
  await post(update(2, "hi", "group"));
  await settle();
  assert.equal(sent.length, 0);
  const made = await (await app.request("/api/linked-apps/code", { method: "POST", headers: { "x-owner": BOB } })).json();
  await post(update(3, `/start ${made.code}`));
  await settle();
  await post(update(4, "plan my day"));
  await settle();
  assert.deepEqual(asked, [{ owner: BOB, text: "plan my day" }]);
  assert.ok(sent.every((s) => s.url.includes("/bot123:abc/sendMessage")));
  // Another account's code cannot take a linked chat.
  const other = await (await app.request("/api/linked-apps/code", { method: "POST" })).json();
  await post(update(5, `/link ${other.code}`));
  await settle();
  assert.match(sent.at(-1)!.body, /another Daksha account/);
  // Unlinking stops it.
  await app.request("/api/linked-apps/telegram", { method: "DELETE", headers: { "x-owner": BOB } });
  await post(update(6, "still there?"));
  await settle();
  assert.equal(asked.length, 1);
  await db.removeOwner(ALICE);
  await db.removeOwner(BOB);
});

test("wrong link codes are limited per sender", async () => {
  const { app, sent, settle } = rig();
  for (let i = 0; i < 8; i++) await sms(app as never, { From: "+14155550199", To: ENV.TWILIO_SMS_NUMBER, Body: "/link AAAAAAAA", MessageSid: `X${i}` });
  await settle();
  assert.equal(sent.length, 5);
});

test("an app that isn't set up answers 404", async () => {
  const { app } = rig({} as Record<string, string>);
  assert.equal((await app.request("/api/channels/telegram", { method: "POST", body: "{}" })).status, 404);
  const made = await app.request("/api/linked-apps/code", { method: "POST" });
  assert.equal(made.status, 503);
});

test("helpers: port variants, SMS markdown, chunking", () => {
  assert.equal(portVariantUrl("https://a.example/x?y=1"), "https://a.example:443/x?y=1");
  assert.equal(portVariantUrl("https://a.example:443/x"), "https://a.example/x");
  assert.equal(portVariantUrl("https://a.example:8443/x"), null);
  assert.equal(stripMarkdownForSms("# Title\n**bold** and [link](https://x)"), "Title\nbold and link");
  const parts = chunks(`${"word ".repeat(500)}`, 100);
  assert.ok(parts.every((p) => p.length <= 100));
  assert.equal(parts.join(" ").split(/\s+/).length, 500);
});
