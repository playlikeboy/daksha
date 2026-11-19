// Cartesia, the voice service Daksha's calls already speak with (Sonic-3). A voice
// copy is made with one call and deleted with one call:
//   POST   https://api.cartesia.ai/voices/clone   (multipart: clip, name, language)
//   DELETE https://api.cartesia.ai/voices/{id}
// Docs: https://docs.cartesia.ai/api-reference/voices/clone and .../voices/delete
// A cloned voice is private by default: only the account that made it can use it.
//
// Never log the key or the clip. Errors carry a plain reason only.
export const CARTESIA_URL = "https://api.cartesia.ai";
export const CARTESIA_VERSION = "2026-08-14";
/** Cartesia takes clips up to 16 MB. */
export const CLIP_MAX_BYTES = 16 * 1024 * 1024;
/** Languages Daksha offers for a voice copy. Cartesia supports more. */
export const CLONE_LANGUAGES = ["en", "hi"] as const;

export class CartesiaError extends Error {
  constructor(
    message: string,
    readonly kind: "key" | "busy" | "refused" | "failed",
  ) {
    super(message);
    this.name = "CartesiaError";
  }
}

const headers = (apiKey: string) => ({ Authorization: `Bearer ${apiKey}`, "Cartesia-Version": CARTESIA_VERSION });

function failure(status: number, what: string): CartesiaError {
  if (status === 401 || status === 403) return new CartesiaError("Cartesia did not accept the key.", "key");
  if (status === 402) return new CartesiaError("The Cartesia account has no credit or plan for this.", "key");
  if (status === 429 || status >= 500) return new CartesiaError("Cartesia is busy.", "busy");
  if (status === 400 || status === 413 || status === 422) return new CartesiaError(`Cartesia turned down the ${what}.`, "refused");
  return new CartesiaError(`Cartesia could not ${what === "clip" ? "copy the voice" : "do that"}.`, "failed");
}

/** Make a private voice from one clip. Returns Cartesia's voice id. */
export async function cloneVoice(input: {
  apiKey: string;
  clip: Uint8Array;
  /** The voice's name at Cartesia. Daksha uses a made-up label, never the person's name. */
  name: string;
  language: (typeof CLONE_LANGUAGES)[number];
  fetchImpl?: typeof fetch;
}): Promise<string> {
  if (input.clip.byteLength > CLIP_MAX_BYTES) throw new CartesiaError("The clip is too big for Cartesia.", "refused");
  const form = new FormData();
  form.set("clip", new Blob([new Uint8Array(input.clip)], { type: "audio/wav" }), "clip.wav");
  form.set("name", input.name);
  form.set("language", input.language);
  form.set("access", "private");
  form.set("description", "Made in Daksha for one person's private calls.");
  let response: Response;
  try {
    response = await (input.fetchImpl ?? fetch)(`${CARTESIA_URL}/voices/clone`, {
      method: "POST",
      headers: headers(input.apiKey),
      body: form,
      signal: AbortSignal.timeout(120_000),
    });
  } catch {
    throw new CartesiaError("Cartesia did not answer.", "busy");
  }
  if (!response.ok) throw failure(response.status, "clip");
  const body = (await response.json().catch(() => null)) as { id?: unknown } | null;
  if (typeof body?.id !== "string" || !body.id) throw new CartesiaError("Cartesia did not send back a voice.", "failed");
  return body.id;
}

/** Delete a voice at Cartesia. A voice that is already gone counts as deleted. */
export async function deleteVoice(input: { apiKey: string; voiceId: string; fetchImpl?: typeof fetch }): Promise<void> {
  let response: Response;
  try {
    response = await (input.fetchImpl ?? fetch)(`${CARTESIA_URL}/voices/${encodeURIComponent(input.voiceId)}`, {
      method: "DELETE",
      headers: headers(input.apiKey),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new CartesiaError("Cartesia did not answer.", "busy");
  }
  if (response.ok || response.status === 404) return;
  throw failure(response.status, "delete");
}

/** One cheap read to check a key before it is saved: list one voice. */
export async function checkKey(apiKey: string, fetchImpl: typeof fetch = fetch): Promise<"ok" | "bad" | "unreachable"> {
  try {
    const response = await fetchImpl(`${CARTESIA_URL}/voices?limit=1`, { headers: headers(apiKey), signal: AbortSignal.timeout(15_000) });
    if (response.status === 401 || response.status === 403) return "bad";
    return response.ok ? "ok" : "unreachable";
  } catch {
    return "unreachable";
  }
}
