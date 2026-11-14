// Debo fetches an address a person typed. That is the classic way to reach things the person
// should never reach (this server's own network, cloud metadata, other private services).
// Everything about a custom tool server goes through this file:
//
//   - https only, no user:password in the address;
//   - the host name is resolved here, and EVERY answer must be a public address;
//   - the request is sent to the address that was checked (pinned), not looked up again;
//   - redirects are never followed;
//   - every request has a time limit and a limit on how many bytes may come back.
import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { AppError } from "../errors.ts";

export interface ResolvedAddress {
  address: string;
  family: 4 | 6;
}
export type Resolver = (host: string) => Promise<ResolvedAddress[]>;

export const BLOCKED_PLACE =
  "Debo can't connect to that address. It must be a public https address on the internet.";

/** Names that never point at the public internet, including this deployment's own internal hosts. */
function blockedName(host: string) {
  const name = host.toLowerCase().replace(/\.$/, "");
  return (
    name === "localhost" ||
    name.endsWith(".localhost") ||
    name.endsWith(".internal") ||
    name.endsWith(".local") ||
    name.endsWith(".localdomain") ||
    name.endsWith(".lan") ||
    name.endsWith(".home.arpa") ||
    // A single word such as "intranet" is resolved by the local network, never the internet.
    !name.includes(".")
  );
}

function v4Bytes(text: string): number[] | null {
  const parts = text.split(".");
  if (parts.length !== 4) return null;
  const bytes = parts.map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : Number.NaN));
  return bytes.every((b) => b >= 0 && b <= 255) ? bytes : null;
}

function blockedV4(b: number[]) {
  const [a, c, d] = b as [number, number, number];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && c >= 64 && c <= 127) || // carrier-grade NAT
    (a === 169 && c === 254) || // link-local, including cloud metadata
    (a === 172 && c >= 16 && c <= 31) ||
    (a === 192 && c === 0 && (d === 0 || d === 2)) || // 192.0.0.0/24 and 192.0.2.0/24
    (a === 192 && c === 168) ||
    (a === 198 && (c === 18 || c === 19)) ||
    (a === 198 && c === 51 && d === 100) ||
    (a === 203 && c === 0 && d === 113) ||
    a >= 224 // multicast, reserved and broadcast
  );
}

/** Reads an IPv6 address into 16 bytes, or null when it is not one. */
function v6Bytes(text: string): number[] | null {
  let value = text.split("%")[0] ?? "";
  if (value.startsWith("[") && value.endsWith("]")) value = value.slice(1, -1);
  const tail = value.lastIndexOf(":");
  let embedded: number[] = [];
  if (value.includes(".")) {
    const v4 = v4Bytes(value.slice(tail + 1));
    if (!v4) return null;
    embedded = v4;
    value = `${value.slice(0, tail + 1)}0:0`;
  }
  const halves = value.split("::");
  if (halves.length > 2) return null;
  const groups = (part: string) => (part ? part.split(":") : []);
  const head = groups(halves[0] ?? "");
  const rest = halves.length === 2 ? groups(halves[1] ?? "") : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 1 ? head.length !== 8 : missing < 1) return null;
  const all = halves.length === 1 ? head : [...head, ...Array(missing).fill("0"), ...rest];
  const bytes: number[] = [];
  for (const group of all) {
    if (!/^[0-9a-f]{1,4}$/i.test(group)) return null;
    const n = Number.parseInt(group, 16);
    bytes.push(n >> 8, n & 255);
  }
  if (embedded.length) bytes.splice(12, 4, ...embedded);
  return bytes.length === 16 ? bytes : null;
}

function blockedV6(b: number[]) {
  const zeros = (from: number, to: number) => b.slice(from, to).every((x) => x === 0);
  if (zeros(0, 15) && (b[15] === 0 || b[15] === 1)) return true; // :: and ::1
  // IPv4 inside IPv6: judge it as the IPv4 address it carries.
  if (zeros(0, 10) && b[10] === 255 && b[11] === 255) return blockedV4(b.slice(12));
  if (zeros(0, 12)) return true; // ::a.b.c.d (deprecated)
  if (b[0] === 0x00 && b[1] === 0x64 && b[2] === 0xff && b[3] === 0x9b && zeros(4, 12))
    return blockedV4(b.slice(12)); // NAT64
  if (b[0] === 0x20 && b[1] === 0x02) return true; // 6to4
  if (b[0] === 0x20 && b[1] === 0x01 && b[2] === 0x0d && b[3] === 0xb8) return true; // documentation
  if ((b[0] ?? 0) >= 0xfc && (b[0] ?? 0) <= 0xfd) return true; // unique local
  if (b[0] === 0xfe && ((b[1] ?? 0) & 0xc0) === 0x80) return true; // link-local
  if (b[0] === 0xfe && ((b[1] ?? 0) & 0xc0) === 0xc0) return true; // site-local (old)
  if (b[0] === 0xff) return true; // multicast
  return false;
}

/** True when the address is not a plain public internet address. */
export function isBlockedAddress(address: string): boolean {
  const kind = isIP(address.replace(/^\[|\]$/g, ""));
  if (kind === 4) {
    const bytes = v4Bytes(address);
    return !bytes || blockedV4(bytes);
  }
  const bytes = v6Bytes(address);
  return !bytes || blockedV6(bytes);
}

const defaultResolver: Resolver = async (host) => {
  const found = await Promise.race([
    lookup(host, { all: true, verbatim: true }),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("dns timeout")), 5000)),
  ]);
  return found.map((f) => ({ address: f.address, family: f.family === 6 ? 6 : 4 }));
};

