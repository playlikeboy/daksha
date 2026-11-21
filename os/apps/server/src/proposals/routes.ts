import { Hono } from "hono";
import { z } from "zod";
import type { ProposalService } from "./service.ts";

/** /api/proposals for the signed-in person. Mount AFTER the owner sign-in check. */
export function proposalRoutes(proposals: ProposalService) {
  const app = new Hono<{ Variables: { owner: string } }>();
  const id = (raw: string) => z.string().uuid().parse(raw);
  // Opening the list reads chats that went quiet first, so suggestions need no background loop.
  app.get("/", async (c) => {
    const owner = c.get("owner");
    await proposals.sweep(owner);
    return c.json({ proposals: await proposals.pending(owner) });
  });
  app.post("/skill", async (c) => {
    const body = z.object({ threadId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/) }).parse(await c.req.json());
    return c.json(await proposals.draftSkill(c.get("owner"), body.threadId), 201);
  });
  app.post("/:id/accept", async (c) =>
    c.json(await proposals.accept(c.get("owner"), id(c.req.param("id")), await c.req.json().catch(() => ({})))),
  );
  app.post("/:id/reject", async (c) => c.json(await proposals.reject(c.get("owner"), id(c.req.param("id")))));
  return app;
}
