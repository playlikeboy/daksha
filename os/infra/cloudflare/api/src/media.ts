// Handlers for the two private hosts the API container can reach, so recordings
// need no access keys and no API tokens:
//
//   media.internal  the private R2 bucket, through a Worker binding
//   ai.internal     Workers AI (Whisper for recordings, FLUX for pictures), through a Worker binding
//
// Only the container's outbound traffic is routed here (see index.ts). Even so,
// every key is checked: it must look exactly like the keys the API makes
// (`<owner id>/<random id>.<ext>`), so nothing else in the bucket can be named.
//
// This file uses small local types instead of the Cloudflare globals, so the
// repo's tests can import it and run it against fakes in plain Node.

export type R2Range = { offset: number; length?: number } | { suffix: number };

export interface R2ObjectLike {
  size: number;
  etag: string;
  httpEtag?: string;
  httpMetadata?: { contentType?: string };
  range?: { offset?: number; length?: number; suffix?: number };
}
export interface R2ObjectBodyLike extends R2ObjectLike {
  body: ReadableStream<Uint8Array>;
}
export interface R2PartLike {
  partNumber: number;
  etag: string;
}
export interface R2MultipartLike {
  uploadPart(partNumber: number, value: ReadableStream<Uint8Array> | ArrayBuffer): Promise<R2PartLike>;
  complete(parts: R2PartLike[]): Promise<R2ObjectLike>;
  abort(): Promise<void>;
}
export interface R2BucketLike {
  put(
    key: string,
    value: ReadableStream<Uint8Array> | ArrayBuffer,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<R2ObjectLike>;
  get(key: string, options?: { range?: R2Range }): Promise<R2ObjectBodyLike | null>;
  head(key: string): Promise<R2ObjectLike | null>;
  delete(keys: string | string[]): Promise<void>;
  list(options?: { prefix?: string; limit?: number }): Promise<{ objects: { key: string }[]; truncated: boolean }>;
  createMultipartUpload(key: string, options?: { httpMetadata?: { contentType?: string } }): Promise<{ uploadId: string }>;
  resumeMultipartUpload(key: string, uploadId: string): R2MultipartLike;
}
export interface AiLike {
  run(model: string, input: Record<string, unknown>): Promise<unknown>;
}

export const MEDIA_HOST = "media.internal";
export const AI_HOST = "ai.internal";
export const WHISPER_MODEL = "@cf/openai/whisper-large-v3-turbo";
/** Text to picture: fast, square. https://developers.cloudflare.com/workers-ai/models/flux-1-schnell/ */
export const IMAGE_MODEL = "@cf/black-forest-labs/flux-1-schnell";

/** `<owner id>/<random id>.<ext>`: the only shape the API ever writes. */
const KEY = /^[A-Za-z0-9_-]{1,64}\/[A-Za-z0-9_-]{1,64}\.[a-z0-9]{1,8}$/;
const OWNER_PREFIX = /^[A-Za-z0-9_-]{1,64}\/$/;
const UPLOAD_ID = /^[A-Za-z0-9._~+/=-]{1,2048}$/;
const MIME = /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/;
/** The API never sends more than this in one request (200 MB recording). */
const MAX_OBJECT_BYTES = 200 * 1024 * 1024;
const MAX_PART_BYTES = 100 * 1024 * 1024;
const MAX_BUFFERED_BYTES = 16 * 1024 * 1024;
const MAX_PARTS = 10_000;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const refuse = (status: number, message: string) => json({ error: message }, status);

/** "bytes=0-99", "bytes=100-" and "bytes=-500". Anything else is not a range we serve. */
export function parseRange(header: string | null): R2Range | "none" | "bad" {
  if (!header) return "none";
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === "" && m[2] === "")) return "bad";
  if (m[1] === "") return { suffix: Number(m[2]) };
  const offset = Number(m[1]);
  if (m[2] === "") return { offset };
  const end = Number(m[2]);
  if (end < offset) return "bad";
  return { offset, length: end - offset + 1 };
}

/** The first and last byte a range answer covers, for Content-Range. */
function covered(object: R2ObjectLike, requested: R2Range): { start: number; end: number } {
  const r = object.range;
  if (r && typeof r.offset === "number" && typeof r.length === "number") return { start: r.offset, end: r.offset + r.length - 1 };
  if ("suffix" in requested) return { start: Math.max(0, object.size - requested.suffix), end: object.size - 1 };
  const end = requested.length === undefined ? object.size - 1 : Math.min(object.size - 1, requested.offset + requested.length - 1);
  return { start: requested.offset, end };
}

