// Recordings through Cloudflare bindings (no R2 keys, no API token): the Worker's
// media.internal and ai.internal handlers, and the server's "binding" storage and
// speech engine, wired together with fakes. See docs/JOURNAL-MEDIA.md.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import {
  type AiLike,
  handleAi,
  handleMedia,
  keyFromPath,
  parseRange,
  type R2BucketLike,
  type R2ObjectBodyLike,
} from "../infra/cloudflare/api/src/media.ts";
import { fakeAudioTools } from "../apps/server/src/debo/audio.ts";
import { BLOB_PATH, bindingStore, readGrant, signGrant } from "../apps/server/src/debo/binding-store.ts";
import { devMemoryBackend } from "../apps/server/src/debo/dev-backend.ts";
import { DeboService, deboRoutes, mediaFromEnv } from "../apps/server/src/debo/index.ts";
import { bindingWhisper } from "../apps/server/src/debo/transcriber.ts";
import { ALICE, BOB } from "./helpers/debo.ts";

// ---- A bucket and an AI binding in memory, shaped like Cloudflare's ----

function fakeBucket() {
  const objects = new Map<string, { bytes: Uint8Array; contentType?: string }>();
  const uploads = new Map<string, Map<number, Uint8Array>>();
  const stats = { putsWithStream: 0, partsWithStream: 0 };
  const read = async (value: ReadableStream<Uint8Array> | ArrayBuffer, counter: "putsWithStream" | "partsWithStream") => {
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    stats[counter] += 1;
    return new Uint8Array(await new Response(value).arrayBuffer());
  };
  const bucket: R2BucketLike = {
    async put(key, value, options) {
      objects.set(key, { bytes: await read(value, "putsWithStream"), contentType: options?.httpMetadata?.contentType });
      return { size: objects.get(key)!.bytes.length, etag: "e" };
    },
    async get(key, options) {
      const o = objects.get(key);
      if (!o) return null;
      let bytes = o.bytes;
      let range: R2ObjectBodyLike["range"];
      const r = options?.range;
      if (r) {
        if ("suffix" in r) range = { offset: Math.max(0, bytes.length - r.suffix), length: Math.min(r.suffix, bytes.length) };
        else {
          const offset = r.offset;
          const length = Math.max(0, Math.min(r.length ?? bytes.length - offset, bytes.length - offset));
          range = { offset, length };
        }
        bytes = bytes.slice(range.offset, (range.offset ?? 0) + (range.length ?? 0));
      }
      return {
        size: o.bytes.length,
        etag: "etag1",
        httpMetadata: { contentType: o.contentType },
        range,
        body: new Response(new Blob([bytes as Uint8Array<ArrayBuffer>])).body as ReadableStream<Uint8Array>,
      };
    },
    async head(key) {
      const o = objects.get(key);
      return o ? { size: o.bytes.length, etag: "etag1" } : null;
    },
    async delete(keys) {
      for (const k of Array.isArray(keys) ? keys : [keys]) objects.delete(k);
    },
    async list({ prefix = "", limit = 1000 } = {}) {
      const keys = [...objects.keys()].filter((k) => k.startsWith(prefix));
      return { objects: keys.slice(0, limit).map((key) => ({ key })), truncated: keys.length > limit };
    },
    async createMultipartUpload() {
      const uploadId = `up-${uploads.size + 1}`;
      uploads.set(uploadId, new Map());
      return { uploadId };
    },
    resumeMultipartUpload(key, uploadId) {
      return {
        async uploadPart(n, value) {
          const held = uploads.get(uploadId);
          if (!held) throw new Error("no such upload");
          held.set(n, await read(value, "partsWithStream"));
          return { partNumber: n, etag: `part${n}` };
        },
        async complete(parts) {
          const held = uploads.get(uploadId);
          if (!held) throw new Error("no such upload");
          const chunks = parts.map((p) => {
            if (p.etag !== `part${p.partNumber}` || !held.get(p.partNumber)) throw new Error("bad part");
            return held.get(p.partNumber)!;
          });
          const bytes = Buffer.concat(chunks);
          objects.set(key, { bytes });
          uploads.delete(uploadId);
          return { size: bytes.length, etag: "joined" };
        },
        async abort() {
          uploads.delete(uploadId);
        },
      };
    },
  };
  return { bucket, objects, uploads, stats };
}

