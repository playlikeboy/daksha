import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { Hono } from "hono";
import { accountRoutes } from "../apps/server/src/account.ts";
import type { Config } from "../apps/server/src/config.ts";
import { createStore, type Store } from "../apps/server/src/db.ts";
import { AudioError, fakeAudioTools } from "../apps/server/src/debo/audio.ts";
import { memoryStore } from "../apps/server/src/debo/dev-store.ts";
import { AppError } from "../apps/server/src/errors.ts";
import { Files } from "../apps/server/src/files.ts";
import { OwnKeysService } from "../apps/server/src/own-keys/service.ts";
import { voiceAgentRoutes } from "../apps/server/src/voice/routes.ts";
import { CANT_CUT, cutClip, cutFormat } from "../apps/server/src/voice-clone/decode.ts";
import {
  bindingDiarizer,
  type Diarization,
  DiarizeError,
  fakeDiarizer,
  readDiarization,
  summariseSpeakers,
} from "../apps/server/src/voice-clone/diarize.ts";
import { recordsGlue } from "../apps/server/src/voice-clone/glue.ts";
import { voiceCopyRoutes } from "../apps/server/src/voice-clone/routes.ts";
import { keepLines, NEEDS_KEY, RAW_AUDIO_TTL_MS, VoiceCopyService } from "../apps/server/src/voice-clone/service.ts";
import { isEmptyAfterScrub, scrubLine } from "../apps/server/src/voice-clone/scrub.ts";
import { cutAndJoin, pickClipRanges, RangeCollector, readWav, writeWav } from "../apps/server/src/voice-clone/wav.ts";
import { type AiLike, DIARIZE_MODEL, handleAi, keyFromPath } from "../infra/cloudflare/api/src/media.ts";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const ASHA = "33333333-3333-4333-8333-333333333333";
const CARTESIA_KEY = "sk_car_TESTKEYabcdefghijklmnop-1234";
const DEBO_KEY = "sk_car_DEBOKEYabcdefghijklmnop-5678";

// ---- Pieces ----

test("Nova-3's answer is read from utterances, or from words when there are none", () => {
  const withUtterances = readDiarization({
    success: true,
    result: {
      results: {
        channels: [{ detected_language: "hi", alternatives: [{ words: [] }] }],
        utterances: [
          { start: 4, end: 6, transcript: "Second line", speaker: 1 },
          { start: 0.123, end: 3.456, transcript: " First line ", speaker: 0 },
          { start: 7, end: 7, transcript: "zero length", speaker: 0 },
        ],
      },
    },
  });
  assert.equal(withUtterances.language, "hi");
  assert.deepEqual(withUtterances.utterances, [
    { speaker: "0", start: 0.12, end: 3.46, text: "First line" },
    { speaker: "1", start: 4, end: 6, text: "Second line" },
  ]);

  // The bare Deepgram shape, words only: grouped by speaker, a long pause starts a new line.
  const words = readDiarization({
    results: {
      channels: [
        {
          alternatives: [
            {
              languages: ["en"],
              words: [
                { word: "hello", punctuated_word: "Hello", start: 0, end: 0.4, speaker: 0 },
                { word: "there", punctuated_word: "there.", start: 0.5, end: 0.9, speaker: 0 },
                { word: "hi", punctuated_word: "Hi!", start: 1.2, end: 1.5, speaker: 1 },
                { word: "again", start: 4, end: 4.5, speaker: 1 },
              ],
            },
          ],
        },
      ],
    },
  });
  assert.equal(words.language, "en");
  assert.deepEqual(
    words.utterances.map((u) => [u.speaker, u.text]),
    [
      ["0", "Hello there."],
      ["1", "Hi!"],
      ["1", "again"],
    ],
  );

  assert.throws(() => readDiarization({ success: false }), DiarizeError);
  assert.throws(() => readDiarization({ nonsense: true }), DiarizeError);
});

