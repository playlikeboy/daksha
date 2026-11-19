import { Hono } from "hono";
import { PersonaStore } from "../persona.ts";
import { VOICES } from "../talk-settings.ts";
import { FACT_SOURCES, MAX_CUSTOM_PEOPLE } from "./store.ts";
import type { CustomPeopleService } from "./service.ts";
import { CONSENT_TEXT, SOURCE_LIMITS } from "./uploads.ts";

/**
 * /api/custom-people, for the app. Mount after the owner sign-in check: every route acts on the
 * signed-in owner only, and a person or upload of someone else is "not found".
 * Deleting a person is here only, never a chat tool.
 */
export function customPeopleRoutes(service: CustomPeopleService) {
  const app = new Hono<{ Variables: { owner: string } }>();
  app.get("/", async (c) => {
    const owner = c.get("owner");
    const [people, persona, canRead] = await Promise.all([
      service.people.list(owner),
      new PersonaStore(service.db).get(owner).catch(() => null),
      service.canRead(owner),
    ]);
    return c.json({
      people,
      activeId: persona?.customPersonId ?? null,
      canRead,
      consentText: CONSENT_TEXT,
      factSources: FACT_SOURCES,
      voices: VOICES,
      limits: {
        people: MAX_CUSTOM_PEOPLE,
        ...Object.fromEntries(Object.entries(SOURCE_LIMITS).map(([k, v]) => [k, { maxFiles: v.maxFiles, maxBytes: v.maxBytes, types: v.types }])),
      },
    });
  });
  app.post("/", async (c) => c.json({ person: await service.people.create(c.get("owner"), await c.req.json()) }, 201));
  app.get("/:id", async (c) => {
    const person = await service.people.get(c.get("owner"), c.req.param("id"));
    if (!person) return c.json({ error: "I couldn't find that person. They may have been deleted." }, 404);
    return c.json({ person });
  });
  app.put("/:id", async (c) =>
    c.json({ person: await service.people.update(c.get("owner"), c.req.param("id"), await c.req.json()) }),
  );
  app.delete("/:id", async (c) => {
    await service.remove(c.get("owner"), c.req.param("id"));
    return c.json({ ok: true });
  });
  // "Talk to them": Daksha talks as this person in chat and on calls until stopped.
  app.post("/:id/talk", async (c) => c.json({ person: await service.talkAs(c.get("owner"), c.req.param("id")) }));
  app.post("/:id/sources", async (c) =>
    c.json(await service.startSources(c.get("owner"), c.req.param("id"), await c.req.json()), 201),
  );
  app.post("/:id/sources/:upload/complete", async (c) =>
    c.json(
      await service.completeSources(
        c.get("owner"),
        c.req.param("id"),
        c.req.param("upload"),
        await c.req.json().catch(() => ({})),
      ),
    ),
  );
  app.post("/:id/sources/:upload/sender", async (c) =>
    c.json(await service.chooseSender(c.get("owner"), c.req.param("id"), c.req.param("upload"), await c.req.json())),
  );
  app.get("/:id/status", async (c) => c.json(await service.status(c.get("owner"), c.req.param("id"))));
  return app;
}