function fakeAi(): AiLike & { calls: Record<string, unknown>[] } {
  const calls: Record<string, unknown>[] = [];
  return {
    calls,
    async run(_model, input) {
      calls.push(input);
      return {
        text: " We planted a lemon tree. ",
        transcription_info: { language: "en" },
        segments: [{ start: 0, end: 3, text: " We planted a lemon tree. " }],
      };
    },
  };
}

/** Stands in for the Worker: sends the container's calls to the handlers. */
function workerFetch(bucket: R2BucketLike, ai: AiLike): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input as string, init);
    const host = new URL(request.url).host;
    if (host === "media.internal") return handleMedia(request, bucket);
    if (host === "ai.internal") return handleAi(request, ai);
    return new Response("blocked", { status: 502 });
  }) as typeof fetch;
}

const SECRET = "test-signing-key-test-signing-key";
const PUBLIC = "https://api.daksha.life";

function rig(options: { singleMaxBytes?: number; partBytes?: number } = {}) {
  const bucketRig = fakeBucket();
  const ai = fakeAi();
  const fetchImpl = workerFetch(bucketRig.bucket, ai);
  const store = bindingStore({ mediaUrl: "http://media.internal", publicUrl: PUBLIC, secret: SECRET, fetchImpl });
  const backend = devMemoryBackend();
  const debo = new DeboService(backend, [], {
    store,
    audio: fakeAudioTools({ durationSeconds: 12 }),
    transcriber: bindingWhisper("http://ai.internal", fetchImpl),
    singleMaxBytes: options.singleMaxBytes ?? 1000,
    partBytes: options.partBytes ?? 600,
  });
  const api = new Hono<{ Variables: { owner: string } }>();
  api.use("*", async (c, next) => {
    c.set("owner", c.req.header("x-owner") ?? ALICE);
    await next();
  });
  api.route("/api/debo", deboRoutes(debo));
  api.route(BLOB_PATH, store.routes());
  return { ...bucketRig, ai, store, debo, api, fetchImpl };
}

const sample = (n = 400, seed = 1) => Uint8Array.from({ length: n }, (_, i) => (i * 7 + seed) % 251);
const tokenPath = (url: string) => new URL(url).pathname;
const put = (r: ReturnType<typeof rig>, url: string, bytes: Uint8Array, headers: Record<string, string> = {}) =>
  r.api.request(tokenPath(url), {
    method: "PUT",
    body: Buffer.from(bytes),
    headers: { "Content-Length": String(bytes.length), ...headers },
  });

async function add(r: ReturnType<typeof rig>, owner: string, bytes: Uint8Array) {
  const started = await r.debo.startUpload(owner, { kind: "voice", mimeType: "audio/webm;codecs=opus", sizeBytes: bytes.length, durationMs: 12_000 });
  let parts: { number: number; etag: string }[] | undefined;
  if (started.upload.mode === "single") {
    assert.equal((await put(r, started.upload.url, bytes)).status, 200);
  } else {
    parts = [];
    for (const part of started.upload.parts) {
      const from = (part.number - 1) * started.upload.partBytes;
      const res = await put(r, part.url, bytes.slice(from, from + started.upload.partBytes));
      assert.equal(res.status, 200);
      parts.push({ number: part.number, etag: res.headers.get("etag") ?? "" });
    }
  }
  return { started, entry: await r.debo.completeUpload(owner, started.mediaId, { parts }) };
}