test("each voice gets a few sample lines and short sample times, the one who talks most first", () => {
  const speakers = summariseSpeakers([
    { speaker: "1", start: 0, end: 2, text: "short" },
    { speaker: "0", start: 2, end: 14, text: "a long thing said by zero" },
    { speaker: "0", start: 15, end: 16, text: "hm" },
    { speaker: "1", start: 17, end: 20, text: "a slightly longer one" },
  ]);
  assert.deepEqual(
    speakers.map((s) => s.speaker),
    ["0", "1"],
  );
  assert.equal(speakers[0]?.lineCount, 2);
  assert.deepEqual(speakers[0]?.sampleLines, ["a long thing said by zero", "hm"]);
  assert.deepEqual(speakers[0]?.samples, [{ start: 2, end: 10 }], "a sample is at most 8 seconds, and never a tiny one");
  assert.deepEqual(speakers[1]?.samples, [
    { start: 0, end: 2 },
    { start: 17, end: 20 },
  ]);
});

test("private details are taken out of spoken lines", () => {
  const cases: [string, RegExp, RegExp][] = [
    ["Call me on +91 98765 43210 tonight", /\[phone\]/, /98765/],
    ["mail me at asha.k@example.com ok", /\[email\]/, /example\.com/],
    ["your OTP is 482913 don't share", /OTP \[code\]/, /482913/],
    ["card 4111 1111 1111 1111 expires soon", /\[number\]/, /4111/],
    ["account number 00123456789", /\[(number|phone)\]/, /00123456789/],
    ["I live at 42 MG Road near the park", /\[address\]/, /42 MG Road/],
  ];
  for (const [line, has, hasNot] of cases) {
    const out = scrubLine(line);
    assert.match(out, has, line);
    assert.doesNotMatch(out, hasNot, line);
  }
  assert.equal(scrubLine("I was born in 1990, beta"), "I was born in 1990, beta", "years stay");
  assert.ok(isEmptyAfterScrub(scrubLine("9876543210")));
  assert.ok(!isEmptyAfterScrub(scrubLine("Khana kha liya?")));
});

test("kept lines are scrubbed, without repeats or empty ones, and say where they came from", () => {
  const lines = keepLines(
    [
      { speaker: "0", start: 0, end: 1, text: "Khana kha liya?" },
      { speaker: "0", start: 1, end: 2, text: "khana kha liya?" },
      { speaker: "0", start: 2, end: 3, text: "98765 43210" },
      { speaker: "0", start: 3, end: 4, text: "Call 98765 43210 now" },
    ],
    "call",
  );
  assert.deepEqual(lines, [
    { text: "Khana kha liya?", source: "from a call recording" },
    { text: "Call [phone] now", source: "from a call recording" },
  ]);
});

/** A tone: easy to tell where a cut came from. */
function tone(seconds: number, rate = 8000): Float32Array {
  const out = new Float32Array(Math.round(seconds * rate));
  for (let i = 0; i < out.length; i++) out[i] = Math.round(Math.sin(i / 10) * 1000) / 2000;
  return out;
}

test("WAV files are written and read back, and stretches are cut and joined", () => {
  const pcm = { sampleRate: 8000, samples: tone(3) };
  const bytes = writeWav(pcm);
  assert.equal(String.fromCharCode(...bytes.subarray(0, 4)), "RIFF");
  assert.equal(bytes.byteLength, 44 + 3 * 8000 * 2);
  const back = readWav(bytes);
  assert.equal(back.sampleRate, 8000);
  assert.equal(back.samples.length, 24000);
  assert.ok(Math.abs((back.samples[100] ?? 0) - (pcm.samples[100] ?? 0)) < 0.001);

  // Two stretches of one second, with 0.3 seconds of silence between.
  const joined = cutAndJoin(back, [
    { start: 0, end: 1 },
    { start: 2, end: 3 },
  ]);
  assert.equal(joined.samples.length, 8000 + 2400 + 8000);
  assert.equal(joined.samples[8000 + 1200], 0, "the gap is silent");

  // The collector keeps the same stretches while the sound arrives in pieces.
  const collector = new RangeCollector([
    { start: 0, end: 1 },
    { start: 2, end: 3 },
  ]);
  for (let at = 0; at < back.samples.length && !collector.full; at += 3000)
    collector.push([back.samples.subarray(at, at + 3000)], 8000);
  assert.deepEqual(collector.result().samples, joined.samples);
});

