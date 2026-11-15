import { Hono } from "hono";
import { z } from "zod";
import type { Store } from "./db.ts";

/**
 * Whether the person has seen the welcome steps, so they show once per person and not
 * again on every phone or browser they sign in from. One record per person, kind
 * `onboarding`. It holds only whether they finished or skipped, and when. Nothing they
 * typed during the welcome is kept here: names and entries are saved where they always
 * are. Like every record, it is in the person's download and deleted with the account.
 */
export interface Onboarding {
  id: "current";
  status: "finished" | "skipped";
  updatedAt: string;
}

const KIND = "onboarding";

export const onboardingInput = z.object({ status: z.enum(["finished", "skipped"]) });

export class OnboardingStore {
  constructor(private readonly db: Store) {}

  async get(owner: string): Promise<Onboarding | null> {
    return this.db.get<Onboarding>(owner, KIND, "current");
  }

  async set(owner: string, input: unknown): Promise<Onboarding> {
    const { status } = onboardingInput.parse(input);
    return this.db.put<Onboarding>(owner, KIND, { id: "current", status, updatedAt: new Date().toISOString() });
  }

  /** "Show the welcome again" from the menu: forget that it was seen. */
  async reset(owner: string): Promise<void> {
    await this.db.remove(owner, KIND, "current");
  }
}

/** GET/PUT/DELETE /api/onboarding. Mount after the owner sign-in check. */
export function onboardingRoutes(store: OnboardingStore) {
  const app = new Hono<{ Variables: { owner: string } }>();
  app.get("/", async (c) => c.json({ onboarding: await store.get(c.get("owner")) }));
  app.put("/", async (c) => c.json({ onboarding: await store.set(c.get("owner"), await c.req.json()) }));
  app.delete("/", async (c) => {
    await store.reset(c.get("owner"));
    return c.json({ onboarding: null });
  });
  return app;
}
