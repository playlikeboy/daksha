import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { Hono } from "hono";
import { accountRoutes } from "../apps/server/src/account.ts";
import { createApp } from "../apps/server/src/app.ts";
import type { Config } from "../apps/server/src/config.ts";
import { CustomAvatarStore, customAvatarRoutes, voiceCharacterOf } from "../apps/server/src/custom-avatars.ts";
import { createStore, type Store } from "../apps/server/src/db.ts";
import type { Files } from "../apps/server/src/files.ts";
import { CHARACTER_VOICES, CUSTOM_VOICES, VOICES, voiceFor } from "../apps/server/src/talk-settings.ts";
import type { AgentWorkspace } from "../packages/domain/src/agent.ts";
import {
  AVATARS_MAX,
  avatarConfigSchema,
  avatarOrDefault,
  defaultAvatarConfig,
} from "../packages/domain/src/avatar.ts";

let db: Store;
before(async () => {
  db = await createStore();
});
after(async () => {
  await db.close();
});

const face = (changes: Record<string, unknown> = {}) => ({ ...defaultAvatarConfig, name: "Rani", pronoun: "she", base: "human", hair: "long", ...changes });

test("avatar config: every field is checked, colours are cleaned, odd data falls back", () => {
  const ok = avatarConfigSchema.parse(face({ colours: { ...defaultAvatarConfig.colours, body: " #AABBCC " } }));
  assert.equal(ok.colours.body, "#aabbcc");
  assert.deepEqual(avatarConfigSchema.parse({ ...face(), accessories: undefined }).accessories, []);
  const bad = [
    face({ base: "dragon" }),
    face({ name: "  " }),
    face({ name: "x".repeat(41) }),
    face({ pronoun: "it" }),
    face({ hair: "mohawk" }),
    face({ ears: "wings" }),
    face({ accessories: ["glasses", "glasses"] }),
    face({ accessories: ["crown"] }),
    face({ colours: { ...defaultAvatarConfig.colours, eyes: "red" } }),
    face({ colours: { ...defaultAvatarConfig.colours, eyes: "url(javascript:alert(1))" } }),
    face({ colours: { body: "#ffffff" } }),
  ];
  for (const value of bad) assert.equal(avatarConfigSchema.safeParse(value).success, false, JSON.stringify(value));
  assert.deepEqual(avatarOrDefault({ base: "dragon" }), defaultAvatarConfig);
  assert.deepEqual(avatarOrDefault(null), defaultAvatarConfig);
  assert.equal(avatarOrDefault(face()).name, "Rani");
});

test("custom avatars: add, change, remove; each person sees only their own; up to ten", async () => {
  const store = new CustomAvatarStore(db);
  const rani = await store.add("a1", face());
  assert.equal(rani.name, "Rani");
  assert.ok(rani.id && rani.createdAt);
  assert.equal((await store.list("a2")).length, 0);
  assert.equal(await store.get("a2", rani.id), null, "another person cannot read it by id");
  await assert.rejects(store.update("a2", rani.id, face({ name: "Stolen" })), /not saved/);
  await store.remove("a2", rani.id);
  assert.equal((await store.list("a1")).length, 1, "another person cannot delete it");
  const fixed = await store.update("a1", rani.id, face({ base: "cat", ears: "pointed" }));
  assert.equal(fixed.base, "cat");
  assert.equal(fixed.createdAt, rani.createdAt);
  await assert.rejects(store.add("a1", face({ base: "dragon" })));
  for (let i = 1; i < AVATARS_MAX; i++) await store.add("a1", face({ name: `Face ${i}` }));
  await assert.rejects(store.add("a1", face()), /up to 10/);
  await store.remove("a1", rani.id);
  assert.equal((await store.list("a1")).length, AVATARS_MAX - 1);
});

test("custom avatar routes are owner-scoped and refuse bad configs", async () => {
  const app = new Hono<{ Variables: { owner: string } }>();
  app.use("*", async (c, next) => {
    c.set("owner", c.req.header("x-owner") ?? "route-owner");
    await next();
  });
  app.onError((error, c) => c.json({ error: error.message }, 422));
  app.route("/avatars", customAvatarRoutes(new CustomAvatarStore(db)));
  const json = { "Content-Type": "application/json" };
  const created = await app.request("/avatars", { method: "POST", headers: json, body: JSON.stringify(face()) });
  assert.equal(created.status, 201);
  const { avatar } = await created.json();
  assert.equal((await app.request("/avatars", { method: "POST", headers: json, body: JSON.stringify(face({ base: "x" })) })).status, 422);
  const listed = await (await app.request("/avatars")).json();
  assert.equal(listed.avatars.length, 1);
  assert.equal(listed.limits.max, AVATARS_MAX);
  assert.equal((await app.request(`/avatars/${avatar.id}`)).status, 200);
  const other = { "x-owner": "someone-else" };
  assert.equal((await (await app.request("/avatars", { headers: other })).json()).avatars.length, 0);
  assert.notEqual((await app.request(`/avatars/${avatar.id}`, { headers: other })).status, 200);
  const put = await app.request(`/avatars/${avatar.id}`, { method: "PUT", headers: { ...json, ...other }, body: JSON.stringify(face()) });
  assert.notEqual(put.status, 200);
  await app.request(`/avatars/${avatar.id}`, { method: "DELETE" });
  assert.equal((await (await app.request("/avatars")).json()).avatars.length, 0);
});

