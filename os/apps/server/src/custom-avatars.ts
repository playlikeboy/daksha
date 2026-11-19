import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import type { AgentIdentity } from "../../../packages/domain/src/agent.ts";
import {
  AVATARS_MAX,
  avatarConfigSchema,
  type AvatarPronoun,
  type CustomAvatar,
} from "../../../packages/domain/src/avatar.ts";
import type { Store } from "./db.ts";
import { AppError } from "./errors.ts";

/**
 * Faces the person designed in the avatar builder (decision 33). One record per face in
 * the `custom-avatars` kind, up to `AVATARS_MAX`. Each is only drawing data (shape,
 * colours, hair, accessories, a name and a pronoun): no photo and nothing about anyone
 * real. The person can see, change and delete every one, and they are part of the
 * account export and account deletion like every other kind in the records table.
 *
 * Other parts of Daksha (custom people) link to a face by its record id and read it with
 * `CustomAvatarStore.get`, which only ever returns the owner's own faces.
 */
export const AVATARS_KIND = "custom-avatars";

export class CustomAvatarStore {
  constructor(private readonly db: Store) {}

  async list(owner: string): Promise<CustomAvatar[]> {
    const avatars = await this.db.list<CustomAvatar>(owner, AVATARS_KIND);
    return avatars.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async get(owner: string, id: string): Promise<CustomAvatar | null> {
    return this.db.get<CustomAvatar>(owner, AVATARS_KIND, id);
  }

  async add(owner: string, input: unknown): Promise<CustomAvatar> {
    const config = avatarConfigSchema.parse(input);
    if ((await this.list(owner)).length >= AVATARS_MAX)
      throw new AppError(`You can keep up to ${AVATARS_MAX} faces. Delete one first.`, 422);
    const now = new Date().toISOString();
    return this.db.put<CustomAvatar>(owner, AVATARS_KIND, { ...config, id: randomUUID(), createdAt: now, updatedAt: now });
  }

  /** Replaces a face with what the builder sent. */
  async update(owner: string, id: string, input: unknown): Promise<CustomAvatar> {
    const old = await this.get(owner, id);
    if (!old) throw new AppError("That face is not saved any more.", 404);
    const config = avatarConfigSchema.parse(input);
    return this.db.put<CustomAvatar>(owner, AVATARS_KIND, {
      ...config,
      id: old.id,
      createdAt: old.createdAt,
      updatedAt: new Date().toISOString(),
    });
  }

  /**
   * Deletes a face. If the person was talking to it, they go back to Daksha, so the app
   * never points at a face that is gone.
   */
  async remove(owner: string, id: string): Promise<void> {
    await this.db.remove(owner, AVATARS_KIND, id);
    await this.db.compareAndSwap<AgentIdentity>(
      owner,
      "agent-settings",
      "identity",
      { character: "custom", customAvatar: id },
      { character: "debo" },
    );
  }
}

/**
 * Who the person talks to, as the voice needs it: the character, and for a face they
 * made, the pronoun they picked (which sets the voice it starts with).
 */
export async function voiceCharacterOf(
  db: Store,
  owner: string,
): Promise<{ character?: string; pronoun?: AvatarPronoun }> {
  const identity = await db.get<AgentIdentity>(owner, "agent-settings", "identity").catch(() => null);
  if (identity?.character !== "custom" || !identity.customAvatar) return { character: identity?.character };
  const avatar = await db.get<CustomAvatar>(owner, AVATARS_KIND, identity.customAvatar).catch(() => null);
  return { character: "custom", pronoun: avatar?.pronoun };
}

/** GET/POST /api/custom-avatars, GET/PUT/DELETE /api/custom-avatars/:id. Mount after the owner sign-in check. */
export function customAvatarRoutes(store: CustomAvatarStore) {
  const app = new Hono<{ Variables: { owner: string } }>();
  app.get("/", async (c) => c.json({ avatars: await store.list(c.get("owner")), limits: { max: AVATARS_MAX } }));
  app.post("/", async (c) => c.json({ avatar: await store.add(c.get("owner"), await c.req.json()) }, 201));
  app.get("/:id", async (c) => {
    const avatar = await store.get(c.get("owner"), c.req.param("id"));
    if (!avatar) throw new AppError("That face is not saved any more.", 404);
    return c.json({ avatar });
  });
  app.put("/:id", async (c) =>
    c.json({ avatar: await store.update(c.get("owner"), c.req.param("id"), await c.req.json()) }),
  );
  app.delete("/:id", async (c) => {
    await store.remove(c.get("owner"), c.req.param("id"));
    return c.json({ ok: true });
  });
  return app;
}
