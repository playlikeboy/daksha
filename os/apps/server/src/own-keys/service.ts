// A person's own AI keys ("Advanced: use your own keys" in Settings). With one set, their chats,
// calls and pictures go to that provider on their account, instead of on Debo's.
//
// The rules, in order of importance:
//   1. A key is stored encrypted (TOKEN_ENCRYPTION_KEY), in the same `credentials` records as
//      tool-server secrets. It is never sent back to the app: the app sees "set, ends in 1234".
//   2. A key is never logged, never put in an error message and never in "Download my data"
//      (the download says only which keys are set).
//   3. A key is checked with one cheap call before it is saved. A key that fails is not kept.
//   4. Removing a key deletes it. Deleting the account deletes every key (the records go).
import Anthropic from "@anthropic-ai/sdk";
import { decryptSecret, encryptSecret } from "../../../../packages/integrations/src/vault.ts";
import type { Store } from "../db.ts";
import { AppError } from "../errors.ts";
import { createRateLimitStore } from "../rate-limit.ts";

export const KEY_PROVIDERS = ["anthropic", "openrouter"] as const;
export type KeyProvider = (typeof KEY_PROVIDERS)[number];

export const OPENROUTER_URL = "https://openrouter.ai/api/v1";
const ANTHROPIC_DEFAULT_MODEL = "claude-haiku-5-5";

