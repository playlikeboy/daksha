import { Hono } from "hono";
import { z } from "zod";
import { AppError } from "../errors.ts";
import type { TriggerService } from "./service.ts";

const MAX_BODY = 64 * 1024;

/** /api/triggers for the signed-in person. Mount AFTER the owner sign-in check. */
export function triggerRoutes(triggers: TriggerService) {
  const app = new Hono<{ Variables: { owner: string } }>();
  const id = (raw: string) => z.string().uuid().parse(raw);
  app.get("/", async (c) => {
    const owner = c.get("owner");
    return c.json({
      triggers: (await triggers.list(owner)).map((t) => triggers.view(t)),
      deleted: (await triggers.list(owner, { deleted: true })).map((t) => triggers.view(t)),
    });
  });
  app.post("/", async (c) => c.json(await triggers.create(c.get("owner"), await c.req.json()), 201));
  app.patch("/:id", async (c) => {
    const body = z.object({ enabled: z.boolean() }).parse(await c.req.json());
    return c.json(await triggers.setEnabled(c.get("owner"), id(c.req.param("id")), body.enabled));
  });
  app.delete("/:id", async (c) => c.json(await triggers.delete(c.get("owner"), id(c.req.param("id")))));
  app.post("/:id/restore", async (c) => c.json(await triggers.restore(c.get("owner"), id(c.req.param("id")))));
  app.get("/:id/secret", async (c) => c.json(await triggers.secret(c.get("owner"), id(c.req.param("id")))));
  return app;
}

async function rawBody(request: Request) {
  const text = await request.text();
  if (text.length > MAX_BODY) throw new AppError("Too large.", 413);
  return text;
}

/**
 * Public webhook addresses. Mount BEFORE the owner sign-in check: the caller proves itself
 * with a signature over the raw body, checked before anything is read.
 */
export function triggerHookRoutes(triggers: TriggerService) {
  const app = new Hono();
  app.post("/triggers/:hookId", async (c) =>
    c.json(await triggers.deliverWebhook(c.req.param("hookId"), await rawBody(c.req.raw), c.req.raw.headers)),
  );
  app.post("/composio", async (c) => c.json(await triggers.deliverAppEvent(await rawBody(c.req.raw), c.req.raw.headers)));
  return app;
}
