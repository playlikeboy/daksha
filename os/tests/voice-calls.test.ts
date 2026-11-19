import assert from "node:assert/strict";
import { test } from "node:test";
import { callSourceId } from "@debo/db";
import { Hono } from "hono";
import { devMemoryBackend } from "../apps/server/src/debo/dev-backend.ts";
import { CALL_IDLE_MS, DeboService, deboRoutes } from "../apps/server/src/debo/index.ts";
import type { VoiceBrain, VoiceBrainEvent } from "../apps/server/src/voice/brain.ts";
import { voiceAgentRoutes, voiceTokenRoutes } from "../apps/server/src/voice/routes.ts";
import { ALICE, BOB } from "./helpers/debo.ts";

const SECRET = "agent-secret-that-is-at-least-32-characters-long";
const ENV = {
  LIVEKIT_URL: "wss://x.example",
  LIVEKIT_API_KEY: "APIkey",
  LIVEKIT_API_SECRET: "livekit-api-secret-that-is-long-enough-for-hs256",
  VOICE_AGENT_SECRET: SECRET,
};

function rig() {
  const backend = devMemoryBackend();
  const debo = new DeboService(backend);
  debo.callEndGraceMs = 0;
  const deleted: string[] = [];
  debo.onCallDeleted = async (_owner, id) => {
    deleted.push(id);
  };
  const brain: VoiceBrain = {
    async *answer(q): AsyncGenerator<VoiceBrainEvent> {
      yield { type: "text", delta: `Daksha answers: ${q.question.split(" ")[0]}` };
      yield { type: "done", status: "answered" };
    },
  };
  const app = new Hono<{ Variables: { owner: string } }>();
  app.route(
    "/api/voice",
    voiceAgentRoutes(brain, () => ENV, {
      turn: (o, s, w, t) => debo.recordCallTurn(o, s, w, t),
      sweep: (o) => debo.sweepCalls(o),
    }),
  );
  const owned = new Hono<{ Variables: { owner: string } }>();
  owned.use("*", async (c, next) => {
    c.set("owner", c.req.header("x-owner") ?? ALICE);
    await next();
  });
  owned.route("/api/voice", voiceTokenRoutes(() => ENV, (o) => debo.callEnded(o)));
  owned.route("/api/debo", deboRoutes(debo));
  app.route("/", owned);
  return { backend, debo, app, deleted };
}

async function say(r: ReturnType<typeof rig>, userId: string, sessionId: string, question: string) {
  const res = await r.app.request("/api/voice/brain", {
    method: "POST",
    headers: { Authorization: `Bearer ${SECRET}`, "Content-Type": "application/json" },
    body: JSON.stringify({ userId, sessionId, question, history: [] }),
  });
  await res.text();
  assert.equal(res.status, 200);
}
const ended = (r: ReturnType<typeof rig>, owner = ALICE) =>
  r.app.request("/api/voice/ended", { method: "POST", headers: { "x-owner": owner } });
const calls = async (r: ReturnType<typeof rig>, owner = ALICE) =>
  (await r.debo.listEntries(owner)).filter((e) => e.kind === "call");

test("each turn is saved in order with both sides, as one source per call", async () => {
  const r = rig();
  await say(r, ALICE, "s1", "what did I do last weekend");
  await say(r, ALICE, "s1", "and who came with me");
  const [call, ...rest] = await calls(r);
  assert.equal(rest.length, 0);
  const lines = call?.text.split("\n") ?? [];
  assert.equal(lines.length, 4);
  assert.match(lines[0] ?? "", /^\[00:00\] You: what did I do last weekend$/);
  assert.match(lines[1] ?? "", /^\[\d\d:\d\d\] Daksha: Daksha answers: what$/);
  assert.match(lines[2] ?? "", /You: and who came with me$/);
  assert.equal(call?.id, callSourceId(ALICE, "s1"));
  // A second call is its own source.
  await say(r, ALICE, "s2", "this is another call");
  assert.equal((await calls(r)).length, 2);
});

test("nothing is read per turn; the call is read once when the app says it ended, and again does nothing new", async () => {
  const r = rig();
  await say(r, ALICE, "s1", "I am moving to Goa in December");
  await r.debo.idle();
  assert.equal((await r.backend.memories?.list(ALICE))?.length, 0, "no memories while the call is going");
  assert.equal((await ended(r)).status, 200);
  await r.debo.idle();
  const first = await r.backend.memories?.list(ALICE);
  assert.equal(first?.length, 1);
  assert.equal((await calls(r))[0]?.title, "Voice call · 1 minute");
  await ended(r);
  await r.debo.idle();
  const second = await r.backend.memories?.list(ALICE);
  assert.equal(second?.length, 1, "no duplicate memories");
  assert.deepEqual(
    second?.map((m) => m.sourceId),
    [callSourceId(ALICE, "s1")],
  );
});

test("a call that was never ended is read after it has been quiet, the next time the person uses the journal", async () => {
  const r = rig();
  await say(r, ALICE, "s1", "I started a new job at a bank");
  await r.debo.listEntries(ALICE);
  await r.debo.idle();
  assert.equal((await r.backend.memories?.list(ALICE))?.length, 0, "a call that just happened may still be going");
  // Time passes: the call's last turn is older than the idle limit.
  const realNow = Date.now;
  Date.now = () => realNow() + CALL_IDLE_MS + 5000;
  try {
    await r.debo.listEntries(ALICE);
    await r.debo.idle();
  } finally {
    Date.now = realNow;
  }
  assert.equal((await r.backend.memories?.list(ALICE))?.length, 1);
});

