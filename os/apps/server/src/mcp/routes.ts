import { Hono } from "hono";
import { z } from "zod";
import type { McpService } from "./service.ts";

/** What the app may see of a server. There is no secret in it, only whether one is saved. */
function view(server: Awaited<ReturnType<McpService["list"]>>[number]) {
  return {
    id: server.id,
    name: server.name,
    url: server.url,
    hasSecret: server.hasSecret,
    headerName: server.headerName,
    autoRead: server.autoRead,
    tools: server.tools.map((t) => ({
      name: t.name,
      description: t.description,
      access: t.destructive ? "destructive" : t.readOnly ? "reads" : "changes",
    })),
    toolsAt: server.toolsAt,
    lastOk: server.lastOk,
    lastAt: server.lastAt,
    lastMessage: server.lastMessage,
    createdAt: server.createdAt,
  };
}

/** Signed-in routes. The owner always comes from the session. */
export function mcpRoutes(service: McpService) {
  const app = new Hono<{ Variables: { owner: string } }>();
  app.get("/", async (c) => c.json({ servers: (await service.list(c.get("owner"))).map(view) }));
  app.post("/", async (c) => {
    const body = z
      .object({
        name: z.string().trim().min(1).max(80),
        url: z.string().trim().min(1).max(600),
        secret: z.string().max(2000).optional(),
        headerName: z.string().trim().max(64).optional(),
      })
      .parse(await c.req.json().catch(() => ({})));
    return c.json(view(await service.add(c.get("owner"), body)), 201);
  });
  app.post("/:id/refresh", async (c) => c.json(view(await service.refresh(c.get("owner"), c.req.param("id")))));
  app.patch("/:id", async (c) => {
    const body = z.object({ autoRead: z.boolean() }).parse(await c.req.json().catch(() => ({})));
    return c.json(view(await service.setAutoRead(c.get("owner"), c.req.param("id"), body.autoRead)));
  });
  app.delete("/:id", async (c) => {
    await service.remove(c.get("owner"), c.req.param("id"));
    return c.json({ ok: true });
  });
  return app;
}