test("the clip uses the longest stretches, 10 to 30 seconds in all, back in time order", () => {
  assert.equal(pickClipRanges([{ start: 0, end: 5 }]), null, "too little sound");
  const picked = pickClipRanges([
    { start: 0, end: 1 }, // too short: only "hm"
    { start: 10, end: 22 },
    { start: 30, end: 45 },
    { start: 50, end: 60 },
  ]);
  assert.ok(picked);
  const speech = picked.reduce((sum, r) => sum + (r.end - r.start), 0);
  assert.ok(speech >= 10 && speech <= 30, `speech is ${speech}`);
  assert.deepEqual(
    picked.map((r) => Math.floor(r.start)),
    [10, 30, 50].filter((s) => picked.some((r) => Math.floor(r.start) === s)),
  );
  assert.ok(picked.every((r, i) => i === 0 || r.start > (picked[i - 1]?.start ?? 0)));
});

test("only voice notes, mp3, flac and wav can be cut for a voice copy", () => {
  assert.equal(cutFormat("audio/ogg"), "opus");
  assert.equal(cutFormat("audio/opus"), "opus");
  assert.equal(cutFormat("audio/mpeg"), "mp3");
  assert.equal(cutFormat("audio/flac"), "flac");
  assert.equal(cutFormat("audio/wav"), "wav");
  assert.equal(cutFormat("audio/mp4"), null);
  assert.equal(cutFormat("audio/aac"), null);
  assert.equal(cutFormat("video/mp4"), null);
  assert.match(CANT_CUT, /voice note, an mp3 or a wav/);
});

test("a recording that is not really audio fails the cut with an error, not a crash", async () => {
  await assert.rejects(cutClip(new Uint8Array([1, 2, 3]), "wav", [{ start: 0, end: 1 }]), /WAV/);
});

test("the Worker sends speaker separation to Nova-3 with the audio as a stream and only allowed settings", async () => {
  const runs: { model: string; input: Record<string, unknown> }[] = [];
  const ai: AiLike = {
    async run(model, input) {
      runs.push({ model, input });
      return { results: { utterances: [{ start: 0, end: 1, transcript: "hi", speaker: 0 }] } };
    },
  };
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) =>
    handleAi(new Request(String(input), { ...init, duplex: "half" } as RequestInit), ai)) as typeof fetch;
  const result = await bindingDiarizer("http://ai.internal", fetcher).diarize(new Uint8Array([1, 2, 3, 4]), "audio/mpeg");
  assert.deepEqual(result.utterances, [{ speaker: "0", start: 0, end: 1, text: "hi" }]);
  assert.equal(runs[0]?.model, DIARIZE_MODEL);
  const input = runs[0]?.input ?? {};
  assert.equal(input.diarize, true);
  assert.equal(input.utterances, true);
  assert.equal(input.detect_language, true);
  const audio = input.audio as { body: unknown; contentType: string };
  assert.equal(audio.contentType, "audio/mpeg");
  assert.ok(audio.body instanceof ReadableStream);

  const refused = await handleAi(
    new Request("http://ai.internal/diarize", { method: "POST", headers: { "content-type": "text/html" }, body: "x" }),
    ai,
  );
  assert.equal(refused.status, 415);
  // Keys under the temporary folder are allowed; nothing else new is.
  assert.equal(keyFromPath(`/o/persona-uploads/${A}/abc.ogg`, "o"), `persona-uploads/${A}/abc.ogg`);
  assert.equal(keyFromPath(`/o/other/${A}/abc.ogg`, "o"), null);
});

// ---- The whole flow ----

type Call = { method: string; url: string; auth: string | null; version: string | null; form?: FormData };

/** Cartesia, in this process. Only the two test keys work. */
function fakeCartesia(options: { cloneStatus?: number } = {}) {
  const calls: Call[] = [];
  let n = 0;
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    const call: Call = {
      method: init?.method ?? "GET",
      url,
      auth: headers.get("authorization"),
      version: headers.get("cartesia-version"),
      ...(init?.body instanceof FormData ? { form: init.body } : {}),
    };
    calls.push(call);
    if (call.auth !== `Bearer ${CARTESIA_KEY}` && call.auth !== `Bearer ${DEBO_KEY}`) return new Response("{}", { status: 401 });
    if (url === "https://api.cartesia.ai/voices/clone") {
      if (options.cloneStatus) return new Response("{}", { status: options.cloneStatus });
      n += 1;
      return new Response(JSON.stringify({ id: `voice-${n}`, access: "private" }), { status: 200 });
    }
    if (url.startsWith("https://api.cartesia.ai/voices/") && call.method === "DELETE") return new Response(null, { status: 204 });
    if (url.startsWith("https://api.cartesia.ai/voices?")) return new Response(JSON.stringify({ data: [] }), { status: 200 });
    return new Response("unexpected", { status: 500 });
  }) as typeof fetch;
  return { calls, fetcher };
}