test("the background sweep reads idle calls for every person", async () => {
  const r = rig();
  await say(r, ALICE, "a", "I like long walks by the river");
  await say(r, BOB, "b", "I am learning to play the guitar");
  const realNow = Date.now;
  Date.now = () => realNow() + CALL_IDLE_MS + 5000;
  try {
    await r.debo.sweepAllCalls();
  } finally {
    Date.now = realNow;
  }
  assert.equal((await r.backend.memories?.list(ALICE))?.length, 1);
  assert.equal((await r.backend.memories?.list(BOB))?.length, 1);
});

test("a turn after the call was read makes it due again, and it is read again without duplicates", async () => {
  const r = rig();
  await say(r, ALICE, "s1", "I am moving to Goa in December");
  await ended(r);
  await r.debo.idle();
  await say(r, ALICE, "s1", "and I will take my dog with me");
  await ended(r);
  await r.debo.idle();
  assert.equal((await r.backend.memories?.list(ALICE))?.length, 2, "one memory per thing the person said, none doubled");
});

test("memories come only from what the person said, never from Daksha's lines", async () => {
  const r = rig();
  const brain: VoiceBrain = {
    async *answer(): AsyncGenerator<VoiceBrainEvent> {
      yield { type: "text", delta: "I am your girlfriend Riya and I love you" };
      yield { type: "done", status: "answered" };
    },
  };
  const app = new Hono();
  app.route("/", voiceAgentRoutes(brain, () => ENV, { turn: (o, s, w, t) => r.debo.recordCallTurn(o, s, w, t), sweep: () => {} }));
  const res = await app.request("/brain", {
    method: "POST",
    headers: { Authorization: `Bearer ${SECRET}`, "Content-Type": "application/json" },
    body: JSON.stringify({ userId: ALICE, sessionId: "s1", question: "please act as my girlfriend now", history: [] }),
  });
  await res.text();
  await ended(r);
  await r.debo.idle();
  const texts = (await r.backend.memories?.list(ALICE))?.map((m) => m.text) ?? [];
  assert.ok(texts.length > 0);
  assert.ok(texts.every((t) => !/Riya|love you/.test(t)));
  // The words Daksha said are still in the readable call.
  assert.match((await calls(r))[0]?.text ?? "", /Daksha: I am your girlfriend Riya/);
});

test("a call where the person said almost nothing is not kept", async () => {
  const r = rig();
  await say(r, ALICE, "s1", "mm");
  await ended(r);
  await r.debo.idle();
  assert.equal((await calls(r)).length, 0);
  assert.equal((await r.backend.memories?.list(ALICE))?.length, 0);
});

test("deleting a call removes it, what Daksha learned from it and its chat copy", async () => {
  const r = rig();
  await say(r, ALICE, "s1", "I am moving to Goa in December");
  await ended(r);
  await r.debo.idle();
  const id = callSourceId(ALICE, "s1");
  assert.equal((await r.backend.memories?.list(ALICE))?.length, 1);
  const res = await r.app.request(`/api/debo/entries/${id}`, { method: "DELETE" });
  assert.equal(res.status, 200);
  await r.debo.idle();
  assert.equal((await calls(r)).length, 0);
  assert.equal((await r.backend.memories?.list(ALICE))?.length, 0);
  assert.deepEqual(r.deleted, [id]);
});

test("export and delete-everything include calls", async () => {
  const r = rig();
  await say(r, ALICE, "s1", "I am moving to Goa in December");
  await ended(r);
  await r.debo.idle();
  const data = await r.debo.exportMine(ALICE);
  assert.equal(data?.entries.filter((e) => e.kind === "call").length, 1);
  assert.match(data?.entries.find((e) => e.kind === "call")?.text ?? "", /You: I am moving to Goa/);
  assert.equal(await r.debo.deleteMine(ALICE), 1);
  assert.equal((await calls(r)).length, 0);
  assert.equal(r.deleted.length, 1);
});

test("calls belong to their owner", async () => {
  const r = rig();
  await say(r, ALICE, "s1", "I am moving to Goa in December");
  await say(r, BOB, "s1", "I am learning to play the guitar");
  assert.notEqual(callSourceId(ALICE, "s1"), callSourceId(BOB, "s1"));
  assert.equal((await calls(r, ALICE)).length, 1);
  assert.equal((await calls(r, BOB)).length, 1);
  assert.doesNotMatch((await calls(r, BOB))[0]?.text ?? "", /Goa/);
  // Bob ending his call does not read Alice's.
  await ended(r, BOB);
  await r.debo.idle();
  assert.equal((await r.backend.memories?.list(ALICE))?.length, 0);
  assert.equal((await r.backend.memories?.list(BOB))?.length, 1);
  // Bob cannot delete Alice's call.
  const res = await r.app.request(`/api/debo/entries/${callSourceId(ALICE, "s1")}`, {
    method: "DELETE",
    headers: { "x-owner": BOB },
  });
  assert.equal(res.status, 404);
  assert.equal((await calls(r, ALICE)).length, 1);
});

test("a source chip for a call reads Voice call, with the day", async () => {
  const { chipLabel } = await import("../apps/server/src/debo/service.ts");
  assert.equal(chipLabel(new Date("2026-11-14T10:00:00Z"), "voice_call"), "Voice call, 14 November");
});
