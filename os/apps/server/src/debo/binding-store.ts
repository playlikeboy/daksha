// Recordings through Cloudflare bindings, with no R2 keys.
//
// The API runs in a container. The Worker in front of it gives the container two
// private made-up hosts (see os/infra/cloudflare/api/src/media.ts):
//   media.internal   the private R2 bucket
//   ai.internal      Workers AI
// There are no presigned links in this mode, so the app uploads to and plays
// from this server itself, at /api/media-blob/<token>. The token is the same
// idea as the sample mode's one-time links: it names one action on one object,
// is signed with a key only the server has, and expires. It needs no sign-in
// header, so `<audio>`, `<video>` and the phone's player can use it as a plain
// link. Bodies are streamed through; a recording is never held in memory.
import { createHmac, timingSafeEqual } from "node:crypto";
import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { Hono } from "hono";
import type { ObjectStore, UploadPart, UploadPlan } from "./object-store.ts";

type Grant = {
  op: "put" | "part" | "get";
  key: string;
  /** Exact byte count for a put or one part. */
  size?: number;
  uploadId?: string;
  part?: number;
  mimeType?: string;
  /** Unix milliseconds. */
  exp: number;
};

export const BLOB_PATH = "/api/media-blob";

const b64 = (bytes: Buffer | string) => Buffer.from(bytes).toString("base64url");

export function signGrant(secret: string, grant: Grant): string {
  const body = b64(JSON.stringify(grant));
  return `${body}.${sign(secret, body)}`;
}

/** The grant inside a token, or null when it is forged, damaged or expired. */
export function readGrant(secret: string, token: string, now = Date.now()): Grant | null {
  const [body, mac, extra] = token.split(".");
  if (!body || !mac || extra !== undefined) return null;
  const expected = Buffer.from(sign(secret, body));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const grant = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Grant;
    return typeof grant.exp === "number" && grant.exp > now && typeof grant.key === "string" ? grant : null;
  } catch {
    return null;
  }
}

// A separate key for this one job, derived from the server's signing key.
const sign = (secret: string, body: string) =>
  createHmac("sha256", createHmac("sha256", secret).update("debo-media-blob-v1").digest()).update(body).digest("base64url");

export type BindingStoreOptions = {
  /** http://media.internal: the Worker answers it. */
  mediaUrl: string;
  /** This server's public address, e.g. https://api.debo.life. */
  publicUrl: string;
  /** Signs the links. SESSION_SIGNING_KEY. */
  secret: string;
  fetchImpl?: typeof fetch;
};

export type BindingStore = ObjectStore & { routes(): Hono };

