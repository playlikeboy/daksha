// Custom people, their faces, and their voice notes and calls, working together the way
// createApp wires them (app.ts): a person with a face they made, a call recording labelled
// so only their lines are kept, a profile built from those lines, a voice copy, then the
// person deleted, which deletes the copy at Cartesia (a fake) and leaves no raw files.
// Every name and line here is made up for the test.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { strToU8, zipSync } from "fflate";
import { Hono } from "hono";
import { z } from "zod";
import { defaultAvatarConfig } from "../packages/domain/src/avatar.ts";
import { CustomAvatarStore } from "../apps/server/src/custom-avatars.ts";
import { activeCustomVoice, customPeopleRoutes } from "../apps/server/src/custom-people/index.ts";
import type { PersonModel } from "../apps/server/src/custom-people/profile.ts";
import { CustomPeopleService } from "../apps/server/src/custom-people/service.ts";
import type { CustomPerson } from "../apps/server/src/custom-people/store.ts";
import { createStore } from "../apps/server/src/db.ts";
import { fakeAudioTools } from "../apps/server/src/debo/audio.ts";
import { memoryStore } from "../apps/server/src/debo/dev-store.ts";
import { AppError } from "../apps/server/src/errors.ts";
import { OwnKeysService } from "../apps/server/src/own-keys/service.ts";
import { fakeDiarizer } from "../apps/server/src/voice-clone/diarize.ts";
import { customPeopleGlue } from "../apps/server/src/voice-clone/glue.ts";
import { voiceCopyRoutes } from "../apps/server/src/voice-clone/routes.ts";
import { VoiceCopyService } from "../apps/server/src/voice-clone/service.ts";
import { writeWav } from "../apps/server/src/voice-clone/wav.ts";
import { ANDROID_24H_DMY } from "./helpers/whatsapp-fixtures.ts";

const OWNER = "44444444-4444-4444-8444-444444444444";
const OTHER = "55555555-5555-4555-8555-555555555555";
const CARTESIA_KEY = "sk_car_TESTKEYabcdefghijklmnop-9999";

/** Cartesia, in this process: makes private voices and deletes them, and records every call. */
function fakeCartesia() {
  const calls: { method: string; url: string }[] = [];
  let n = 0;
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push({ method, url });
    if (new Headers(init?.headers).get("authorization") !== `Bearer ${CARTESIA_KEY}`) return new Response("{}", { status: 401 });
    if (url === "https://api.cartesia.ai/voices/clone") {
      n += 1;
      return new Response(JSON.stringify({ id: `voice-${n}`, access: "private" }), { status: 200 });
    }
    if (url.startsWith("https://api.cartesia.ai/voices/") && method === "DELETE") return new Response(null, { status: 204 });
    if (url.startsWith("https://api.cartesia.ai/voices?")) return new Response(JSON.stringify({ data: [] }), { status: 200 });
    return new Response("unexpected", { status: 500 });
  }) as typeof fetch;
  return { calls, fetcher };
}

/** A model that keeps every line it is given as an example, so the test can see what it got. */
function echoModel(): PersonModel & { requests: { personLines: string[] }[] } {
  const model = {
    requests: [] as { personLines: string[] }[],
    async describePhoto() {
      return "";
    },
    async buildProfile(request: { personLines: string[] }) {
      model.requests.push(request);
      return {
        styleSummary: "Warm, asks if you ate.",
        examples: request.personLines,
        nicknames: ["beta"],
        languages: ["Hinglish"],
        facts: [{ text: "Asks about food first", source: "voice" as const }],
        appearance: "",
      };
    },
  };
  return model;
}

function tone(seconds: number, rate = 8000): Float32Array {
  const out = new Float32Array(Math.round(seconds * rate));
  for (let i = 0; i < out.length; i++) out[i] = Math.round(Math.sin(i / 10) * 1000) / 2000;
  return out;
}