/**
 * Checks an address a person typed and returns the public IP the request must be sent to.
 * Throws a plain-worded AppError when it is not allowed or cannot be found.
 */
export async function checkPublicUrl(
  raw: string | URL,
  resolve: Resolver = defaultResolver,
): Promise<{ url: URL; address: ResolvedAddress }> {
  let url: URL;
  try {
    url = new URL(String(raw));
  } catch {
    throw new AppError("That is not a web address. Use one that starts with https://", 400);
  }
  if (url.protocol !== "https:")
    throw new AppError("The address must start with https://. Plain http is not allowed.", 400);
  if (url.username || url.password)
    throw new AppError(
      "Leave the name and password out of the address. Put a secret in the secret box instead.",
      400,
    );
  if (url.href.length > 500) throw new AppError("That address is too long.", 400);
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) {
    if (isBlockedAddress(host)) throw new AppError(BLOCKED_PLACE, 400);
    return { url, address: { address: host, family: isIP(host) === 6 ? 6 : 4 } };
  }
  if (blockedName(host)) throw new AppError(BLOCKED_PLACE, 400);
  let answers: ResolvedAddress[];
  try {
    answers = await resolve(host);
  } catch {
    throw new AppError("I couldn't find that server. Check the address and try again.", 502);
  }
  if (!answers.length)
    throw new AppError("I couldn't find that server. Check the address and try again.", 502);
  // One private answer among public ones is still refused: the name could be steered there.
  if (answers.some((a) => isBlockedAddress(a.address))) throw new AppError(BLOCKED_PLACE, 400);
  return { url, address: answers[0] as ResolvedAddress };
}

export interface SafeFetchOptions {
  resolve?: Resolver;
  /** Most bytes one response may carry. */
  maxBytes?: number;
  /** Most time one request may take, in milliseconds. */
  timeoutMs?: number;
}

/** A `fetch` that can only reach public https addresses, never follows redirects and is size and time limited. */
export function createSafeFetch(options: SafeFetchOptions = {}): typeof fetch {
  const maxBytes = options.maxBytes ?? 1_000_000;
  const timeoutMs = options.timeoutMs ?? 30_000;
  return (async (input: string | URL | Request, init: RequestInit = {}) => {
    const source = input instanceof Request ? input.url : String(input);
    const { url, address } = await checkPublicUrl(source, options.resolve);
    const headers: Record<string, string> = {};
    new Headers(init.headers).forEach((value, key) => {
      if (!["host", "content-length", "connection", "transfer-encoding"].includes(key))
        headers[key] = value;
    });
    const body = typeof init.body === "string" ? init.body : undefined;
    if (init.body !== undefined && init.body !== null && body === undefined)
      throw new AppError("Debo sent a request in a form it does not support.", 500);
    if (body !== undefined) headers["content-length"] = String(Buffer.byteLength(body));
    return await new Promise<Response>((resolve, reject) => {
      let settled = false;
      const fail = (error: unknown) => {
        if (settled) return;
        settled = true;
        reject(error);
      };
      const req = httpsRequest(
        {
          host: url.hostname.replace(/^\[|\]$/g, ""),
          port: url.port || 443,
          path: `${url.pathname}${url.search}`,
          method: init.method ?? "GET",
          headers,
          servername: isIP(url.hostname.replace(/^\[|\]$/g, "")) ? undefined : url.hostname,
          // Pinned: connect to the address that was checked, never to a fresh lookup.
          // Node asks for a list when it connects to several addresses ("all"), else for one.
          lookup: (_host, lookupOptions, callback) => {
            const done = callback as unknown as (e: null, a: unknown, f?: number) => void;
            if ((lookupOptions as { all?: boolean } | undefined)?.all)
              done(null, [{ address: address.address, family: address.family }]);
            else done(null, address.address, address.family);
          },
        },
        (res) => {
          const status = res.statusCode ?? 502;
          if (status >= 300 && status < 400) {
            res.destroy();
            fail(new AppError("That server tried to send Debo somewhere else, which is not allowed.", 502));
            return;
          }
          let total = 0;
          const stream = new ReadableStream<Uint8Array>({
            start(controller) {
              res.on("data", (chunk: Buffer) => {
                total += chunk.length;
                if (total > maxBytes) {
                  controller.error(new AppError("That server sent back too much data.", 502));
                  res.destroy();
                  return;
                }
                controller.enqueue(new Uint8Array(chunk));
              });
              res.on("end", () => controller.close());
              res.on("error", (error) => controller.error(error));
            },
            cancel() {
              res.destroy();
            },
          });
          const out = new Headers();
          for (const [key, value] of Object.entries(res.headers))
            if (value !== undefined) out.set(key, Array.isArray(value) ? value.join(", ") : value);
          if (!settled) {
            settled = true;
            resolve(
              new Response([204, 205, 304].includes(status) ? null : stream, {
                status,
                statusText: res.statusMessage,
                headers: out,
              }),
            );
          }
        },
      );
      const timer = setTimeout(() => {
        req.destroy(new AppError("That server took too long to answer.", 502));
      }, timeoutMs);
      req.on("close", () => clearTimeout(timer));
      req.on("error", (error) =>
        fail(
          error instanceof AppError
            ? error
            : new AppError("I couldn't reach that server. Check the address and try again.", 502),
        ),
      );
      init.signal?.addEventListener("abort", () => req.destroy(new Error("aborted")), { once: true });
      if (init.signal?.aborted) req.destroy(new Error("aborted"));
      req.end(body);
    });
  }) as typeof fetch;
}
