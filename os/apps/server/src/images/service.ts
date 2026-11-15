// Pictures Debo makes in chat or on a call (the make_image tool).
//
// - The picture is kept in the private media bucket, under the owner's folder, like a recording.
//   The app shows it with a short-lived signed link, made only for its owner.
// - A record of it (the words it was made from, when, by which service) is kept in the
//   person's records, so it shows again in the thread, is in "Download my data" and is deleted
//   with the account. Deleting one picture deletes the file too.
// - Debo's own picture service has a daily limit per person. A person who picked their own
//   OpenRouter picture model pays for it themselves, so that limit does not apply.
// - A short check refuses the worst requests before any service is asked (see guard.ts), and
//   the picture service has its own safety filter on top.
// - Never log the prompt or the picture. Ids and counts only.
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Store } from "../db.ts";
import type { ObjectStore } from "../debo/object-store.ts";
import { AppError } from "../errors.ts";
import type { OwnKeysService } from "../own-keys/service.ts";
import { imagePromptProblem } from "./guard.ts";
import { type ImageMaker, ImageMakerError, openRouterImages, type Shape } from "./makers.ts";

/** Pictures one person may make on Debo's own service per UTC day. */
export const IMAGES_PER_DAY = 20;
const MAX_BYTES = 12 * 1024 * 1024;
const LINK_SECONDS = 3600;
const KIND = "images";
/** One row per UTC day: how many pictures Debo's own service made for this person. */
const USAGE = "image_usage";
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export const STYLES = ["photo", "illustration", "watercolor", "sketch", "3d", "pixel art"] as const;

export const makeImageInput = z.object({
  prompt: z.string().trim().min(3).max(1500).describe("What the picture should show, in plain words."),
  style: z.enum(STYLES).optional().describe("Optional look."),
  shape: z
    .enum(["square", "wide", "tall"])
    .optional()
    .describe("Optional. Debo's own picture service makes only squares; wide and tall need the person's own OpenRouter picture model."),
});

export const makeImageDescription =
  "Make a new picture from a description and show it to the person in the chat. It is saved with their files. Use it when they ask you to draw, make, create or imagine a picture. Never make sexual pictures, anything sexual involving a child, pictures of real, named people in made-up or embarrassing scenes, fake documents, fake news photos, or anything meant to deceive. If the request is like that, say no kindly without calling this tool.";

export const makeImageInstructions =
  " PICTURES: make_image makes a picture and shows it in the chat; on a call, say it is waiting in Chat. You cannot see the picture: do not describe details you did not ask for. If it fails, say so plainly with the reason it gave.";

export interface ImageRecord {
  id: string;
  prompt: string;
  style?: string;
  shape: Shape;
  objectKey: string;
  mimeType: string;
  sizeBytes: number;
  provider: "workers-ai" | "openrouter";
  model: string;
  createdAt: string;
}

export interface ImageOptions {
  /** The bucket. A function, because it is known only once the journal is set up. */
  store: () => ObjectStore | undefined;
  /** Debo's own picture service. Missing: only a person's own OpenRouter model can draw. */
  maker?: ImageMaker;
  ownKeys?: OwnKeysService;
  fetcher?: typeof fetch;
  now?: () => Date;
  perDay?: number;
  log?: (entry: Record<string, unknown>) => void;
}

const SAFE_OWNER = /^[A-Za-z0-9_-]{1,64}$/;

export class ImageService {
  constructor(
    private readonly db: Store,
    private readonly options: ImageOptions,
  ) {}

  get engineName() {
    return this.options.maker?.name;
  }

  /** Could this person get a picture at all? Used to offer the tool. */
  async canMake(owner: string) {
    if (!this.options.store() || !SAFE_OWNER.test(owner)) return false;
    if (this.options.maker) return true;
    return Boolean(await this.options.ownKeys?.imageChoice(owner).catch(() => undefined));
  }