/** Short lists for the screen. The person can also type any other model id. */
export const MODEL_CHOICES = {
  anthropic: [
    { id: "claude-haiku-5-5", label: "Claude Haiku 5.5 (fast, cheapest)" },
    { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5 (balanced)" },
    { id: "claude-opus-5-5", label: "Claude Opus 5.5 (most capable)" },
  ],
  openrouter: [
    { id: "anthropic/claude-haiku-5.5", label: "Claude Haiku 5.5" },
    { id: "anthropic/claude-sonnet-5.5", label: "Claude Sonnet 5.5" },
    { id: "google/gemini-3.8-flash", label: "Gemini 3.8 Flash" },
    { id: "deepseek/deepseek-v4.1-flash", label: "DeepSeek V4.1 Flash" },
  ],
  openrouterImages: [
    { id: "google/gemini-3.1-flash-image", label: "Gemini 3.1 Flash Image" },
    { id: "openai/gpt-image-1-mini", label: "GPT Image 1 mini" },
    { id: "black-forest-labs/flux-3-image", label: "FLUX 3" },
  ],
} as const;

/** What is kept next to the encrypted key. Never the key itself. */
export interface OwnKeyRow {
  id: KeyProvider;
  /** The last four characters, so the person can tell which key it is. */
  endsIn: string;
  /** Anthropic: which Claude model. OpenRouter: which chat model (optional). */
  model?: string;
  /** OpenRouter only: which picture model (optional). */
  imageModel?: string;
  checkedAt: string;
  createdAt: string;
}

/** What the app may see. Fields are listed one by one, so nothing new slips out. */
export function keyView(row: OwnKeyRow) {
  return {
    provider: row.id,
    set: true as const,
    endsIn: row.endsIn,
    ...(row.model ? { model: row.model } : {}),
    ...(row.imageModel ? { imageModel: row.imageModel } : {}),
    checkedAt: row.checkedAt,
  };
}

/** Which model a person's chat runs on, and with whose key. */
export interface ChatChoice {
  provider: KeyProvider;
  /** "anthropic/<id>" or "openrouter/<id>", for the engine's model string. */
  spec: string;
  apiKey: string;
}

const KIND = "own_keys";
const SECRETS = "credentials";
const secretId = (provider: KeyProvider) => `own-key-${provider}`;

const KEY_SHAPE = /^[A-Za-z0-9._~+/=:-]{16,400}$/;
const ANTHROPIC_MODEL = /^claude-[a-z0-9.-]{1,80}$/;
const OPENROUTER_MODEL = /^~?[a-z0-9][a-z0-9._-]{0,80}\/[a-z0-9][a-z0-9._:-]{0,120}$/i;

export const NAMES: Record<KeyProvider, string> = { anthropic: "Anthropic", openrouter: "OpenRouter" };

export interface OwnKeysOptions {
  /** TOKEN_ENCRYPTION_KEY. Without it no key can be saved, and none is used. */
  encryptionKey?: string;
  /** Tests pass a stand-in for the network. */
  fetcher?: typeof fetch;
  /** Ids and yes/no only. Never a key. */
  log?: (entry: Record<string, unknown>) => void;
}

export interface SaveInput {
  /** A new key. Leave out to keep the saved key and change only the model. */
  key?: string;
  model?: string;
  imageModel?: string;
}

export class OwnKeysService {
  private readonly saves = createRateLimitStore({ windowMs: 10 * 60_000, maxRequests: 20 });
  private readonly fetcher: typeof fetch;

  constructor(
    private readonly db: Store,
    private readonly options: OwnKeysOptions = {},
  ) {
    this.fetcher = options.fetcher ?? fetch;
  }

  /** Whether this Debo can keep keys at all. */
  get available() {
    return Boolean(this.options.encryptionKey);
  }

  async list(owner: string): Promise<OwnKeyRow[]> {
    const rows = await this.db.list<OwnKeyRow>(owner, KIND);
    return rows.filter((row) => (KEY_PROVIDERS as readonly string[]).includes(row.id));
  }

  /** For "Download my data": which keys are set, nothing more. */
  async exportMine(owner: string) {
    return (await this.list(owner)).map((row) => ({ provider: row.id, keySet: true }));
  }

  async save(owner: string, provider: KeyProvider, input: SaveInput) {
    if (!this.options.encryptionKey)
      throw new AppError("This Debo can't store keys safely yet, so it can't save one.", 503);
    if (!this.saves.take(owner, Date.now()))
      throw new AppError("You have tried a lot of keys just now. Wait a few minutes, then try again.", 429);
    const existing = await this.db.get<OwnKeyRow>(owner, KIND, provider);
    const typed = input.key?.trim();
    if (typed !== undefined && !KEY_SHAPE.test(typed))
      throw new AppError(`That doesn't look like an ${NAMES[provider]} key. Copy the whole key, with no spaces.`, 400);
    const key = typed || (existing ? await this.secret(owner, provider) : undefined);
    if (!key) throw new AppError(`Paste your ${NAMES[provider]} key first.`, 400);
    const model = input.model?.trim() || undefined;
    const imageModel = input.imageModel?.trim() || undefined;
    if (provider === "anthropic") {
      if (imageModel) throw new AppError("Anthropic does not make pictures. Use OpenRouter for that.", 400);
      if (model && !ANTHROPIC_MODEL.test(model))
        throw new AppError("That is not a Claude model name. It looks like claude-haiku-5-5.", 400);
      await this.checkAnthropic(key, model ?? ANTHROPIC_DEFAULT_MODEL);
    } else {
      for (const id of [model, imageModel])
        if (id && !OPENROUTER_MODEL.test(id))
          throw new AppError("That is not an OpenRouter model name. It looks like google/gemini-3.8-flash.", 400);
      await this.checkOpenRouter(key, model, imageModel);
    }
    const now = new Date().toISOString();
    const row: OwnKeyRow = {
      id: provider,
      endsIn: key.slice(-4),
      ...(model ? { model } : {}),
      ...(imageModel ? { imageModel } : {}),
      checkedAt: now,
      createdAt: existing?.createdAt ?? now,
    };
    await this.db.put(owner, SECRETS, {
      id: secretId(provider),
      secret: encryptSecret(JSON.stringify({ value: key }), this.options.encryptionKey),
    });
    await this.db.put(owner, KIND, row);
    this.log("own-key.saved", { owner, provider, model: Boolean(model), imageModel: Boolean(imageModel) });
    return row;
  }

  async remove(owner: string, provider: KeyProvider) {
    await this.db.remove(owner, SECRETS, secretId(provider));
    await this.db.remove(owner, KIND, provider);
    this.log("own-key.removed", { owner, provider });
  }

  /** Every key this person set. Account deletion also removes the records, this is the clear path. */
  async removeAll(owner: string) {
    for (const provider of KEY_PROVIDERS) await this.remove(owner, provider);
  }

  /** The key itself, for a call made on the person's behalf. Server only: never in a response. */
  async secret(owner: string, provider: KeyProvider): Promise<string | undefined> {
    if (!this.options.encryptionKey) return undefined;
    const stored = await this.db.get<{ secret: string }>(owner, SECRETS, secretId(provider));
    if (!stored) return undefined;
    try {
      return (JSON.parse(decryptSecret(stored.secret, this.options.encryptionKey)) as { value: string }).value;
    } catch (error) {
      // A changed encryption key: treat it as not set. The name only.
      this.log("own-key.unreadable", { owner, provider, reason: error instanceof Error ? error.name : "unknown" });
      return undefined;
    }
  }

  /**
   * Which model this person's chat and calls use. An Anthropic key comes first. An OpenRouter
   * key is used for chat only when a chat model was picked for it. Undefined: Debo's own.
   */
  async chatChoice(owner: string, debosModel?: string): Promise<ChatChoice | undefined> {
    const rows = new Map((await this.list(owner)).map((row) => [row.id, row]));
    const anthropic = rows.get("anthropic");
    if (anthropic) {
      const apiKey = await this.secret(owner, "anthropic");
      const debos = debosModel?.match(/^anthropic[/:](claude-[a-z0-9.-]+)$/)?.[1];
      if (apiKey)
        return { provider: "anthropic", spec: `anthropic/${anthropic.model ?? debos ?? ANTHROPIC_DEFAULT_MODEL}`, apiKey };
    }
    const openrouter = rows.get("openrouter");
    if (openrouter?.model) {
      const apiKey = await this.secret(owner, "openrouter");
      if (apiKey) return { provider: "openrouter", spec: `openrouter/${openrouter.model}`, apiKey };
    }
    return undefined;
  }

  /** The person's own picture model on OpenRouter, when they picked one. */
  async imageChoice(owner: string): Promise<{ model: string; apiKey: string } | undefined> {
    const row = await this.db.get<OwnKeyRow>(owner, KIND, "openrouter");
    if (!row?.imageModel) return undefined;
    const apiKey = await this.secret(owner, "openrouter");
    return apiKey ? { model: row.imageModel, apiKey } : undefined;
  }

  /** The Anthropic key works and can use this model. One Models API read: no tokens are spent. */
  private async checkAnthropic(apiKey: string, model: string) {
    const client = new Anthropic({ apiKey, fetch: this.fetcher, maxRetries: 0, timeout: 15_000 });
    try {
      await client.models.retrieve(model);
    } catch (error) {
      if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError)
        throw new AppError("Anthropic did not accept that key. Check it in your Anthropic console and paste it again.", 400);
      if (error instanceof Anthropic.NotFoundError)
        throw new AppError(`Your key works, but Anthropic doesn't know the model "${model}". Pick one from the list.`, 400);
      if (error instanceof Anthropic.RateLimitError)
        throw new AppError("Anthropic is busy for this key right now. Try again in a minute.", 429);
      throw new AppError("I couldn't reach Anthropic to check the key. Try again in a moment.", 502);
    }
  }

  /** The OpenRouter key works, and each chosen model exists (a chat model must be able to use tools). */
  private async checkOpenRouter(apiKey: string, model?: string, imageModel?: string) {
    const keyCheck = await this.get(`${OPENROUTER_URL}/key`, apiKey);
    if (keyCheck.status === 401 || keyCheck.status === 403)
      throw new AppError("OpenRouter did not accept that key. Check it on openrouter.ai and paste it again.", 400);
    if (!keyCheck.ok) throw new AppError("I couldn't reach OpenRouter to check the key. Try again in a moment.", 502);
    if (model) {
      const found = await this.get(`${OPENROUTER_URL}/models/${model}/endpoints`, apiKey);
      if (found.status === 404)
        throw new AppError(`OpenRouter doesn't have a chat model called "${model}". Check the name on openrouter.ai.`, 400);
      if (!found.ok) throw new AppError("I couldn't reach OpenRouter to check the model. Try again in a moment.", 502);
      const body = (await found.json().catch(() => null)) as {
        data?: { endpoints?: { supported_parameters?: string[] }[] };
      } | null;
      const tools = body?.data?.endpoints?.some((e) => e.supported_parameters?.includes("tools"));
      if (!tools)
        throw new AppError(
          `"${model}" can't use tools. Debo needs tools to read your journal, save things and make pictures, so pick a model that supports them.`,
          400,
        );
    }
    if (imageModel) {
      const found = await this.get(`${OPENROUTER_URL}/images/models/${imageModel}/endpoints`, apiKey);
      if (found.status === 404)
        throw new AppError(`"${imageModel}" is not a picture model on OpenRouter. Pick one from the list.`, 400);
      if (!found.ok) throw new AppError("I couldn't reach OpenRouter to check the picture model. Try again in a moment.", 502);
    }
  }

  private async get(url: string, apiKey: string) {
    try {
      return await this.fetcher(url, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new AppError("I couldn't reach OpenRouter to check the key. Try again in a moment.", 502);
    }
  }

  private log(event: string, fields: Record<string, unknown>) {
    (this.options.log ?? ((entry) => console.info("[Debo]", JSON.stringify(entry))))({ event, ...fields });
  }
}
