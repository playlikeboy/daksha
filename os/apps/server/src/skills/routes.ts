import { Hono } from "hono";
import type { SkillsService } from "./service.ts";

/** GET /api/skills and PUT /api/skills/:name { enabled }. Mount after the owner sign-in check. */
export function skillRoutes(skills: SkillsService) {
  const app = new Hono<{ Variables: { owner: string } }>();
  app.get("/", async (c) => c.json({ skills: await skills.list(c.get("owner")) }));
  app.put("/:name", async (c) =>
    c.json({ skills: await skills.set(c.get("owner"), c.req.param("name"), await c.req.json()) }),
  );
  return app;
}