/** Pulls the key out of "/o/<owner>/<id>.<ext>". Null when it is not an allowed key. */
export function keyFromPath(path: string, kind: "o" | "m"): string | null {
  const lead = `/${kind}/`;
  if (!path.startsWith(lead)) return null;
  let key: string;
  try {
    key = path.slice(lead.length).split("/").map(decodeURIComponent).join("/");
  } catch {
    return null;
  }
  return KEY.test(key) ? key : null;
}

function declaredLength(request: Request): number | null {
  const raw = request.headers.get("content-length");
  if (!raw || !/^\d+$/.test(raw)) return null;
  return Number(raw);
}

/** R2 needs the length of a stream up front. Use the declared length, or buffer a small body. */
async function bodyForR2(request: Request, limit: number): Promise<ReadableStream<Uint8Array> | ArrayBuffer | "big" | "empty"> {
  const length = declaredLength(request);
  if (length !== null) {
    if (length > limit) return "big";
    if (length === 0 || !request.body) return "empty";
    return request.body;
  }
  // No length: the API always sets one, so this is a fallback for small bodies only.
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength > Math.min(limit, MAX_BUFFERED_BYTES)) return "big";
  return bytes.byteLength === 0 ? "empty" : bytes;
}

const typeOptions = (request: Request) => {
  const contentType = request.headers.get("content-type") ?? "";
  return MIME.test(contentType) ? { httpMetadata: { contentType } } : undefined;
};