export function bindingStore(options: BindingStoreOptions): BindingStore {
  const call = options.fetchImpl ?? fetch;
  const base = options.mediaUrl.replace(/\/$/, "");
  const publicUrl = options.publicUrl.replace(/\/$/, "");
  const path = (kind: "o" | "m", key: string) => `${base}/${kind}/${key.split("/").map(encodeURIComponent).join("/")}`;
  const link = (grant: Omit<Grant, "exp">, seconds: number) =>
    `${publicUrl}${BLOB_PATH}/${signGrant(options.secret, { ...grant, exp: Date.now() + seconds * 1000 })}`;

  const store: BindingStore = {
    async beginUpload({ key, mimeType, size, singleMaxBytes, partBytes, expiresSeconds }): Promise<UploadPlan> {
      if (size <= singleMaxBytes)
        return { mode: "single", url: link({ op: "put", key, size, mimeType }, expiresSeconds), headers: { "Content-Type": mimeType } };
      const started = await call(`${path("m", key)}?uploads`, {
        method: "POST",
        headers: { "Content-Type": mimeType },
        signal: AbortSignal.timeout(30_000),
      });
      const uploadId = ((await started.json().catch(() => null)) as { uploadId?: string } | null)?.uploadId;
      if (!started.ok || !uploadId) throw new Error("The bucket would not start the upload.");
      const count = Math.ceil(size / partBytes);
      const parts: UploadPart[] = Array.from({ length: count }, (_, i) => {
        const number = i + 1;
        const length = number === count ? size - partBytes * (count - 1) : partBytes;
        return { number, url: link({ op: "part", key, uploadId, part: number, size: length }, expiresSeconds), headers: {} };
      });
      return { mode: "multipart", uploadId, partBytes, parts };
    },

    async finishUpload(key, uploadId, parts) {
      const response = await call(`${path("m", key)}?uploadId=${encodeURIComponent(uploadId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parts }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) throw new Error("The bucket would not join the parts.");
    },

    async abortUpload(key, uploadId) {
      try {
        await call(`${path("m", key)}?uploadId=${encodeURIComponent(uploadId)}`, { method: "DELETE", signal: AbortSignal.timeout(30_000) });
      } catch {
        // A leftover upload costs nothing until it is joined; R2 clears old ones on its own.
      }
    },

    async head(key) {
      const response = await call(path("o", key), { method: "HEAD", signal: AbortSignal.timeout(30_000) });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error("The bucket would not answer.");
      return { size: Number(response.headers.get("content-length") ?? 0) };
    },

    async putBytes(key, bytes, mimeType) {
      const response = await call(path("o", key), {
        method: "PUT",
        headers: { "Content-Type": mimeType, "Content-Length": String(bytes.byteLength) },
        body: new Uint8Array(bytes),
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) throw new Error("The bucket would not store the file.");
    },

    signedGet: async (key, mimeType, seconds) => link({ op: "get", key, mimeType }, seconds),

    async delete(key) {
      const response = await call(path("o", key), { method: "DELETE", signal: AbortSignal.timeout(30_000) });
      if (!response.ok && response.status !== 404) throw new Error("The bucket would not delete the file.");
    },

    async deletePrefix(prefix) {
      const response = await call(`${base}/p/${encodeURIComponent(prefix).replaceAll("%2F", "/")}`, {
        method: "DELETE",
        signal: AbortSignal.timeout(120_000),
      });
      if (!response.ok) throw new Error("The bucket would not delete the files.");
      return ((await response.json().catch(() => null)) as { removed?: number } | null)?.removed ?? 0;
    },

    async download(key, destination) {
      const response = await call(path("o", key), { signal: AbortSignal.timeout(10 * 60_000) });
      if (!response.ok || !response.body) throw new Error("The bucket would not send the file.");
      await pipeline(Readable.fromWeb(response.body as import("node:stream/web").ReadableStream), createWriteStream(destination));
    },

    routes() {
      const app = new Hono();
      const grantOf = (token: string, ops: Grant["op"][]) => {
        const g = readGrant(options.secret, token);
        return g && ops.includes(g.op) ? g : null;
      };

      app.put("/:token", async (c) => {
        const g = grantOf(c.req.param("token"), ["put", "part"]);
        if (!g) return c.text("This link has expired. Go back and try again.", 403);
        // The exact size was signed into the link. A body without a length (chunked) is refused,
        // because nothing could stop it growing.
        const length = c.req.header("content-length");
        if (!length || !/^\d+$/.test(length)) return c.text("The upload needs a size.", 411);
        if (g.size !== undefined && Number(length) !== g.size) return c.text("That is not the size this link allows.", 403);
        if (!c.req.raw.body) return c.text("Nothing was sent.", 400);
        const target =
          g.op === "put"
            ? path("o", g.key)
            : `${path("m", g.key)}?uploadId=${encodeURIComponent(g.uploadId ?? "")}&part=${g.part ?? 0}`;
        const headers: Record<string, string> = { "Content-Length": length };
        const type = c.req.header("content-type");
        const mime = g.mimeType ?? type;
        if (mime) headers["Content-Type"] = mime;
        let response: Response;
        try {
          response = await call(target, {
            method: "PUT",
            headers,
            body: c.req.raw.body,
            // Needed by Node's fetch to send a stream.
            duplex: "half",
            signal: c.req.raw.signal,
          } as RequestInit);
        } catch {
          return c.text("The upload was interrupted. Try again.", 502);
        }
        if (!response.ok) return c.text("I couldn't store that. Try again.", 502);
        if (g.op === "put") return c.body(null, 200);
        const etag = ((await response.json().catch(() => null)) as { etag?: string } | null)?.etag;
        if (!etag) return c.text("I couldn't store that. Try again.", 502);
        c.header("ETag", `"${etag.replaceAll('"', "")}"`);
        return c.body(null, 200);
      });

      app.on(["GET", "HEAD"], "/:token", async (c) => {
        const g = grantOf(c.req.param("token"), ["get"]);
        if (!g) return c.text("This link has expired. Go back and play it again.", 403);
        const headers: Record<string, string> = {};
        const range = c.req.header("range");
        if (range) headers.Range = range;
        let response: Response;
        try {
          response = await call(path("o", g.key), { method: c.req.method, headers, signal: c.req.raw.signal });
        } catch {
          return c.text("I couldn't reach the recording. Try again.", 502);
        }
        if (response.status === 404) return c.text("Not found", 404);
        if (response.status !== 200 && response.status !== 206 && response.status !== 416) return c.text("I couldn't read the recording.", 502);
        const out = new Headers({
          "Content-Type": g.mimeType ?? "application/octet-stream",
          "Accept-Ranges": "bytes",
          "X-Content-Type-Options": "nosniff",
        });
        for (const name of ["content-length", "content-range"]) {
          const value = response.headers.get(name);
          if (value) out.set(name, value);
        }
        return new Response(c.req.method === "HEAD" ? null : response.body, { status: response.status, headers: out });
      });
      return app;
    },
  };
  return store;
}
