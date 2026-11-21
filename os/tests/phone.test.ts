import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { Hono } from "hono";
import { createStore, type Store } from "../apps/server/src/db.ts";
import { AppError } from "../apps/server/src/errors.ts";
import { normalizeNumber, readPhoneConfig } from "../apps/server/src/phone/config.ts";
import { phoneAgentRoutes, phoneRoutes } from "../apps/server/src/phone/routes.ts";
import { CALLS_PER_HOUR, type Dialer, PhoneService } from "../apps/server/src/phone/service.ts";

const SECRET = "agent-secret-that-is-at-least-32-characters-long";
const VOICE = {
  LIVEKIT_URL: "wss://x.example",
  LIVEKIT_API_KEY: "APIkey",
  LIVEKIT_API_SECRET: "livekit-api-secret-that-is-long-enough-for-hs256",
  VOICE_AGENT_SECRET: SECRET,
};
const ON = { ...VOICE, LIVEKIT_SIP_TRUNK_ID: "ST_in", LIVEKIT_SIP_OUTBOUND_TRUNK_ID: "ST_out", LIVEKIT_SIP_PHONE_NUMBER: "+1 415 555 0000" };
const ALICE = "11111111-1111-4111-8111-111111111111";
const BOB = "22222222-2222-4222-8222-222222222222";

let db: Store;
before(async () => {
  db = await createStore();
});
after(async () => {
  await db.close();
});

function rig(env: Record<string, string | undefined> = ON) {
  const dialed: { number: string; metadata: string }[] = [];
  const ended: string[] = [];
  const dialer: Dialer = { call: async (input) => void dialed.push(input) };
  const phone = new PhoneService(db, {
    config: () => readPhoneConfig(env),
    tokenKey: "test-token-key",
    dialer: () => dialer,
    ended: (owner) => void ended.push(owner),
  });
  const app = new Hono<{ Variables: { owner: string } }>();
  app.onError((error, c) =>
    c.json({ error: error.message }, error instanceof AppError ? error.status : error.name === "ZodError" ? 422 : 500),
  );
  app.route("/api/voice/phone", phoneAgentRoutes(phone, () => env));
  app.use("/api/*", async (c, next) => {
    c.set("owner", c.req.header("x-owner") ?? "");
    await next();
  });
  app.route("/api/phone", phoneRoutes(phone));
  const as = (owner: string, method: string, path: string, body?: unknown) =>
    app.request(path, {
      method,
      headers: { "content-type": "application/json", "x-owner": owner },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const agent = (path: string, body: unknown, secret = SECRET) =>
    app.request(`/api/voice/phone${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${secret}` },
      body: JSON.stringify(body),
    });
  return { phone, app, as, agent, dialed, ended };
}

/** Link ALICE's number by "calling in" and saying the code, and set her PIN. */
async function linked(r: ReturnType<typeof rig>, owner = ALICE, number = "+14155550100", pin = "2580") {
  const added = await (await r.as(owner, "POST", "/api/phone/number", { number })).json();
  const start = await (await r.agent("/start", { callerNumber: number })).json();
  assert.equal(start.ask, "code");
  const code = await (await r.agent("/code", { callToken: start.callToken, code: added.pending.code })).json();
  assert.equal(code.ok, true);
  await r.as(owner, "PUT", "/api/phone/pin", { pin });
}