/** 40 seconds of sound: Asha talks 0 to 20 s, the person 21 to 30 s, someone else 31 to 39 s. */
const CALL: Diarization = {
  language: "hi",
  utterances: [
    { speaker: "0", start: 0, end: 6, text: "Beta, khana kha liya?" },
    { speaker: "0", start: 7, end: 13, text: "Mera number hai 98765 43210, yaad rakhna." },
    { speaker: "0", start: 14, end: 20, text: "Chalo, apna dhyan rakhna." },
    { speaker: "1", start: 21, end: 30, text: "Haan Mummy, kha liya. MY OWN WORDS" },
    { speaker: "2", start: 31, end: 39, text: "SOMEONE ELSE talking about their secrets" },
  ],
};

async function fixture(
  options: {
    ownKey?: boolean;
    deboKey?: string;
    cloneStatus?: number;
    diarize?: () => Diarization | Promise<Diarization>;
    audioFails?: boolean;
  } = {},
) {
  const db = await createStore();
  const store = memoryStore("http://localhost:8787");
  const cartesia = fakeCartesia({ cloneStatus: options.cloneStatus });
  const ownKeys = new OwnKeysService(db, { encryptionKey: randomBytes(32).toString("base64"), fetcher: cartesia.fetcher, log: () => {} });
  if (options.ownKey) await ownKeys.save(A, "cartesia", { key: CARTESIA_KEY });
  await db.put(A, "custom-people", { id: ASHA, name: "Asha" });
  const pending: Promise<void>[] = [];
  const logs: string[] = [];
  const diarizer = fakeDiarizer(options.diarize ?? (() => CALL));
  const service = new VoiceCopyService({
    db,
    store: () => store,
    audio: options.audioFails ? fakeAudioTools({ fail: true }) : fakeAudioTools({ durationSeconds: 40 }),
    diarizer,
    glue: recordsGlue(db),
    ownCartesiaKey: (owner) => ownKeys.secret(owner, "cartesia"),
    deboCartesiaKey: options.deboKey,
    fetchImpl: cartesia.fetcher,
    later: (work) => void pending.push(work),
    log: (entry) => logs.push(JSON.stringify(entry)),
  });
  const api = new Hono<{ Variables: { owner: string } }>();
  let owner = A;
  api.use("*", async (c, next) => {
    c.set("owner", owner);
    await next();
  });
  api.onError((error, c) =>
    error instanceof AppError ? c.json({ error: error.message }, error.status) : c.json({ error: error.message }, 500),
  );
  api.route("/api/custom-people", voiceCopyRoutes(service));
  const call = async (path: string, body?: unknown, method = body === undefined ? "GET" : "POST") => {
    const response = await api.request(path, {
      method,
      ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
    });
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  };
  const settle = async () => {
    while (pending.length) await pending.shift();
  };
  return { db, store, cartesia, ownKeys, service, api, call, settle, logs, diarizer, as: (id: string) => (owner = id) };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;

/** Upload a file as the app would, and wait for the voices to be separated. */
async function upload(f: Fixture, bytes: Uint8Array, mimeType = "audio/wav") {
  const started = await f.call(`/api/custom-people/${ASHA}/audio`, { consent: true, mimeType, sizeBytes: bytes.byteLength, kind: "call" });
  assert.equal(started.status, 201, JSON.stringify(started.body));
  const id = String(started.body.uploadId);
  const ext = mimeType === "audio/wav" ? "wav" : mimeType === "audio/mp4" ? "m4a" : "ogg";
  const key = `persona-uploads/${A}/${id}.${ext}`;
  f.store.put(key, bytes);
  const done = await f.call(`/api/custom-people/${ASHA}/audio/${id}/complete`, {});
  assert.equal(done.status, 200, JSON.stringify(done.body));
  await f.settle();
  return { id, key };
}

const callWav = () => writeWav({ sampleRate: 8000, samples: tone(40) });

const spoken = async (db: Store) =>
  ((await db.get<{ lines: { text: string }[] }>(A, "custom-people-spoken", ASHA))?.lines ?? []).map((l) => l.text);

test("upload needs the consent tick, and the tick is saved with its words", async () => {
  const f = await fixture();
  const refused = await f.call(`/api/custom-people/${ASHA}/audio`, { mimeType: "audio/wav", sizeBytes: 10 });
  assert.equal(refused.status, 422);
  assert.match(String(refused.body.error), /Tick the box/);
  const ok = await f.call(`/api/custom-people/${ASHA}/audio`, { consent: true, mimeType: "audio/wav", sizeBytes: 10 });
  assert.equal(ok.status, 201);
  const consents = await f.db.list<{ kind: string; wording: string; personId: string }>(A, "voice-consents");
  assert.equal(consents.length, 1);
  assert.equal(consents[0]?.kind, "audio");
  assert.equal(consents[0]?.personId, ASHA);
  assert.match(consents[0]?.wording ?? "", /allowed to use these recordings/);
  const bad = await f.call(`/api/custom-people/${ASHA}/audio`, { consent: true, mimeType: "text/plain", sizeBytes: 10 });
  assert.equal(bad.status, 422);
});

test("voices are separated, labelled, and only the chosen person's scrubbed lines are kept; the recording goes", async () => {
  const f = await fixture();
  const { id, key } = await upload(f, callWav());
  const status = await f.call(`/api/custom-people/${ASHA}/audio/${id}`);
  assert.equal(status.body.status, "ready");
  assert.equal(status.body.canCopyVoice, true);
  const speakers = status.body.speakers as { speaker: string; sampleLines: string[]; samples: unknown[] }[];
  assert.deepEqual(
    speakers.map((s) => s.speaker),
    ["0", "1", "2"],
  );
  assert.ok(!JSON.stringify(speakers).includes("98765"), "sample lines are scrubbed too");
  assert.match(String(status.body.sampleUrl), /^http:\/\/localhost:8787\/api\/dev-r2\//);

  const labelled = await f.call(`/api/custom-people/${ASHA}/audio/${id}/labels`, { labels: { "0": "them", "1": "me", "2": "other" } });
  assert.equal(labelled.status, 200, JSON.stringify(labelled.body));
  assert.equal(labelled.body.keptLines, 3);
  assert.equal(labelled.body.discardedVoices, 2);
  const lines = await spoken(f.db);
  assert.deepEqual(lines, ["Beta, khana kha liya?", "Mera number hai [phone], yaad rakhna.", "Chalo, apna dhyan rakhna."]);
  assert.ok(!lines.join(" ").includes("MY OWN WORDS") && !lines.join(" ").includes("SOMEONE ELSE"));

  // The recording and every voice's words are gone.
  assert.ok(!f.store.objects.has(key));
  assert.equal(await f.db.get(A, "voice-uploads", id), null);
  assert.equal((await f.call(`/api/custom-people/${ASHA}/audio/${id}`)).status, 404);
  for (const line of f.logs) assert.ok(!/khana|Asha|98765/i.test(line), "logs carry ids and counts only");
});

test("a failed separation deletes the recording at once and says what to do", async () => {
  const f = await fixture({
    diarize: () => {
      throw new DiarizeError("busy", true);
    },
  });
  const { id, key } = await upload(f, callWav());
  assert.ok(!f.store.objects.has(key), "deleted on failure");
  const status = await f.call(`/api/custom-people/${ASHA}/audio/${id}`);
  assert.equal(status.body.status, "failed");
  assert.match(String(status.body.message), /did not answer/);

  const unreadable = await fixture({ audioFails: true });
  const second = await upload(unreadable, callWav());
  assert.ok(!unreadable.store.objects.has(second.key));
  assert.match(String((await unreadable.call(`/api/custom-people/${ASHA}/audio/${second.id}`)).body.message), /couldn't hear/);
  assert.ok(new AudioError("x") instanceof Error);
});

test("a voice copy cuts their stretches into one WAV clip and makes a private voice at Cartesia", async () => {
  const f = await fixture({ ownKey: true });
  const { id, key } = await upload(f, callWav());
  const result = await f.call(`/api/custom-people/${ASHA}/audio/${id}/labels`, {
    labels: { "0": "them", "1": "me", "2": "other" },
    copyVoice: { consent: true },
  });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal((result.body.voiceCopy as { status: string }).status, "copied");

  const clone = f.cartesia.calls.find((c) => c.url === "https://api.cartesia.ai/voices/clone");
  assert.ok(clone?.form);
  assert.equal(clone.method, "POST");
  assert.equal(clone.auth, `Bearer ${CARTESIA_KEY}`);
  assert.equal(clone.version, "2026-08-14");
  assert.equal(clone.form.get("language"), "hi", "from the recording's language");
  assert.equal(clone.form.get("access"), "private");
  assert.doesNotMatch(String(clone.form.get("name")), /Asha/, "the person's name never goes to Cartesia");
  const clip = clone.form.get("clip");
  assert.ok(clip instanceof Blob);
  assert.equal(clip.type, "audio/wav");
  const wav = readWav(new Uint8Array(await clip.arrayBuffer()));
  const seconds = wav.samples.length / wav.sampleRate;
  assert.ok(seconds >= 10 && seconds <= 30.5, `clip is ${seconds} s`);
  assert.ok(seconds < 20.5, "only Asha's 0 to 20 s were used, not the other voices");

  const record = await f.db.get<{ cartesiaVoiceId: string; keySource: string }>(A, "voice-clones", ASHA);
  assert.equal(record?.cartesiaVoiceId, "voice-1");
  assert.equal(record?.keySource, "own");
  const consents = await f.db.list<{ kind: string }>(A, "voice-consents");
  assert.ok(consents.some((c) => c.kind === "voice-copy"), "the second tick is saved too");
  assert.ok(!f.store.objects.has(key), "deleted on success");

  const state = await f.call(`/api/custom-people/${ASHA}/voice`);
  assert.equal(state.body.copied, true);
  assert.equal(state.body.key, "own");
  assert.ok(!JSON.stringify(state.body).includes(CARTESIA_KEY) && !JSON.stringify(state.body).includes("voice-1"));
});

test("with no Cartesia key, the voice copy says so plainly and their words are still kept", async () => {
  const f = await fixture();
  const state = await f.call(`/api/custom-people/${ASHA}/voice`);
  assert.equal(state.body.key, "none");
  assert.equal(state.body.message, NEEDS_KEY);
  const { id, key } = await upload(f, callWav());
  const result = await f.call(`/api/custom-people/${ASHA}/audio/${id}/labels`, { labels: { "0": "them" }, copyVoice: { consent: true } });
  assert.deepEqual(result.body.voiceCopy, { status: "needs-key", message: NEEDS_KEY });
  assert.equal(result.body.keptLines, 3);
  assert.equal(f.cartesia.calls.length, 0, "Cartesia is never asked");
  assert.ok(!f.store.objects.has(key));

  // Debo's own key (CARTESIA_API_KEY) is used when the person has none.
  const withDebo = await fixture({ deboKey: DEBO_KEY });
  const second = await upload(withDebo, callWav());
  await withDebo.call(`/api/custom-people/${ASHA}/audio/${second.id}/labels`, { labels: { "0": "them" }, copyVoice: { consent: true } });
  assert.equal(withDebo.cartesia.calls[0]?.auth, `Bearer ${DEBO_KEY}`);
  assert.equal((await withDebo.db.get<{ keySource: string }>(A, "voice-clones", ASHA))?.keySource, "debo");
});

test("the voice copy needs its own consent tick, and a format that can't be cut says so", async () => {
  const f = await fixture({ ownKey: true });
  const { id } = await upload(f, callWav());
  const noTick = await f.call(`/api/custom-people/${ASHA}/audio/${id}/labels`, { labels: { "0": "them" }, copyVoice: {} });
  assert.equal(noTick.status, 422);
  assert.match(String(noTick.body.error), /permission/);

  const m4a = await upload(f, new Uint8Array(1000), "audio/mp4");
  assert.equal((await f.call(`/api/custom-people/${ASHA}/audio/${m4a.id}`)).body.canCopyVoice, false);
  const result = await f.call(`/api/custom-people/${ASHA}/audio/${m4a.id}/labels`, { labels: { "0": "them" }, copyVoice: { consent: true } });
  assert.deepEqual(result.body.voiceCopy, { status: "cant-cut", message: CANT_CUT });
  assert.equal(result.body.keptLines, 3, "the words are still used");
  assert.ok(!f.store.objects.has(m4a.key));
});

test("when Cartesia fails, the recording is still deleted and the words are still kept", async () => {
  const f = await fixture({ ownKey: true, cloneStatus: 503 });
  const { id, key } = await upload(f, callWav());
  const result = await f.call(`/api/custom-people/${ASHA}/audio/${id}/labels`, { labels: { "0": "them" }, copyVoice: { consent: true } });
  assert.equal((result.body.voiceCopy as { status: string }).status, "failed");
  assert.match(String((result.body.voiceCopy as { message: string }).message), /busy/);
  assert.equal(await f.db.get(A, "voice-clones", ASHA), null);
  assert.ok(!f.store.objects.has(key));
  assert.equal((await spoken(f.db)).length, 3);
});

test("removing the voice copy, or deleting the person, deletes it at Cartesia", async () => {
  const f = await fixture({ ownKey: true });
  const { id } = await upload(f, callWav());
  await f.call(`/api/custom-people/${ASHA}/audio/${id}/labels`, { labels: { "0": "them" }, copyVoice: { consent: true } });
  const removed = await f.call(`/api/custom-people/${ASHA}/voice`, undefined, "DELETE");
  assert.deepEqual(removed.body, { removed: true });
  const del = f.cartesia.calls.find((c) => c.method === "DELETE");
  assert.equal(del?.url, "https://api.cartesia.ai/voices/voice-1");
  assert.equal(del?.auth, `Bearer ${CARTESIA_KEY}`);
  assert.equal(await f.db.get(A, "voice-clones", ASHA), null);

  // Again, then the person is deleted: the copy, the kept lines and the consent ticks go.
  const second = await upload(f, callWav());
  await f.call(`/api/custom-people/${ASHA}/audio/${second.id}/labels`, { labels: { "0": "them" }, copyVoice: { consent: true } });
  await f.service.deleteForPerson(A, ASHA);
  assert.equal(f.cartesia.calls.filter((c) => c.method === "DELETE").at(-1)?.url, "https://api.cartesia.ai/voices/voice-2");
  assert.equal(await f.db.get(A, "voice-clones", ASHA), null);
  assert.deepEqual(await spoken(f.db), []);
  assert.deepEqual(await f.db.list(A, "voice-consents"), []);
});

test("deleting the account deletes voice copies at Cartesia before the person's own key is removed", async () => {
  const f = await fixture({ ownKey: true });
  const { id } = await upload(f, callWav());
  await f.call(`/api/custom-people/${ASHA}/audio/${id}/labels`, { labels: { "0": "them" }, copyVoice: { consent: true } });
  // A recording still waiting to be labelled, and a stray file in the temporary folder.
  const waiting = await upload(f, callWav());
  f.store.put(`persona-uploads/${A}/stray.ogg`, new Uint8Array(3));
  f.store.put(`${B}/keep.ogg`, new Uint8Array(3));

  const config = { mode: "sample", dataDir: "/tmp" } as unknown as Config;
  const files = { removeAll: async () => 0 } as unknown as Files;
  const app = new Hono<{ Variables: { owner: string } }>();
  app.use("*", async (c, next) => {
    c.set("owner", A);
    await next();
  });
  app.route("/api/account", accountRoutes(f.db, files, undefined, undefined, undefined, f.ownKeys, undefined, f.service));
  const response = await app.request("/api/account", { method: "DELETE", body: JSON.stringify({ confirm: true }) });
  assert.equal(response.status, 200);
  const body = (await response.json()) as { voiceCopiesRemoved: number; note?: string };
  assert.equal(body.voiceCopiesRemoved, 1);
  assert.equal(body.note, undefined);
  const del = f.cartesia.calls.find((c) => c.method === "DELETE");
  assert.equal(del?.auth, `Bearer ${CARTESIA_KEY}`, "the own key was still there to delete it");
  assert.ok(!f.store.objects.has(waiting.key));
  assert.ok(!f.store.objects.has(`persona-uploads/${A}/stray.ogg`));
  assert.ok(f.store.objects.has(`${B}/keep.ogg`), "nobody else's files");
  assert.equal(await f.ownKeys.secret(A, "cartesia"), undefined);
  void config;
});

test("nobody reaches another person's recordings, voice copy or custom people", async () => {
  const f = await fixture({ ownKey: true });
  const { id, key } = await upload(f, callWav());
  f.as(B);
  assert.equal((await f.call(`/api/custom-people/${ASHA}/audio/${id}`)).status, 404);
  assert.equal((await f.call(`/api/custom-people/${ASHA}/audio/${id}/labels`, { labels: { "0": "them" } })).status, 404);
  assert.equal((await f.call(`/api/custom-people/${ASHA}/audio/${id}`, undefined, "DELETE")).status, 404);
  assert.equal((await f.call(`/api/custom-people/${ASHA}/voice`)).status, 404);
  assert.equal((await f.call(`/api/custom-people/${ASHA}/audio`, { consent: true, mimeType: "audio/wav", sizeBytes: 9 })).status, 404);
  assert.ok(f.store.objects.has(key), "still there for its owner");
  f.as(A);
  assert.equal((await f.call(`/api/custom-people/${ASHA}/audio/${id}`)).status, 200);
});

test("the sweep deletes recordings left for more than 24 hours", async () => {
  const f = await fixture();
  const { id, key } = await upload(f, callWav());
  const record = await f.db.get<Record<string, unknown>>(A, "voice-uploads", id);
  await f.db.put(A, "voice-uploads", { ...record, id, createdAt: new Date(Date.now() - RAW_AUDIO_TTL_MS - 60_000).toISOString() });
  const fresh = await upload(f, callWav());
  assert.equal(await f.service.sweep(), 1);
  assert.ok(!f.store.objects.has(key));
  assert.equal(await f.db.get(A, "voice-uploads", id), null);
  assert.ok(f.store.objects.has(fresh.key), "a fresh one stays");
});

test("the voice agent gets a voice copy only for the custom person being talked as, and only with its secret", async () => {
  const f = await fixture({ ownKey: true });
  const { id } = await upload(f, callWav());
  await f.call(`/api/custom-people/${ASHA}/audio/${id}/labels`, { labels: { "0": "them" }, copyVoice: { consent: true } });
  const secret = "s".repeat(40);
  const env = () => ({ LIVEKIT_URL: "wss://x", LIVEKIT_API_KEY: "k", LIVEKIT_API_SECRET: "s", VOICE_AGENT_SECRET: secret });
  const brain = { async *answer() {} };
  const app = new Hono();
  app.onError((error, c) => (error instanceof AppError ? c.json({ error: error.message }, error.status) : c.json({}, 500)));
  app.route("/api/voice", voiceAgentRoutes(brain, env, undefined, (owner) => f.service.callVoice(owner)));
  const ask = (auth: string) =>
    app.request("/api/voice/session", { method: "POST", headers: { authorization: auth }, body: JSON.stringify({ userId: A }) });

  assert.equal((await ask("Bearer wrong")).status, 401);
  assert.deepEqual(await (await ask(`Bearer ${secret}`)).json(), { voiceCopy: null }, "no custom person is active");

  await f.db.put(A, "persona", { id: "current", role: "Asha", notes: "", customPersonId: ASHA, updatedAt: "" });
  const body = (await (await ask(`Bearer ${secret}`)).json()) as { voiceCopy: Record<string, string> };
  assert.equal(body.voiceCopy.voiceId, "voice-1");
  assert.equal(body.voiceCopy.apiKey, CARTESIA_KEY);
  assert.equal(body.voiceCopy.language, "hi");
  assert.match(body.voiceCopy.opening, /AI version of Asha/);

  // Another person talking as their own role never gets Asha's voice.
  await f.db.put(B, "persona", { id: "current", role: "x", notes: "", customPersonId: ASHA, updatedAt: "" });
  assert.equal(await f.service.callVoice(B), null);
});

test("a Cartesia key is checked with one cheap read before it is saved", async () => {
  const f = await fixture();
  await assert.rejects(f.ownKeys.save(A, "cartesia", { key: "sk_car_WRONGabcdefghijklmnop" }), /Cartesia did not accept/);
  await assert.rejects(f.ownKeys.save(A, "cartesia", { key: CARTESIA_KEY, model: "x" }), /no model/);
  const row = await f.ownKeys.save(A, "cartesia", { key: CARTESIA_KEY });
  assert.equal(row.endsIn, "1234");
  const check = f.cartesia.calls.at(-1);
  assert.equal(check?.url, "https://api.cartesia.ai/voices?limit=1");
  assert.equal(check?.version, "2026-08-14");
});
