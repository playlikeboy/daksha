// Who draws a picture. Daksha's own: Cloudflare Workers AI (FLUX.1 schnell), through the Worker's AI
// binding (ai.internal, see os/infra/cloudflare/api/src/media.ts) or the REST API with a token.
// The person's own: an OpenRouter picture model, on their key and their account.
//
// Never log the prompt or the picture. Errors carry a plain reason, no text from the request.
import { OPENROUTER_URL } from "../own-keys/service.ts";

export type Shape = "square" | "wide" | "tall";

export interface Picture {
  bytes: Uint8Array;
  mimeType: string;
  /** What the picture really is; Daksha's model only makes squares. */
  shape: Shape;
}

export interface ImageMaker {
  /** For the privacy page and the record of each picture. */
  readonly name: string;
  readonly provider: "workers-ai" | "openrouter";
  readonly model: string;
  make(prompt: string, options: { shape: Shape; signal?: AbortSignal }): Promise<Picture>;
}

/** A refusal or failure the person can be told about in plain words. */
export class ImageMakerError extends Error {
  constructor(
    message: string,
    readonly kind: "refused" | "busy" | "failed",
  ) {
    super(message);
    this.name = "ImageMakerError";
  }
}

export const WORKERS_AI_IMAGE_MODEL = "@cf/black-forest-labs/flux-1-schnell";

const fromBase64 = (text: string) => new Uint8Array(Buffer.from(text, "base64"));

/** JPEG, PNG or WebP, by the first bytes. Anything else is not stored. */
export function sniffImage(bytes: Uint8Array): string | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  )
    return "image/webp";
  return null;
}

function picture(base64: unknown, shape: Shape): Picture {
  if (typeof base64 !== "string" || !base64) throw new ImageMakerError("No picture came back.", "failed");
  const bytes = fromBase64(base64);
  const mimeType = sniffImage(bytes);
  if (!mimeType) throw new ImageMakerError("What came back was not a picture.", "failed");
  return { bytes, mimeType, shape };
}

function workersAi(url: string, headers: Record<string, string>, fetchImpl: typeof fetch): ImageMaker {
  return {
    name: "Cloudflare Workers AI (FLUX.1 schnell)",
    provider: "workers-ai",
    model: WORKERS_AI_IMAGE_MODEL,
    async make(prompt, { signal }) {
      let response: Response;
      try {
        response = await fetchImpl(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...headers },
          body: JSON.stringify({ prompt, steps: 4 }),
          signal: signal ?? AbortSignal.timeout(90_000),
        });
      } catch {
        throw new ImageMakerError("The picture service did not answer.", "busy");
      }
      const body = (await response.json().catch(() => null)) as {
        success?: boolean;
        refused?: boolean;
        result?: { image?: unknown };
      } | null;
      if (response.status === 422 || body?.refused) throw new ImageMakerError("The picture service turned this down.", "refused");
      if (response.status === 429 || response.status === 503) throw new ImageMakerError("The picture service is busy.", "busy");
      if (!response.ok || !body?.success) throw new ImageMakerError("The picture service failed.", "failed");
      return picture(body.result?.image, "square");
    },
  };
}

/** Through the Worker's AI binding: POST <AI_BINDING_URL>/image. No token needed. */
export function bindingImages(aiBindingUrl: string, fetchImpl: typeof fetch = fetch): ImageMaker {
  return workersAi(`${aiBindingUrl.replace(/\/$/, "")}/image`, {}, fetchImpl);
}

/** Through the REST API, with CF_AI_API_TOKEN and the account id. Same answer shape. */
export function restImages(config: { accountId: string; apiToken: string }, fetchImpl: typeof fetch = fetch): ImageMaker {
  return workersAi(
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(config.accountId)}/ai/run/${WORKERS_AI_IMAGE_MODEL}`,
    { Authorization: `Bearer ${config.apiToken}` },
    fetchImpl,
  );
}

/**
 * Daksha's own picture service, from the same settings as speech (see debo/index.ts, mediaFromEnv):
 * AI_BACKEND=binding with AI_BINDING_URL (the Worker's AI binding), else CF_AI_API_TOKEN with
 * R2_ACCOUNT_ID (the REST API). Neither: only a person's own OpenRouter picture model can draw.
 */
export function imageMakerFromEnv(env: Record<string, string | undefined>): ImageMaker | undefined {
  const aiUrl = env.AI_BINDING_URL?.trim();
  if (env.AI_BACKEND?.trim() === "binding" && aiUrl) return bindingImages(aiUrl);
  const apiToken = env.CF_AI_API_TOKEN?.trim();
  const accountId = env.R2_ACCOUNT_ID?.trim();
  if (apiToken && accountId) return restImages({ accountId, apiToken });
  return undefined;
}

const RATIO: Record<Shape, string> = { square: "1:1", wide: "16:9", tall: "9:16" };

/** The person's own OpenRouter picture model: https://openrouter.ai/docs (Image API). */
export function openRouterImages(apiKey: string, model: string, fetchImpl: typeof fetch = fetch): ImageMaker {
  return {
    name: `OpenRouter (${model}), on your own key`,
    provider: "openrouter",
    model,
    async make(prompt, { shape, signal }) {
      let response: Response;
      try {
        response = await fetchImpl(`${OPENROUTER_URL}/images`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ model, prompt, n: 1, aspect_ratio: RATIO[shape] }),
          signal: signal ?? AbortSignal.timeout(180_000),
        });
      } catch {
        throw new ImageMakerError("OpenRouter did not answer.", "busy");
      }
      if (response.status === 401 || response.status === 403)
        throw new ImageMakerError("OpenRouter did not accept your key. Check it in Settings.", "failed");
      if (response.status === 402) throw new ImageMakerError("Your OpenRouter account is out of credit.", "failed");
      if (response.status === 429 || response.status >= 500) throw new ImageMakerError("OpenRouter is busy.", "busy");
      if (response.status === 400 || response.status === 422)
        throw new ImageMakerError("OpenRouter turned this picture down.", "refused");
      const body = (await response.json().catch(() => null)) as { data?: { b64_json?: unknown }[] } | null;
      if (!response.ok) throw new ImageMakerError("OpenRouter could not make the picture.", "failed");
      return picture(body?.data?.[0]?.b64_json, shape);
    },
  };
}