test("phone: off without the SIP trunks, and the app is told so", async () => {
  assert.equal(readPhoneConfig(VOICE), undefined);
  assert.equal(readPhoneConfig({ LIVEKIT_SIP_TRUNK_ID: "x" }), undefined, "voice must be set up too");
  const r = rig(VOICE);
  const status = await (await r.as(ALICE, "GET", "/api/phone")).json();
  assert.deepEqual(status.setUp, { inbound: false, outbound: false });
  const add = await r.as(ALICE, "POST", "/api/phone/number", { number: "+14155550100" });
  assert.equal(add.status, 503);
  assert.match((await add.json()).error, /aren't set up yet/);
  assert.equal((await r.as(ALICE, "POST", "/api/phone/call-me")).status, 503);
});

test("phone: numbers need a country code and an allowed country", () => {
  assert.equal(normalizeNumber("+1 (415) 555-0100"), "+14155550100");
  assert.equal(normalizeNumber("4155550100"), null);
  assert.equal(normalizeNumber("+0123"), null);
});

test("phone: linking needs the code said from that same number, then a PIN on every call", async () => {
  const r = rig();
  const added = await (await r.as(ALICE, "POST", "/api/phone/number", { number: "+1 415 555 0101" })).json();
  assert.match(added.pending.code, /^\d{6}$/);
  assert.equal(added.callNumber, "+14155550000");
  assert.equal(added.verified, false);
  // A different number saying the right code links nothing.
  const other = await (await r.agent("/start", { callerNumber: "+14155559999" })).json();
  assert.equal(other.ask, "unknown");
  assert.deepEqual(await (await r.agent("/code", { callToken: other.callToken, code: added.pending.code })).json(), { ok: false, locked: true });
  // The right number, a wrong code, then the right code.
  const start = await (await r.agent("/start", { callerNumber: "+14155550101" })).json();
  assert.equal(start.ask, "code");
  assert.equal((await (await r.agent("/code", { callToken: start.callToken, code: "000000" === added.pending.code ? "111111" : "000000" })).json()).ok, false);
  const ok = await (await r.agent("/code", { callToken: start.callToken, code: added.pending.code })).json();
  assert.deepEqual(ok, { ok: true, locked: false, pinSet: false });
  // Linked, but no PIN yet: the call is told to set one.
  assert.equal((await (await r.agent("/start", { callerNumber: "+14155550101" })).json()).ask, "no-pin");
  // Weak PINs are refused.
  assert.equal((await r.as(ALICE, "PUT", "/api/phone/pin", { pin: "1111" })).status, 422);
  assert.equal((await r.as(ALICE, "PUT", "/api/phone/pin", { pin: "1234" })).status, 422);
  assert.equal((await r.as(ALICE, "PUT", "/api/phone/pin", { pin: "12a4" })).status, 422);
  assert.equal((await r.as(ALICE, "PUT", "/api/phone/pin", { pin: "2580" })).status, 200);
  const call = await (await r.agent("/start", { callerNumber: "+14155550101" })).json();
  assert.deepEqual(Object.keys(call).sort(), ["ask", "callToken"], "the start never says whose number it is");
  assert.equal(call.ask, "pin");
  assert.deepEqual(await (await r.agent("/pin", { callToken: call.callToken, pin: "2581" })).json(), { ok: false, locked: false });
  assert.deepEqual(await (await r.agent("/pin", { callToken: call.callToken, pin: "2580" })).json(), { ok: true, locked: false, userId: ALICE });
  // The stored row keeps a hash, never the PIN.
  const row = await db.get<Record<string, unknown>>(ALICE, "phone", "settings");
  assert.ok(!JSON.stringify(row).includes("2580"));
});

test("phone: five wrong PINs lock the number; a forged token gets nothing", async () => {
  const r = rig();
  await linked(r, BOB, "+14155550102", "8642");
  const call = await (await r.agent("/start", { callerNumber: "+14155550102" })).json();
  for (let i = 0; i < 4; i++) assert.equal((await (await r.agent("/pin", { callToken: call.callToken, pin: "1357" })).json()).locked, false);
  assert.equal((await (await r.agent("/pin", { callToken: call.callToken, pin: "1357" })).json()).locked, true);
  assert.deepEqual(await (await r.agent("/pin", { callToken: call.callToken, pin: "8642" })).json(), { ok: false, locked: true }, "even the right PIN waits");
  assert.equal((await (await r.as(BOB, "GET", "/api/phone")).json()).locked, true);
  const [data] = call.callToken.split(".");
  assert.equal((await (await r.agent("/pin", { callToken: `${data}.forged-signature-xx`, pin: "8642" })).json()).ok, false);
  // The agent routes need the agent's secret.
  assert.equal((await r.agent("/start", { callerNumber: "+14155550102" }, "wrong-secret-wrong-secret-wrong-secret")).status, 401);
});

test("phone: Daksha only calls the person's own linked number, a few times an hour", async () => {
  const r = rig();
  const owner = "33333333-3333-4333-8333-333333333333";
  assert.equal((await r.as(owner, "POST", "/api/phone/call-me")).status, 409, "no linked number yet");
  await linked(r, owner, "+14155550103", "7319");
  for (let i = 0; i < CALLS_PER_HOUR; i++) assert.equal((await r.as(owner, "POST", "/api/phone/call-me")).status, 200);
  assert.equal((await r.as(owner, "POST", "/api/phone/call-me")).status, 429);
  assert.equal(r.dialed.length, CALLS_PER_HOUR);
  assert.ok(r.dialed.every((d) => d.number === "+14155550103"));
  const job = JSON.parse(r.dialed[0]!.metadata);
  assert.equal(job.kind, "daksha-phone");
  // An outbound call still needs the PIN, and its token names this person.
  assert.deepEqual(await (await r.agent("/pin", { callToken: job.callToken, pin: "7319" })).json(), { ok: true, locked: false, userId: owner });
  // The body cannot choose another number.
  const sneaky = await r.as(owner, "POST", "/api/phone/call-me", { number: "+19005550100" });
  assert.equal(sneaky.status, 429);
  assert.ok(r.dialed.every((d) => d.number === "+14155550103"));
});

test("phone: reminder calls only when turned on; a number from another country is refused", async () => {
  const r = rig();
  const owner = "44444444-4444-4444-8444-444444444444";
  assert.equal((await r.as(owner, "PATCH", "/api/phone/settings", { reminderCalls: true })).status, 409);
  await linked(r, owner, "+14155550104", "4826");
  assert.equal(await r.phone.reminderCall(owner, "Call the bank"), false, "off by default");
  await r.as(owner, "PATCH", "/api/phone/settings", { reminderCalls: true });
  assert.equal(await r.phone.reminderCall(owner, "Call the bank"), true);
  assert.equal(JSON.parse(r.dialed.at(-1)!.metadata).opening, "Your reminder: Call the bank.");
  assert.equal((await r.as(owner, "POST", "/api/phone/number", { number: "+44 20 7946 0000" })).status, 422);
  assert.equal((await r.as(BOB, "POST", "/api/phone/number", { number: "+14155550104" })).status, 409, "already someone else's");
  // Removing forgets everything.
  const gone = await (await r.as(owner, "DELETE", "/api/phone")).json();
  assert.equal(gone.verified, false);
  assert.equal(gone.pinSet, false);
  assert.equal(await db.get(owner, "phone", "settings"), null);
});

test("phone: the end of a call is passed on so it is read like an app call", async () => {
  const r = rig();
  await r.agent("/ended", { userId: ALICE });
  assert.deepEqual(r.ended, [ALICE]);
});