export async function handleMedia(request: Request, bucket: R2BucketLike): Promise<Response> {
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  try {
    // ---- Whole objects: /o/<key> ----
    if (url.pathname.startsWith("/o/")) {
      const key = keyFromPath(url.pathname, "o");
      if (!key) return refuse(400, "bad key");
      if (method === "PUT") {
        const body = await bodyForR2(request, MAX_OBJECT_BYTES);
        if (body === "big") return refuse(413, "too big");
        if (body === "empty") return refuse(400, "empty");
        await bucket.put(key, body, typeOptions(request));
        return json({ ok: true });
      }
      if (method === "DELETE") {
        await bucket.delete(key);
        return json({ ok: true });
      }
      if (method === "HEAD") {
        const head = await bucket.head(key);
        if (!head) return new Response(null, { status: 404 });
        return new Response(null, { headers: { "Content-Length": String(head.size), "Accept-Ranges": "bytes" } });
      }
      if (method === "GET") {
        const range = parseRange(request.headers.get("range"));
        if (range === "bad") return refuse(416, "bad range");
        const object = await bucket.get(key, range === "none" ? undefined : { range });
        if (!object) return new Response(null, { status: 404 });
        const headers = new Headers({ "Accept-Ranges": "bytes", ETag: object.httpEtag ?? `"${object.etag}"` });
        if (object.httpMetadata?.contentType) headers.set("Content-Type", object.httpMetadata.contentType);
        if (range === "none") {
          headers.set("Content-Length", String(object.size));
          return new Response(object.body, { headers });
        }
        const { start, end } = covered(object, range);
        if (start >= object.size || end < start) {
          await object.body.cancel().catch(() => {});
          return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${object.size}` } });
        }
        headers.set("Content-Range", `bytes ${start}-${end}/${object.size}`);
        headers.set("Content-Length", String(end - start + 1));
        return new Response(object.body, { status: 206, headers });
      }
      return refuse(405, "method");
    }

    // ---- Multipart: /m/<key>?uploads | ?uploadId=..&part=N | ?uploadId=.. ----
    if (url.pathname.startsWith("/m/")) {
      const key = keyFromPath(url.pathname, "m");
      if (!key) return refuse(400, "bad key");
      if (method === "POST" && url.searchParams.has("uploads")) {
        const started = await bucket.createMultipartUpload(key, typeOptions(request));
        return json({ uploadId: started.uploadId });
      }
      const uploadId = url.searchParams.get("uploadId");
      if (!uploadId || !UPLOAD_ID.test(uploadId)) return refuse(400, "bad upload id");
      const upload = bucket.resumeMultipartUpload(key, uploadId);
      if (method === "PUT") {
        const number = Number(url.searchParams.get("part"));
        if (!Number.isInteger(number) || number < 1 || number > MAX_PARTS) return refuse(400, "bad part");
        const body = await bodyForR2(request, MAX_PART_BYTES);
        if (body === "big") return refuse(413, "too big");
        if (body === "empty") return refuse(400, "empty");
        const part = await upload.uploadPart(number, body);
        return json({ etag: part.etag });
      }
      if (method === "POST") {
        const body = (await request.json().catch(() => null)) as { parts?: { number?: unknown; etag?: unknown }[] } | null;
        const parts = body?.parts;
        if (!Array.isArray(parts) || parts.length < 1 || parts.length > MAX_PARTS) return refuse(400, "bad parts");
        const list: R2PartLike[] = [];
        for (const p of parts) {
          if (
            typeof p.number !== "number" ||
            !Number.isInteger(p.number) ||
            p.number < 1 ||
            p.number > MAX_PARTS ||
            typeof p.etag !== "string" ||
            p.etag.length > 200
          )
            return refuse(400, "bad parts");
          list.push({ partNumber: p.number, etag: p.etag.replaceAll('"', "") });
        }
        list.sort((a, b) => a.partNumber - b.partNumber);
        const done = await upload.complete(list);
        return json({ ok: true, size: done.size });
      }
      if (method === "DELETE") {
        await upload.abort().catch(() => {});
        return json({ ok: true });
      }
      return refuse(405, "method");
    }

    // ---- Everything under one owner's folder: DELETE /p/<owner>/ ----
    if (url.pathname.startsWith("/p/") && method === "DELETE") {
      let prefix: string;
      try {
        prefix = decodeURIComponent(url.pathname.slice(3));
      } catch {
        return refuse(400, "bad prefix");
      }
      if (!OWNER_PREFIX.test(prefix)) return refuse(400, "bad prefix");
      let removed = 0;
      for (let round = 0; round < 50; round++) {
        const listing = await bucket.list({ prefix, limit: 1000 });
        if (listing.objects.length === 0) break;
        await bucket.delete(listing.objects.map((o) => o.key));
        removed += listing.objects.length;
        if (!listing.truncated) break;
      }
      return json({ removed });
    }
    return refuse(404, "not found");
  } catch (error) {
    // The name only. Never a message that could carry anything from a recording.
    console.error("media.internal failed", error instanceof Error ? error.name : "unknown");
    return refuse(502, "bucket error");
  }
}

/**
 * POST /image with { prompt, steps? }. Answers { success, result: { image } } with the picture as
 * base64 (JPEG), the same shape as the REST API. Only the prompt and the step count go through.
 */
async function handleImage(request: Request, ai: AiLike): Promise<Response> {
  const input = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const prompt = typeof input?.prompt === "string" ? input.prompt.trim() : "";
  if (!prompt || prompt.length > 2048) return refuse(400, "prompt is required, up to 2048 characters");
  const allowed: Record<string, unknown> = { prompt };
  if (typeof input?.steps === "number" && Number.isInteger(input.steps) && input.steps >= 1 && input.steps <= 8)
    allowed.steps = input.steps;
  try {
    const result = (await ai.run(IMAGE_MODEL, allowed)) as { image?: unknown } | null;
    if (!result || typeof result.image !== "string" || !result.image) return json({ success: false }, 502);
    return json({ success: true, result: { image: result.image } });
  } catch (error) {
    // The name only: the prompt is the person's words.
    console.error("ai.internal image failed", error instanceof Error ? error.name : "unknown");
    const message = error instanceof Error ? error.message : "";
    // Workers AI turns down unsafe prompts with an error. Say "refused", never the text.
    if (/nsfw|safety|flagged|not allowed|inappropriate/i.test(message)) return json({ success: false, refused: true }, 422);
    return json({ success: false }, /rate|capacity|overload|timeout|temporar/i.test(message) ? 503 : 502);
  }
}

/** POST /run with the JSON the REST API takes (base64 audio, task, vad_filter, ...). Answers { success, result }. */
export async function handleAi(request: Request, ai: AiLike): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === "POST" && url.pathname === "/image") return handleImage(request, ai);
  if (request.method !== "POST" || url.pathname !== "/run") return refuse(404, "not found");
  const input = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!input || typeof input.audio !== "string" || input.audio.length === 0) return refuse(400, "audio is required");
  // Only the documented settings go through; anything else is dropped.
  const allowed: Record<string, unknown> = { audio: input.audio };
  if (input.task === "transcribe" || input.task === "translate") allowed.task = input.task;
  if (typeof input.language === "string" && /^[a-z]{2,3}$/.test(input.language)) allowed.language = input.language;
  if (typeof input.vad_filter === "boolean") allowed.vad_filter = input.vad_filter;
  if (typeof input.condition_on_previous_text === "boolean") allowed.condition_on_previous_text = input.condition_on_previous_text;
  try {
    const result = await ai.run(WHISPER_MODEL, allowed);
    return json({ success: true, result });
  } catch (error) {
    console.error("ai.internal failed", error instanceof Error ? error.name : "unknown");
    // 503 is retried by the API; a refusal of the input is not.
    const message = error instanceof Error ? error.message : "";
    return json({ success: false }, /rate|capacity|overload|timeout|temporar/i.test(message) ? 503 : 502);
  }
}
