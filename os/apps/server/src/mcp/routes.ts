import { Hono } from "hono";
import { z } from "zod";
import type { McpService } from "./service.ts";

/**
 * What the app may see of a server. There is no secret and no sign-in token in it, only whether
 * one is saved. Fields are listed one by one, so nothing new slips out by accident.
 */
function view(server: Awaited<ReturnType<McpService["list"]>>[number]) {
  return {
    id: server.id,
    name: server.name,
    url: server.url,
    hasSecret: server.hasSecret,
    headerName: server.headerName,
    autoRead: server.autoRead,
    auth:
      server.auth === "oauth"
        ? ("sign-in" as const)
        : server.hasSecret
          ? ("key" as const)
          : ("none" as const),
    ...(server.auth === "oauth" ? { signedIn: Boolean(server.signedIn) } : {}),
    ...(server.preset ? { preset: server.preset } : {}),
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

const ReturnTo = z.enum(["web", "native"]).optional();

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
        auth: z.enum(["sign-in", "secret"]).optional(),
        preset: z.enum(["composio"]).optional(),
        to: ReturnTo,
      })
      .parse(await c.req.json().catch(() => ({})));
    const added = await service.add(c.get("owner"), body);
    // The sign-in page is a link for the person's browser, not a secret.
    return c.json(
      { ...view(added), ...(added.signInUrl ? { signInUrl: added.signInUrl } : {}) },
      201,
    );
  });
  app.post("/:id/refresh", async (c) =>
    c.json(view(await service.refresh(c.get("owner"), c.req.param("id")))),
  );
  app.post("/:id/sign-in", async (c) => {
    const body = z.object({ to: ReturnTo }).parse(await c.req.json().catch(() => ({})));
    return c.json(await service.startSignIn(c.get("owner"), c.req.param("id"), body.to ?? "web"));
  });
  app.delete("/:id/sign-in", async (c) =>
    c.json(view(await service.signOut(c.get("owner"), c.req.param("id")))),
  );
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

const PAGES = {
  success: {
    title: "You are signed in",
    text: "You can close this tab and go back to Debo. Your tool server is ready to use.",
  },
  failed: {
    title: "That did not finish",
    text: "Debo is not signed in to that server. Go back to Debo and choose Sign in again. If the link ran out, start a new one.",
  },
} as const;

/**
 * Where a tool server's sign-in page sends the person back. It is public (the browser arrives
 * without Debo's session), so the only thing it trusts is the signed, single-use state. It shows
 * only fixed words and never repeats anything from the request.
 */
export function mcpOAuthCallbackRoute(service: McpService, appUrl: string) {
  const app = new Hono();
  app.get("/", async (c) => {
    const state = c.req.query("state") ?? "";
    const code = c.req.query("code") ?? "";
    const failed = { ok: false, to: "web" as const };
    const result =
      state && code && !c.req.query("error")
        ? await service.finishSignIn(state, code).catch(() => failed)
        : failed;
    if (result.to === "native")
      return c.redirect(`debo://tool-servers?status=${result.ok ? "success" : "failed"}`, 302);
    const page = PAGES[result.ok ? "success" : "failed"];
    c.header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'");
    return c.html(
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${page.title}</title><style>body{font:16px/1.5 system-ui,sans-serif;max-width:30rem;margin:12vh auto;padding:0 1.25rem;color:#1c1b1f}a{display:inline-block;margin-top:1rem;padding:.75rem 1.25rem;border-radius:.75rem;background:#1c1b1f;color:#fff;text-decoration:none}</style></head><body><h1>${page.title}</h1><p>${page.text}</p><a href="${appUrl}">Back to Debo</a></body></html>`,
      result.ok ? 200 : 400,
    );
  });
  return app;
}
