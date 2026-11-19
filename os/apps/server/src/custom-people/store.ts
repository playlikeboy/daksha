// Custom people: someone the person wants to talk to, built from a description or from their
// own chats, photos and videos. One row per person in the `custom-people` kind, up to ten.
//
// Only the profile is kept: a short style summary, example lines, nicknames, languages and
// facts, each fact with where it came from. The uploaded files are read once and deleted (see
// service.ts). Everything here is the person's own data: shown in the app, in "Download my
// data", and deleted with the person or the account.
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Store } from "../db.ts";
import { AppError } from "../errors.ts";
import { VOICES } from "../talk-settings.ts";
import { CustomAvatarStore } from "../custom-avatars.ts";
import { customPersonProblem } from "./safety.ts";

export const PEOPLE_KIND = "custom-people";
export const MAX_CUSTOM_PEOPLE = 10;
export const MAX_EXAMPLES = 40;
export const MAX_FACTS = 40;
/** The most lines kept from voice notes and call recordings, newest first. */
export const MAX_SPOKEN_LINES = 400;

/** Where a fact came from, in words the app shows next to it. */
export const FACT_SOURCES = {
  description: "from what you wrote",
  chat: "from your chat export",
  photo: "from a photo",
  video: "from a video",
  voice: "from a voice note or call",
} as const;
export type FactSource = keyof typeof FACT_SOURCES;

export interface CustomPersonFact {
  text: string;
  source: FactSource;
}

export interface CustomPerson {
  id: string;
  name: string;
  /** Who they are to the person: "my grandmother", "my best friend", "a made-up pirate". */
  relation: string;
  /** The person's own words about them. */
  description: string;
  /** How they talk, in a few sentences. Made from uploads, or empty. */
  styleSummary: string;
  /** Lines this person really wrote or said, used as examples of their voice. */
  examples: string[];
  nicknames: string[];
  languages: string[];
  facts: CustomPersonFact[];
  /** Short hints about how they look, from photo descriptions. Never used to identify anyone. */
  appearance?: string;
  /** A voice id from `VOICES` for calls. */
  voice?: string;
  /**
   * Set when a copy of their voice was made (voice-clone/, the `voice-clones` record with the
   * same id holds the provider's voice id and whose key made it). Only ever used in this
   * person's own Debo calls. Deleted at the provider when the custom person or the account is
   * deleted. The app only reads whether it is there.
   */
  voiceCloneId?: string;
  /**
   * Lines they really said in voice notes and call recordings, with the other voices thrown
   * away and private details scrubbed (voice-clone/). Newest first, up to MAX_SPOKEN_LINES.
   * Every profile build reads them as their own lines.
   */
  spokenLines?: { text: string; source: string }[];
  /** A saved avatar (records kind `custom-avatars`). Must be one of the owner's own. Missing: the app draws initials. */
  avatarId?: string;
  /** They have died: Debo speaks gently and the app shows a soft note. */
  passedAway?: boolean;
  /** When the profile was last built from uploads, and from what. Counts only. */
  builtFrom?: { chats: number; messages: number; photos: number; videos: number; voice: number; at: string };
  createdAt: string;
  updatedAt: string;
}

const line = (max: number) => z.string().trim().max(max);
const voiceId = z.enum(VOICES.map((v) => v.id) as [string, ...string[]]);

// No defaults here: a change sends only what changes, and a default would wipe the rest.
const fields = {
  name: line(60).min(1, "Give them a name."),
  relation: line(80),
  description: z.string().trim().max(1500, "Keep the description under 1,500 characters."),
  voice: voiceId,
  avatarId: z.string().trim().min(1).max(100),
  passedAway: z.boolean(),
  nicknames: z.array(line(40).min(1)).max(10),
  languages: z.array(line(30).min(1)).max(5),
};

