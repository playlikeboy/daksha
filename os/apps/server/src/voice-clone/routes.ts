import { Hono } from "hono";
import type { VoiceCopyService } from "./service.ts";

/**
 * Signed-in routes, mounted at /api/custom-people after the owner sign-in
 * check. The owner always comes from the session, and every record is looked
 * up by owner first, so nobody reaches another person's recordings.
 *
 *   GET    /:id/audio                      recordings waiting to be labelled
 *   POST   /:id/audio                      start an upload (needs { consent: true })
 *   POST   /:id/audio/:upload/complete     the file is up: start speaker separation
 *   GET    /:id/audio/:upload              status, voices, sample lines and a sample link
 *   POST   /:id/audio/:upload/labels       who is who; keeps their lines, optional voice copy
 *   DELETE /:id/audio/:upload              throw the recording away
 *   GET    /:id/voice                      the voice copy, and whether one can be made
 *   DELETE /:id/voice                      remove the voice copy, at Cartesia too
 */
export function voiceCopyRoutes(service: VoiceCopyService) {
  const app = new Hono<{ Variables: { owner: string } }>();
  const body = async (c: { req: { json(): Promise<unknown> } }) => c.req.json().catch(() => ({}));

  app.get("/:id/audio", async (c) => c.json({ available: service.available, uploads: await service.list(c.get("owner"), c.req.param("id")) }));
  app.post("/:id/audio", async (c) => c.json(await service.startUpload(c.get("owner"), c.req.param("id"), await body(c)), 201));
  app.post("/:id/audio/:upload/complete", async (c) =>
    c.json(await service.completeUpload(c.get("owner"), c.req.param("id"), c.req.param("upload"), await body(c))),
  );
  app.get("/:id/audio/:upload", async (c) => c.json(await service.status(c.get("owner"), c.req.param("id"), c.req.param("upload"))));
  app.post("/:id/audio/:upload/labels", async (c) =>
    c.json(await service.label(c.get("owner"), c.req.param("id"), c.req.param("upload"), await body(c))),
  );
  app.delete("/:id/audio/:upload", async (c) => {
    await service.discard(c.get("owner"), c.req.param("id"), c.req.param("upload"));
    return c.json({ ok: true });
  });
  app.get("/:id/voice", async (c) => c.json(await service.voiceState(c.get("owner"), c.req.param("id"))));
  app.delete("/:id/voice", async (c) => c.json(await service.removeVoice(c.get("owner"), c.req.param("id"))));
  return app;
}