async function setup() {
  const db = await createStore();
  const store = memoryStore("http://localhost:8787");
  const cartesia = fakeCartesia();
  const ownKeys = new OwnKeysService(db, { encryptionKey: randomBytes(32).toString("base64"), fetcher: cartesia.fetcher, log: () => {} });
  await ownKeys.save(OWNER, "cartesia", { key: CARTESIA_KEY });
  const work: Promise<void>[] = [];
  const later = (w: Promise<void>) => void work.push(w);
  const model = echoModel();
  // The same links as createApp: each service reaches the other only through these two seams.
  const linked: { voiceCopy?: VoiceCopyService } = {};
  const people = new CustomPeopleService({
    db,
    store: () => store,
    model: async () => model,
    later,
    beforeRemove: async (owner, person) => linked.voiceCopy?.deleteForPerson(owner, person.id),
    sweepAlso: async () => (await linked.voiceCopy?.sweep()) ?? 0,
  });
  const voiceCopy = new VoiceCopyService({
    db,
    store: () => store,
    audio: fakeAudioTools({ durationSeconds: 40 }),
    diarizer: fakeDiarizer(() => ({
      language: "hi",
      utterances: [
        { speaker: "0", start: 0, end: 6, text: "Beta, khana kha liya?" },
        { speaker: "0", start: 7, end: 13, text: "Mera account 00123456789 hai." },
        { speaker: "0", start: 14, end: 20, text: "Chalo, apna dhyan rakhna." },
        { speaker: "1", start: 21, end: 30, text: "MY OWN WORDS about my day" },
        { speaker: "2", start: 31, end: 39, text: "SOMEONE ELSE talking" },
      ],
    })),
    glue: customPeopleGlue(people),
    ownCartesiaKey: (owner) => ownKeys.secret(owner, "cartesia"),
    fetchImpl: cartesia.fetcher,
    later,
    log: () => {},
  });
  linked.voiceCopy = voiceCopy;

  const app = new Hono<{ Variables: { owner: string } }>();
  app.use("*", async (c, next) => {
    c.set("owner", c.req.header("x-owner") ?? OWNER);
    await next();
  });
  app.onError((error, c) => {
    if (error instanceof z.ZodError) return c.json({ error: error.issues.map((i) => i.message).join("; ") }, 422);
    if (error instanceof AppError) return c.json({ error: error.message }, error.status);
    return c.json({ error: error.message }, 500);
  });
  // Both route sets on one prefix, as in app.ts.
  app.route("/api/custom-people", customPeopleRoutes(people));
  app.route("/api/custom-people", voiceCopyRoutes(voiceCopy));
  const call = async (path: string, method = "GET", body?: unknown, as = OWNER) => {
    const res = await app.request(path, {
      method,
      headers: { "content-type": "application/json", "x-owner": as },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    // biome-ignore lint/suspicious/noExplicitAny: test replies are read loosely, field by field
    return { status: res.status, json: (await res.json()) as Record<string, any> };
  };
  const settle = async () => {
    while (work.length) await work.shift();
  };
  const rawLeft = () => [...store.objects.keys()].filter((k) => k.startsWith("persona-uploads/"));
  return { db, store, cartesia, people, voiceCopy, model, call, settle, rawLeft };
}

test("a person with a face, voice lines labelled, profile built from them, then deleted with the voice copy and the raw files", async () => {
  const t = await setup();

  // A face the owner made; another owner's face can't be used.
  const faces = new CustomAvatarStore(t.db);
  const face = await faces.add(OWNER, { ...defaultAvatarConfig, name: "Nani face", pronoun: "she", base: "human" });
  const theirs = await faces.add(OTHER, { ...defaultAvatarConfig, name: "Not yours", pronoun: "she", base: "human" });
  const refused = await t.call("/api/custom-people", "POST", { name: "Nani", avatarId: theirs.id });
  assert.equal(refused.status, 422, "another owner's face is not found");
  const made = await t.call("/api/custom-people", "POST", { name: "Nani", relation: "my grandmother", avatarId: face.id });
  assert.equal(made.status, 201, JSON.stringify(made.json));
  const id = made.json.person.id as string;
  assert.equal(made.json.person.avatarId, face.id);

  // A chat export first, so the profile has chat lines too.
  const zip = zipSync({ "WhatsApp Chat with Meera Test.txt": strToU8(ANDROID_24H_DMY) });
  const started = await t.call(`/api/custom-people/${id}/sources`, "POST", {
    consent: true,
    files: [{ kind: "chat", mimeType: "application/zip", sizeBytes: zip.byteLength }],
  });
  assert.equal(started.status, 201, JSON.stringify(started.json));
  const chatKey = [...t.store.issued].filter((i) => i.op === "put").at(-1)?.key ?? "";
  assert.match(chatKey, new RegExp(`^persona-uploads/${OWNER}/[^/]+/[^/]+\\.zip$`));
  t.store.put(chatKey, zip);
  await t.call(`/api/custom-people/${id}/sources/${started.json.upload.id}/complete`, "POST", {});
  await t.settle();
  await t.call(`/api/custom-people/${id}/sources/${started.json.upload.id}/sender`, "POST", { sender: "Meera Test" });
  await t.settle();

  // A call recording on the same prefix: voices separated, only speaker 0 kept, with a voice copy.
  const wav = writeWav({ sampleRate: 8000, samples: tone(40) });
  const audio = await t.call(`/api/custom-people/${id}/audio`, "POST", { consent: true, mimeType: "audio/wav", sizeBytes: wav.byteLength, kind: "call" });
  assert.equal(audio.status, 201, JSON.stringify(audio.json));
  const audioKey = `persona-uploads/${OWNER}/${audio.json.uploadId}.wav`;
  t.store.put(audioKey, wav);
  await t.call(`/api/custom-people/${id}/audio/${audio.json.uploadId}/complete`, "POST", {});
  await t.settle();
  const labelled = await t.call(`/api/custom-people/${id}/audio/${audio.json.uploadId}/labels`, "POST", {
    labels: { "0": "them", "1": "me", "2": "other" },
    copyVoice: { consent: true },
  });
  assert.equal(labelled.status, 200, JSON.stringify(labelled.json));
  assert.equal(labelled.json.keptLines, 3);
  assert.equal(labelled.json.voiceCopy.status, "copied");
  await t.settle();

  // The profile was built again with the spoken lines as their own, next to the chat lines.
  const person = (await t.call(`/api/custom-people/${id}`)).json.person as CustomPerson;
  assert.deepEqual(
    person.spokenLines?.map((l) => l.text),
    ["Beta, khana kha liya?", "Mera account [number] hai.", "Chalo, apna dhyan rakhna."],
  );
  assert.ok(person.examples.includes("Beta, khana kha liya?"), JSON.stringify(person.examples));
  assert.ok(person.examples.includes("happy new year beta!!"), "lines from the chat stay");
  const lastRequest = JSON.stringify(t.model.requests.at(-1));
  assert.ok(lastRequest.includes("Chalo, apna dhyan rakhna."));
  assert.ok(!lastRequest.includes("MY OWN WORDS") && !lastRequest.includes("SOMEONE ELSE"), "other voices never reach the model");
  assert.ok(!lastRequest.includes("00123456789"), "scrubbed before the model");
  assert.ok(person.facts.some((f) => f.source === "voice"));
  assert.equal(person.builtFrom?.voice, 3);
  assert.equal(person.voiceCloneId, id, "the record says a voice copy exists");
  assert.deepEqual(t.rawLeft(), [], "the chat and the recording are gone already");

  // Talking as them: calls use the copy through /api/voice/session.
  await t.call(`/api/custom-people/${id}/talk`, "POST", {});
  assert.deepEqual(await activeCustomVoice(t.db, OWNER), { personId: id, name: "Nani", voiceCopy: true });
  const callVoice = await t.voiceCopy.callVoice(OWNER);
  assert.equal(callVoice?.voiceId, "voice-1");
  assert.equal(await t.voiceCopy.callVoice(OTHER), null);

  // A stray raw file and a recording still waiting, then the person is deleted.
  const waiting = await t.call(`/api/custom-people/${id}/audio`, "POST", { consent: true, mimeType: "audio/wav", sizeBytes: wav.byteLength });
  t.store.put(`persona-uploads/${OWNER}/${waiting.json.uploadId}.wav`, wav);
  const deleted = await t.call(`/api/custom-people/${id}`, "DELETE");
  assert.equal(deleted.status, 200, JSON.stringify(deleted.json));
  const cartesiaDeletes = t.cartesia.calls.filter((c) => c.method === "DELETE");
  assert.deepEqual(cartesiaDeletes.map((c) => c.url), ["https://api.cartesia.ai/voices/voice-1"], "deleted at Cartesia once");
  assert.deepEqual(t.rawLeft(), [], "no raw files left");
  assert.equal(await t.db.get(OWNER, "custom-people", id), null);
  assert.equal(await t.db.get(OWNER, "voice-clones", id), null);
  assert.deepEqual(await t.db.list(OWNER, "voice-uploads"), []);
  assert.deepEqual(await t.db.list(OWNER, "voice-consents"), []);
  assert.equal(await activeCustomVoice(t.db, OWNER), undefined, "Daksha is herself again");
  assert.equal(await t.voiceCopy.callVoice(OWNER), null);
  // The face stays: it is the owner's, and can be used again.
  assert.ok(await faces.get(OWNER, face.id));
});

test("a face can be taken off a person, and only the owner's own faces can be put on", async () => {
  const t = await setup();
  const faces = new CustomAvatarStore(t.db);
  const face = await faces.add(OWNER, { ...defaultAvatarConfig, name: "Kid face", pronoun: "he", base: "blob" });
  const id = (await t.call("/api/custom-people", "POST", { name: "Chotu" })).json.person.id as string;
  assert.equal((await t.call(`/api/custom-people/${id}`, "PUT", { avatarId: "not-a-face" })).status, 422);
  assert.equal((await t.call(`/api/custom-people/${id}`, "PUT", { avatarId: face.id })).json.person.avatarId, face.id);
  const off = await t.call(`/api/custom-people/${id}`, "PUT", { avatarId: null });
  assert.equal(off.status, 200);
  assert.equal(off.json.person.avatarId, undefined);
});

test("one upkeep sweep clears old voice recordings too", async () => {
  const t = await setup();
  const id = (await t.call("/api/custom-people", "POST", { name: "Dadu" })).json.person.id as string;
  const wav = writeWav({ sampleRate: 8000, samples: tone(2) });
  const started = await t.call(`/api/custom-people/${id}/audio`, "POST", { consent: true, mimeType: "audio/wav", sizeBytes: wav.byteLength });
  const key = `persona-uploads/${OWNER}/${started.json.uploadId}.wav`;
  t.store.put(key, wav);
  const row = await t.db.get<{ id: string; createdAt: string }>(OWNER, "voice-uploads", started.json.uploadId);
  assert.ok(row);
  await t.db.put<{ id: string; createdAt: string }>(OWNER, "voice-uploads", { ...row, createdAt: new Date(Date.now() - 25 * 3_600_000).toISOString() });
  assert.ok((await t.people.sweep()) >= 1);
  assert.ok(!t.store.objects.has(key));
});
