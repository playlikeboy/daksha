// The shape of the personal news feed (`GET /api/news`). The route is being built on its own
// branch; until it is live the server answers 404 and Home shows no news at all.
// Pure: no React, so a test can check the parsing.
import { z } from "zod";

export const newsItem = z.object({
  id: z.string(),
  title: z.string(),
  /** One or two plain sentences. */
  summary: z.string().default(""),
  /** Who published it ("The Hindu"), shown under the title as the source. */
  source: z.string(),
  /** The original article. Opening it leaves Daksha, so it is shown as a link. */
  url: z.string().url(),
  publishedAt: z.string(),
  /** Why it is in this person's feed ("You wrote about running"), when the server says. */
  reason: z.string().optional(),
  imageUrl: z.string().url().optional(),
});
export type NewsItem = z.infer<typeof newsItem>;

export const newsReply = z.object({ items: z.array(newsItem) });
export type NewsReply = z.infer<typeof newsReply>;

/** What Home does with the feed: nothing (no route yet), a list, or a quiet error. */
export type NewsState =
  | { kind: "loading" }
  | { kind: "absent" }
  | { kind: "ready"; items: NewsItem[] }
  | { kind: "error" };

/**
 * Reads one response from /api/news. A 404 (the route is not built yet) and a 501 mean
 * "absent", so Home shows nothing. A reply that does not fit the shape is an error, never
 * a half-drawn card.
 */
export async function readNews(response: Pick<Response, "status" | "ok" | "json">): Promise<NewsState> {
  if (response.status === 404 || response.status === 501) return { kind: "absent" };
  if (!response.ok) return { kind: "error" };
  try {
    const parsed = newsReply.safeParse(await response.json());
    return parsed.success ? { kind: "ready", items: parsed.data.items } : { kind: "error" };
  } catch {
    return { kind: "error" };
  }
}