test("custom avatars are in Download my data and gone after Delete my data", async () => {
  const owner = "export-avatar-owner";
  await new CustomAvatarStore(db).add(owner, face({ name: "Chotu", base: "fruit", ears: "leaves" }));
  const files = { removeAll: async () => 0 } as unknown as Files;
  const app = new Hono<{ Variables: { owner: string } }>();
  app.use("*", async (c, next) => {
    c.set("owner", owner);
    await next();
  });
  app.route("/account", accountRoutes(db, files));
  const exported = await (await app.request("/account/export")).json();
  assert.ok(
    exported.records.some((r: { kind: string; data: { name: string } }) => r.kind === "custom-avatars" && r.data.name === "Chotu"),
  );
  const gone = await app.request("/account", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirm: true }),
  });
  assert.equal(gone.status, 200);
  assert.equal((await new CustomAvatarStore(db).list(owner)).length, 0);
});

test("a face the person made starts with a voice that fits the pronoun they picked", () => {
  assert.equal(voiceFor(null, "custom", "he").voice, CUSTOM_VOICES.he);
  assert.equal(voiceFor(null, "custom", "she").voice, CUSTOM_VOICES.she);
  assert.equal(voiceFor(null, "custom", "they").voice, CUSTOM_VOICES.they);
  assert.equal(voiceFor(null, "custom").voice, CHARACTER_VOICES.custom, "no pronoun: the plain default");
  assert.equal(voiceFor(null, "custom", "it").voice, CHARACTER_VOICES.custom);
  // A pronoun only matters for a face the person made.
  assert.equal(voiceFor(null, "kabir", "she").voice, CHARACTER_VOICES.kabir);
  // The person's own pick still wins.
  assert.equal(voiceFor({ voice: VOICES[1].id }, "custom", "he").voice, VOICES[1].id);
  for (const id of Object.values(CUSTOM_VOICES)) assert.ok(VOICES.some((v) => v.id === id));
});

test("talking to a face: the identity must point at one of the person's own faces", async () => {
  const directory = await mkdtemp(join(tmpdir(), "openfuse-custom-avatars-"));
  const appDb = await createStore({ dataDir: join(directory, "db") });
  const config: Config = {
    mode: "sample",
    port: 8787,
    host: "127.0.0.1",
    publicUrl: "http://localhost:8787",
    dataDir: directory,
    agentBackend: "model",
    googleRedirectUri: "http://localhost:8787/api/google/callback",
    allowedOrigins: ["http://localhost:8081"],
  };
  const server = await createApp(appDb, config);
  try {
    const session = await server.app.request("/api/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    const token = (await session.json()).token as string;
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    const call = (path: string, method = "GET", body?: unknown) =>
      server.app.request(path, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

    const made = await call("/api/custom-avatars", "POST", face({ pronoun: "he", name: "Bittu" }));
    assert.equal(made.status, 201, await made.clone().text());
    const { avatar } = await made.json();

    // No face, or someone else's id: refused, nothing changes.
    assert.equal((await call("/api/agent/identity", "POST", { name: "Daksha", tone: "warm", character: "custom" })).status, 422);
    assert.equal(
      (await call("/api/agent/identity", "POST", { name: "Daksha", tone: "warm", character: "custom", customAvatar: "not-mine" })).status,
      422,
    );
    const ok = await call("/api/agent/identity", "POST", { name: "Bittu", tone: "warm", character: "custom", customAvatar: avatar.id });
    assert.equal(ok.status, 200, await ok.clone().text());
    const identity = ((await (await call("/api/agent")).json()) as AgentWorkspace).identity;
    assert.equal(identity.character, "custom");
    assert.equal(identity.customAvatar, avatar.id);
    // A later save without the id keeps the face (settings that only change the tone).
    assert.equal((await call("/api/agent/identity", "POST", { name: "Bittu", tone: "concise", character: "custom" })).status, 200);

    // The voice follows the pronoun the person picked.
    const talk = await (await call("/api/talk-settings")).json();
    assert.equal(talk.voice.voice, CUSTOM_VOICES.he);

    // Deleting the face in use goes back to Daksha.
    await call(`/api/custom-avatars/${avatar.id}`, "DELETE");
    const after = ((await (await call("/api/agent")).json()) as AgentWorkspace).identity;
    assert.equal(after.character, "debo");
  } finally {
    await server.agent?.stop();
    await appDb.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("voiceCharacterOf reads only the owner's own face", async () => {
  const store = new CustomAvatarStore(db);
  const mine = await store.add("v1", face({ pronoun: "he" }));
  await db.put("v1", "agent-settings", { id: "identity", name: "Bittu", tone: "warm", character: "custom", customAvatar: mine.id });
  assert.deepEqual(await voiceCharacterOf(db, "v1"), { character: "custom", pronoun: "he" });
  await db.put("v2", "agent-settings", { id: "identity", name: "X", tone: "warm", character: "custom", customAvatar: mine.id });
  assert.deepEqual(await voiceCharacterOf(db, "v2"), { character: "custom", pronoun: undefined });
  assert.deepEqual(await voiceCharacterOf(db, "nobody"), { character: undefined });
});
