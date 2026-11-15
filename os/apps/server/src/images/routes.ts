import { defineTool } from "@copilotkit/runtime/v2";
import { Hono } from "hono";
import { AppError } from "../errors.ts";
import { makeImageDescription, makeImageInput, type ImageService } from "./service.ts";

/** Signed-in routes for the person's own pictures. The owner always comes from the session. */
export function imageRoutes(images: ImageService) {
  const app = new Hono<{ Variables: { owner: string } }>();
  app.get("/", async (c) =>
    c.json({
      images: (await images.list(c.get("owner"))).map((r) => ({
        id: r.id,
        prompt: r.prompt,
        shape: r.shape,
        provider: r.provider,
        createdAt: r.createdAt,
      })),
    }),
  );
  // A fresh link each time: links expire, and a thread shows the same picture again later.
  app.get("/:id", async (c) => c.json(await images.link(c.get("owner"), c.req.param("id"))));
  app.delete("/:id", async (c) => {
    await images.remove(c.get("owner"), c.req.param("id"));
    return c.json({ ok: true });
  });
  return app;
}

/**
 * The make_image tool. It only changes the person's own data inside Debo, so it needs no
 * review (decision 28). The result names the picture; the app fetches a link to show it.
 */
export function imageTools(images: ImageService, owner: string, channel: "chat" | "voice", signal?: AbortSignal) {
  return [
    defineTool({
      name: "make_image",
      description: makeImageDescription,
      parameters: makeImageInput,
      execute: async (args) => {
        try {
          const made = await images.make(owner, args, signal);
          return {
            status: "made",
            imageId: made.id,
            shape: made.shape,
            ...(args.shape && args.shape !== made.shape
              ? { note: "Only square pictures are possible with Debo's own picture service." }
              : {}),
            shown: channel === "voice" ? "The picture is waiting in Chat." : "The picture is shown in the chat.",
          };
        } catch (error) {
          return { status: "failed", error: error instanceof AppError ? error.message : "I couldn't make that picture." };
        }
      },
    }),
  ];
}
