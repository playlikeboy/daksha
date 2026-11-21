import { Hono } from "hono";
import { z } from "zod";
import { FEED_MAX, type NewsService } from "./service.ts";
import { KEYWORD_MAX, TOPICS_MAX } from "./topics.ts";

/**
 * GET /api/news (the person's feed), GET/PUT /api/news/topics (what they follow).
 * Mount after the owner sign-in check. Every read and write is the signed-in owner's own.
 */
export function newsRoutes(news: NewsService) {
  const app = new Hono<{ Variables: { owner: string } }>();
  app.get("/", async (c) => {
    const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(FEED_MAX).optional() }).parse(c.req.query());
    return c.json(await news.feed(c.get("owner"), { limit }));
  });
  const topicsView = async (owner: string) => ({
    ...(await news.topicsView(owner)),
    limits: { topicsMax: TOPICS_MAX, keywordMax: KEYWORD_MAX },
  });
  app.get("/topics", async (c) => c.json(await topicsView(c.get("owner"))));
  app.put("/topics", async (c) => {
    const owner = c.get("owner");
    const { suggestions } = await news.topicsView(owner);
    await news.topics.set(owner, await c.req.json(), suggestions);
    return c.json(await topicsView(owner));
  });
  return app;
}