  async make(owner: string, input: unknown, signal?: AbortSignal): Promise<ImageRecord> {
    const args = makeImageInput.parse(input);
    const problem = imagePromptProblem(args.prompt);
    if (problem) throw new AppError(problem, 422);
    const store = this.options.store();
    if (!store || !SAFE_OWNER.test(owner))
      throw new AppError("Pictures are not set up on this Debo yet. Whoever runs it needs to turn them on.", 503);
    const own = await this.options.ownKeys?.imageChoice(owner);
    const maker = own ? openRouterImages(own.apiKey, own.model, this.options.fetcher) : this.options.maker;
    if (!maker)
      throw new AppError("Pictures are not set up on this Debo yet. Whoever runs it needs to turn them on.", 503);
    if (!own) {
      const today = await this.countToday(owner);
      if (today >= (this.options.perDay ?? IMAGES_PER_DAY))
        throw new AppError(
          "You have made a lot of pictures today, and Debo has reached its daily limit for you. You can make more after midnight UTC, or add your own OpenRouter picture model in Settings.",
          429,
        );
    }
    const shape = args.shape ?? "square";
    const prompt = args.style ? `${args.prompt}. Style: ${args.style}.` : args.prompt;
    let made: Awaited<ReturnType<ImageMaker["make"]>>;
    try {
      made = await maker.make(prompt, { shape, signal });
    } catch (error) {
      if (error instanceof ImageMakerError) {
        this.log("image.failed", { owner, provider: maker.provider, kind: error.kind });
        throw new AppError(
          error.kind === "refused"
            ? "The picture service turned this request down. Try describing something else."
            : error.kind === "busy"
              ? "The picture service is busy right now. Try again in a minute."
              : `I couldn't make that picture. ${error.message}`,
          error.kind === "refused" ? 422 : error.kind === "busy" ? 503 : 502,
        );
      }
      throw error;
    }
    if (made.bytes.byteLength > MAX_BYTES) throw new AppError("That picture came back too big to keep.", 502);
    const id = randomUUID();
    const objectKey = `${owner}/${id}.${EXT[made.mimeType] ?? "img"}`;
    await store.putBytes(objectKey, made.bytes, made.mimeType);
    const record: ImageRecord = {
      id,
      prompt: args.prompt,
      ...(args.style ? { style: args.style } : {}),
      shape: made.shape,
      objectKey,
      mimeType: made.mimeType,
      sizeBytes: made.bytes.byteLength,
      provider: maker.provider,
      model: maker.model,
      createdAt: this.now().toISOString(),
    };
    try {
      await this.db.put(owner, KIND, record);
    } catch (error) {
      // No record means no way to find or delete the file later, so it goes too.
      await store.delete(objectKey).catch(() => undefined);
      throw error;
    }
    if (maker.provider === "workers-ai") await this.countOne(owner);
    this.log("image.made", { owner, image: id, provider: maker.provider, bytes: record.sizeBytes });
    return record;
  }

  /** A short-lived link to show one of the person's own pictures. */
  async link(owner: string, id: string) {
    const record = await this.find(owner, id);
    const store = this.options.store();
    if (!store) throw new AppError("Pictures are not set up on this Debo right now.", 503);
    return {
      id: record.id,
      url: await store.signedGet(record.objectKey, record.mimeType, LINK_SECONDS),
      mimeType: record.mimeType,
      prompt: record.prompt,
      shape: record.shape,
      createdAt: record.createdAt,
    };
  }

  async list(owner: string) {
    const rows = await this.db.list<ImageRecord>(owner, KIND);
    return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /** Delete one picture: the file first, so nothing is left behind unseen. */
  async remove(owner: string, id: string) {
    const record = await this.find(owner, id);
    await this.options.store()?.delete(record.objectKey);
    await this.db.remove(owner, KIND, id);
    this.log("image.deleted", { owner, image: id });
  }

  /** Every picture this person has. Runs before the records are wiped on account deletion. */
  async removeAll(owner: string) {
    const rows = await this.db.list<ImageRecord>(owner, KIND);
    const store = this.options.store();
    for (const row of rows) {
      await store?.delete(row.objectKey);
      await this.db.remove(owner, KIND, row.id);
    }
    return rows.length;
  }

  private async find(owner: string, id: string) {
    const record = z.string().uuid().safeParse(id).success
      ? await this.db.get<ImageRecord>(owner, KIND, id)
      : null;
    if (!record) throw new AppError("I couldn't find that picture. It may have been deleted.", 404);
    return record;
  }

  /** Pictures made on Debo's own service since midnight UTC. Kept apart, so deleting one does not reset it. */
  private async countToday(owner: string) {
    const day = this.now().toISOString().slice(0, 10);
    return (await this.db.get<{ count: number }>(owner, USAGE, day))?.count ?? 0;
  }

  private async countOne(owner: string) {
    const day = this.now().toISOString().slice(0, 10);
    await this.db.put(owner, USAGE, { id: day, count: (await this.countToday(owner)) + 1 });
  }

  private now() {
    return this.options.now?.() ?? new Date();
  }

  private log(event: string, fields: Record<string, unknown>) {
    (this.options.log ?? ((entry) => console.info("[Debo]", JSON.stringify(entry))))({ event, ...fields });
  }
}
