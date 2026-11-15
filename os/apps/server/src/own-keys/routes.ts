import { Hono } from "hono";
import { z } from "zod";
import { KEY_PROVIDERS, keyView, MODEL_CHOICES, type OwnKeysService } from "./service.ts";

const Provider = z.enum(KEY_PROVIDERS);

/** Signed-in routes. The owner always comes from the session. No answer ever carries a key. */
export function ownKeyRoutes(service: OwnKeysService) {
  const app = new Hono<{ Variables: { owner: string } }>();
  app.get("/", async (c) =>
    c.json({
      available: service.available,
      keys: (await service.list(c.get("owner"))).map(keyView),
      choices: MODEL_CHOICES,
    }),
  );
  app.put("/:provider", async (c) => {
    const provider = Provider.parse(c.req.param("provider"));
    const body = z
      .object({
        key: z.string().max(400).optional(),
        model: z.string().max(200).optional(),
        imageModel: z.string().max(200).optional(),
      })
      .parse(await c.req.json().catch(() => ({})));
    const row = await service.save(c.get("owner"), provider, body);
    return c.json({ key: keyView(row), message: "Checked and saved. It works." });
  });
  app.delete("/:provider", async (c) => {
    await service.remove(c.get("owner"), Provider.parse(c.req.param("provider")));
    return c.json({ ok: true });
  });
  return app;
}