/** What the person (or the chat tool) may set. The profile fields are set by the upload reader. */
export const customPersonInput = z.object({
  name: fields.name,
  relation: fields.relation.optional(),
  description: fields.description.optional(),
  voice: fields.voice.optional(),
  avatarId: fields.avatarId.optional(),
  passedAway: fields.passedAway.optional(),
  nicknames: fields.nicknames.optional(),
  languages: fields.languages.optional(),
});
export const customPersonPatch = z.object({
  name: fields.name.optional(),
  relation: fields.relation.optional(),
  description: fields.description.optional(),
  voice: fields.voice.optional(),
  /** null takes the face off; the app draws initials again. */
  avatarId: fields.avatarId.nullable().optional(),
  passedAway: fields.passedAway.optional(),
  nicknames: fields.nicknames.optional(),
  languages: fields.languages.optional(),
  /** The person can remove a fact or an example line they don't like. */
  examples: z.array(line(240).min(1)).max(MAX_EXAMPLES).optional(),
  facts: z
    .array(z.object({ text: line(240).min(1), source: z.enum(Object.keys(FACT_SOURCES) as [FactSource, ...FactSource[]]) }))
    .max(MAX_FACTS)
    .optional(),
  styleSummary: line(800).optional(),
});

const NO_FACE = "I couldn't find that face. Make one in the avatar builder first, then pick it.";

export class CustomPeopleStore {
  constructor(private readonly db: Store) {}

  /** A face must be one of this owner's own saved faces; another person's id is "not found". */
  private async checkAvatar(owner: string, avatarId: string | null | undefined) {
    if (!avatarId) return;
    const face = await new CustomAvatarStore(this.db).get(owner, avatarId).catch(() => null);
    if (!face) throw new AppError(NO_FACE, 422);
  }

  list(owner: string): Promise<CustomPerson[]> {
    return this.db.list<CustomPerson>(owner, PEOPLE_KIND);
  }

  get(owner: string, id: string): Promise<CustomPerson | null> {
    return this.db.get<CustomPerson>(owner, PEOPLE_KIND, id);
  }

  /** Find by id, or by name (any case) when the chat names them. */
  async find(owner: string, idOrName: string): Promise<CustomPerson | null> {
    const key = idOrName.trim();
    if (!key) return null;
    const byId = await this.get(owner, key).catch(() => null);
    if (byId) return byId;
    const lower = key.toLocaleLowerCase();
    return (await this.list(owner)).find((p) => p.name.toLocaleLowerCase() === lower) ?? null;
  }

  async create(owner: string, input: unknown): Promise<CustomPerson> {
    const data = customPersonInput.parse(input);
    const problem = customPersonProblem(data);
    if (problem) throw new AppError(problem, 422);
    await this.checkAvatar(owner, data.avatarId);
    const existing = await this.list(owner);
    if (existing.length >= MAX_CUSTOM_PEOPLE)
      throw new AppError(`You can keep up to ${MAX_CUSTOM_PEOPLE} people. Delete one in the app to make room.`, 409);
    const now = new Date().toISOString();
    return this.db.put<CustomPerson>(owner, PEOPLE_KIND, {
      id: randomUUID(),
      name: data.name,
      relation: data.relation ?? "",
      description: data.description ?? "",
      styleSummary: "",
      examples: [],
      nicknames: data.nicknames ?? [],
      languages: data.languages ?? [],
      facts: [],
      ...(data.voice ? { voice: data.voice } : {}),
      ...(data.avatarId ? { avatarId: data.avatarId } : {}),
      ...(data.passedAway !== undefined ? { passedAway: data.passedAway } : {}),
      createdAt: now,
      updatedAt: now,
    });
  }

  async update(owner: string, id: string, input: unknown): Promise<CustomPerson> {
    const current = await this.get(owner, id);
    if (!current) throw new AppError("I couldn't find that person. They may have been deleted.", 404);
    const { avatarId, ...patch } = customPersonPatch.parse(input);
    if (avatarId !== undefined && avatarId !== current.avatarId) await this.checkAvatar(owner, avatarId);
    const next: CustomPerson = { ...current, ...patch, id: current.id, updatedAt: new Date().toISOString() };
    if (avatarId === null) delete next.avatarId;
    else if (avatarId !== undefined) next.avatarId = avatarId;
    const problem = customPersonProblem(next);
    if (problem) throw new AppError(problem, 422);
    return this.db.put<CustomPerson>(owner, PEOPLE_KIND, next);
  }

  /** Save a profile the upload reader made. Only the reader calls this. */
  async saveProfile(owner: string, id: string, profile: Partial<CustomPerson>): Promise<CustomPerson | null> {
    const current = await this.get(owner, id);
    if (!current) return null;
    return this.db.put<CustomPerson>(owner, PEOPLE_KIND, { ...current, ...profile, id, updatedAt: new Date().toISOString() });
  }

  async remove(owner: string, id: string): Promise<boolean> {
    return Boolean(await this.db.take(owner, PEOPLE_KIND, id));
  }
}