test("a small recording goes up in one request, is stored under the owner's folder, and is written out through the AI binding", async () => {
  const r = rig();
  const bytes = sample(400);
  const { entry } = await add(r, ALICE, bytes);
  const [key] = [...r.objects.keys()];
  assert.match(key ?? "", new RegExp(`^${ALICE}/[0-9a-f-]{36}\\.webm$`));
  assert.equal(r.objects.get(key!)?.contentType, "audio/webm");
  assert.equal(r.stats.putsWithStream, 1, "the body is streamed to R2, not buffered");
  await r.debo.idle();
  const t = await r.debo.transcript(ALICE, entry.id);
  assert.equal(t.status, "ready");
  assert.equal(t.text, "We planted a lemon tree.");
  assert.equal(t.language, "en");
  // The same inputs the REST path sends.
  assert.equal(r.ai.calls.length, 1);
  assert.equal(r.ai.calls[0]?.task, "transcribe");
  assert.equal(r.ai.calls[0]?.vad_filter, true);
  assert.equal(typeof r.ai.calls[0]?.audio, "string");
});

test("a big recording goes up in equal parts, is joined, and plays with Range requests", async () => {
  const r = rig();
  const bytes = sample(1500, 3);
  const { started, entry } = await add(r, ALICE, bytes);
  assert.equal(started.upload.mode, "multipart");
  assert.equal(r.stats.partsWithStream, 3);
  assert.equal(r.uploads.size, 0, "joined, nothing left open");
  assert.equal(r.objects.size, 1);
  await r.debo.idle();

  const play = await r.api.request(`/api/debo/entries/${entry.id}/playback`);
  const { url, mimeType } = (await play.json()) as { url: string; mimeType: string };
  assert.equal(mimeType, "audio/webm");
  assert.ok(url.startsWith(`${PUBLIC}${BLOB_PATH}/`));

  const whole = await r.api.request(tokenPath(url));
  assert.equal(whole.status, 200);
  assert.equal(whole.headers.get("accept-ranges"), "bytes");
  assert.equal(whole.headers.get("content-type"), "audio/webm");
  assert.deepEqual(new Uint8Array(await whole.arrayBuffer()), bytes);

  const slice = await r.api.request(tokenPath(url), { headers: { Range: "bytes=100-199" } });
  assert.equal(slice.status, 206);
  assert.equal(slice.headers.get("content-range"), "bytes 100-199/1500");
  assert.deepEqual(new Uint8Array(await slice.arrayBuffer()), bytes.slice(100, 200));

  const open = await r.api.request(tokenPath(url), { headers: { Range: "bytes=1400-" } });
  assert.equal(open.status, 206);
  assert.equal(open.headers.get("content-range"), "bytes 1400-1499/1500");

  const tail = await r.api.request(tokenPath(url), { headers: { Range: "bytes=-50" } });
  assert.equal(tail.headers.get("content-range"), "bytes 1450-1499/1500");

  const past = await r.api.request(tokenPath(url), { headers: { Range: "bytes=5000-" } });
  assert.equal(past.status, 416);

  const head = await r.api.request(tokenPath(url), { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(head.headers.get("content-length"), "1500");
});

test("a missing part stops the join, and the entry is not made", async () => {
  const r = rig();
  const bytes = sample(1500);
  const started = await r.debo.startUpload(ALICE, { kind: "voice", mimeType: "audio/mp4", sizeBytes: bytes.length });
  assert.equal(started.upload.mode, "multipart");
  if (started.upload.mode !== "multipart") return;
  const first = await put(r, started.upload.parts[0]!.url, bytes.slice(0, 600));
  await assert.rejects(
    r.debo.completeUpload(ALICE, started.mediaId, { parts: [{ number: 1, etag: first.headers.get("etag") ?? "" }] }),
    /not complete/,
  );
});

test("deleting an entry removes the object; deleting the account removes the whole folder", async () => {
  const r = rig();
  const a = await add(r, ALICE, sample(400, 1));
  await add(r, ALICE, sample(1500, 2));
  await add(r, BOB, sample(400, 3));
  assert.equal(r.objects.size, 3);
  await r.debo.idle();
  await r.debo.deleteEntry(ALICE, a.entry.id);
  assert.equal(r.objects.size, 2);
  await r.debo.deleteMine(ALICE);
  assert.deepEqual([...r.objects.keys()].map((k) => k.split("/")[0]), [BOB]);
});

test("an unfinished multipart upload is aborted when it is cleaned up", async () => {
  const r = rig();
  const started = await r.debo.startUpload(ALICE, { kind: "voice", mimeType: "audio/mp4", sizeBytes: 1500 });
  assert.equal(r.uploads.size, 1);
  if (started.upload.mode === "multipart") await r.store.abortUpload(`${ALICE}/x.m4a`, started.upload.uploadId);
  assert.equal(r.uploads.size, 0);
});

test("another person gets nothing: not the playback link, not the transcript, not a link made for someone else", async () => {
  const r = rig();
  const { entry } = await add(r, ALICE, sample(400));
  await r.debo.idle();
  const id = entry.id;
  assert.equal((await r.api.request(`/api/debo/entries/${id}/playback`, { headers: { "x-owner": BOB } })).status, 404);
  assert.equal((await r.api.request(`/api/debo/entries/${id}/transcript`, { headers: { "x-owner": BOB } })).status, 404);
  // Bob cannot reach Alice's object by making his own token: he has no signing key.
  const forged = `${signGrant("another-key-another-key-another-1", { op: "get", key: [...r.objects.keys()][0]!, exp: Date.now() + 60_000 })}`;
  assert.equal((await r.api.request(`${BLOB_PATH}/${forged}`)).status, 403);
});

test("links: expired, damaged, wrong kind, wrong size and missing size are all refused", async () => {
  const r = rig();
  const started = await r.debo.startUpload(ALICE, { kind: "voice", mimeType: "audio/mp4", sizeBytes: 400 });
  assert.equal(started.upload.mode, "single");
  if (started.upload.mode !== "single") return;
  const url = started.upload.url;
  // wrong size
  assert.equal((await put(r, url, sample(401))).status, 403);
  assert.equal((await put(r, url, sample(399))).status, 403);
  // no size (chunked)
  const noLength = await r.api.request(tokenPath(url), { method: "PUT", body: Buffer.from(sample(400)) });
  assert.equal(noLength.status, 411);
  // a put link cannot read
  assert.equal((await r.api.request(tokenPath(url))).status, 403);
  // damaged
  assert.equal((await put(r, `${url}x`, sample(400))).status, 403);
  // expired
  const key = `${ALICE}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webm`;
  const old = signGrant(SECRET, { op: "put", key, size: 400, exp: Date.now() - 1 });
  assert.equal(readGrant(SECRET, old), null);
  assert.equal((await put(r, `${PUBLIC}${BLOB_PATH}/${old}`, sample(400))).status, 403);
  // nothing reached the bucket
  assert.equal(r.objects.size, 0);
  // the right size works
  assert.equal((await put(r, url, sample(400))).status, 200);
  assert.equal(r.objects.size, 1);
});

test("recording limits still apply: size, type and the daily count", async () => {
  const r = rig();
  await assert.rejects(r.debo.startUpload(ALICE, { kind: "voice", mimeType: "audio/mp4", sizeBytes: 201 * 1024 * 1024 }), /too big/);
  await assert.rejects(r.debo.startUpload(ALICE, { kind: "voice", mimeType: "application/pdf", sizeBytes: 100 }), /can't use/);
  await assert.rejects(r.debo.startUpload(ALICE, { kind: "voice", mimeType: "audio/mp4", sizeBytes: 100, durationMs: 61 * 60_000 }), /too long/);
  for (let i = 0; i < 40; i++) await r.debo.startUpload(ALICE, { kind: "voice", mimeType: "audio/mp4", sizeBytes: 100 });
  await assert.rejects(r.debo.startUpload(ALICE, { kind: "voice", mimeType: "audio/mp4", sizeBytes: 100 }), /lot of recordings/);
});

test("a part is sized for every hop: 8 MiB parts in binding mode, 200 MB in at most 25 parts", () => {
  const deps = mediaFromEnv(
    { MEDIA_BACKEND: "binding", MEDIA_BINDING_URL: "http://media.internal", SESSION_SIGNING_KEY: SECRET, AI_BACKEND: "binding", AI_BINDING_URL: "http://ai.internal" },
    PUBLIC,
  );
  assert.ok(deps);
  assert.equal(deps.partBytes, 8 * 1024 * 1024);
  assert.ok(deps.partBytes! >= 5 * 1024 * 1024, "R2 needs 5 MiB parts except the last");
  assert.ok(deps.partBytes! < 12 * 1024 * 1024, "under the server's general body limit");
  assert.equal(Math.ceil((200 * 1024 * 1024) / deps.partBytes!), 25);
  assert.equal(deps.transcriber?.name.includes("Workers AI"), true);
});

test("which mode is chosen from the environment", () => {
  const r2 = { R2_ACCOUNT_ID: "a", R2_ACCESS_KEY_ID: "k", R2_SECRET_ACCESS_KEY: "s" };
  assert.equal(mediaFromEnv({}, PUBLIC), undefined);
  // Binding flag but no signing key or address: off, not half on.
  assert.equal(mediaFromEnv({ MEDIA_BACKEND: "binding", MEDIA_BINDING_URL: "http://media.internal" }, PUBLIC), undefined);
  // Keys present: presigned mode wins, and keeps the 16 MB parts.
  const presigned = mediaFromEnv({ ...r2, MEDIA_BACKEND: "binding", MEDIA_BINDING_URL: "http://media.internal", SESSION_SIGNING_KEY: SECRET }, PUBLIC);
  assert.equal(presigned?.partBytes, undefined);
  // Storage without speech: recordings are kept, nothing is written out.
  const noAi = mediaFromEnv({ MEDIA_BACKEND: "binding", MEDIA_BINDING_URL: "http://media.internal", SESSION_SIGNING_KEY: SECRET }, PUBLIC);
  assert.ok(noAi && !noAi.transcriber);
});

test("dictation works through the AI binding", async () => {
  const r = rig();
  const out = await r.debo.dictate(ALICE, sample(500), "en");
  assert.equal(out.text, "We planted a lemon tree.");
  assert.equal(r.ai.calls[0]?.language, "en");
});

// ---- The Worker's handlers on their own ----

const KEYED = `${ALICE}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.m4a`;

test("media.internal accepts only keys shaped like the API's, and nothing else", async () => {
  const { bucket, objects } = fakeBucket();
  const send = (path: string, init: RequestInit = {}) => handleMedia(new Request(`http://media.internal${path}`, init), bucket);
  assert.equal(keyFromPath(`/o/${KEYED}`, "o"), KEYED);
  for (const bad of ["/o/", "/o/x", "/o/a/b/c.m4a", `/o/${ALICE}/..%2Fx.m4a`, `/o/${ALICE}/id`, `/o/${ALICE}/id.M4A`, "/o/a%/b.m4a", `/o/${ALICE}/${"x".repeat(80)}.m4a`])
    assert.equal(await (async () => (await send(bad, { method: "GET" })).status)(), 400, bad);
  assert.equal((await send(`/m/x?uploads`, { method: "POST" })).status, 400);
  assert.equal((await send(`/p/${ALICE}`, { method: "DELETE" })).status, 400, "prefix must end with a slash");
  assert.equal((await send(`/p/${ALICE}/a`, { method: "DELETE" })).status, 400, "only an owner folder");
  assert.equal((await send("/o/../etc.m4a", { method: "GET" })).status, 404, "the URL is tidied before it gets here");
  assert.equal((await send(`/elsewhere`, { method: "GET" })).status, 404);
  assert.equal(objects.size, 0);
  const body = Buffer.from("hello");
  assert.equal((await send(`/o/${KEYED}`, { method: "PUT", body, headers: { "Content-Length": "5", "Content-Type": "audio/mp4" } })).status, 200);
  assert.equal(objects.get(KEYED)?.contentType, "audio/mp4");
  assert.equal((await send(`/o/${KEYED}`, { method: "POST" })).status, 405);
  assert.equal((await send(`/o/${KEYED}`, { method: "PUT", body: Buffer.alloc(0), headers: { "Content-Length": "0" } })).status, 400);
  assert.equal((await send(`/o/${KEYED}`, { method: "GET", headers: { Range: "bytes=zz" } })).status, 416);
  assert.equal((await send(`/o/${KEYED}`, { method: "HEAD" })).headers.get("content-length"), "5");
  assert.equal((await send(`/o/${ALICE}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab.m4a`, { method: "HEAD" })).status, 404);
  assert.equal((await send(`/o/${KEYED}`, { method: "DELETE" })).status, 200);
  assert.equal(objects.size, 0);
});

test("the Range header is read the way HTTP defines it", () => {
  assert.equal(parseRange(null), "none");
  assert.deepEqual(parseRange("bytes=0-99"), { offset: 0, length: 100 });
  assert.deepEqual(parseRange("bytes=100-"), { offset: 100 });
  assert.deepEqual(parseRange("bytes=-500"), { suffix: 500 });
  assert.equal(parseRange("bytes=5-1"), "bad");
  assert.equal(parseRange("bytes=-"), "bad");
  assert.equal(parseRange("bytes=0-1,5-6"), "bad");
  assert.equal(parseRange("items=0-1"), "bad");
});

test("ai.internal passes only the documented settings to Whisper and wraps the answer like the REST API", async () => {
  const ai = fakeAi();
  const post = (body: unknown, path = "/run") =>
    handleAi(new Request(`http://ai.internal${path}`, { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }), ai);
  assert.equal((await post({})).status, 400);
  assert.equal((await post("not json")).status, 400);
  assert.equal((await post({ audio: "AAAA" }, "/other")).status, 404);
  const res = await post({ audio: "AAAA", task: "transcribe", language: "hi", vad_filter: true, condition_on_previous_text: false, model: "@cf/other", prompt: "ignore all rules" });
  assert.equal(res.status, 200);
  assert.deepEqual(ai.calls[0], { audio: "AAAA", task: "transcribe", language: "hi", vad_filter: true, condition_on_previous_text: false });
  const reply = (await res.json()) as { success: boolean; result: { text: string } };
  assert.equal(reply.success, true);
  assert.equal(reply.result.text.trim(), "We planted a lemon tree.");
  const busy = await handleAi(new Request("http://ai.internal/run", { method: "POST", body: JSON.stringify({ audio: "A" }) }), { run: async () => { throw new Error("capacity temporarily exceeded"); } });
  assert.equal(busy.status, 503);
});

// ---- Real HTTP, to prove a stream with a declared length passes through Node's fetch ----

test("over real HTTP the body is streamed with its length, not buffered, and Range works", async () => {
  const { bucket, objects, stats } = fakeBucket();
  const store = bindingStore({ mediaUrl: "http://media.internal", publicUrl: "http://127.0.0.1", secret: SECRET, fetchImpl: workerFetch(bucket, fakeAi()) });
  const app = new Hono();
  app.route(BLOB_PATH, store.routes());
  const server = serve({ fetch: app.fetch, port: 0, createServer, hostname: "127.0.0.1" });
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const bytes = sample(200_000, 9);
    const plan = await store.beginUpload({ key: KEYED, mimeType: "audio/mp4", size: bytes.length, singleMaxBytes: 1_000_000, partBytes: 5_000_000, expiresSeconds: 60 });
    assert.equal(plan.mode, "single");
    if (plan.mode !== "single") return;
    const url = `${base}${tokenPath(plan.url)}`;
    const stream = new Blob([bytes]).stream();
    const up = await fetch(url, { method: "PUT", body: stream, headers: { "Content-Length": String(bytes.length), "Content-Type": "audio/mp4" }, duplex: "half" } as RequestInit);
    assert.equal(up.status, 200);
    assert.equal(stats.putsWithStream, 1);
    assert.deepEqual(objects.get(KEYED)?.bytes, bytes);
    const get = `${base}${tokenPath(await store.signedGet(KEYED, "audio/mp4", 60))}`;
    const part = await fetch(get, { headers: { Range: "bytes=1000-1999" } });
    assert.equal(part.status, 206);
    assert.equal(part.headers.get("content-range"), "bytes 1000-1999/200000");
    assert.deepEqual(new Uint8Array(await part.arrayBuffer()), bytes.slice(1000, 2000));
  } finally {
    server.close();
  }
});
