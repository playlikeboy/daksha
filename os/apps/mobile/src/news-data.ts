// The news feed from the API (apps/server/src/news): stories on the topics the person follows,
// and the topics themselves. An older API without news answers 404, which reads as no news.
import { z } from "zod";

export const newsStory = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string().url(),
  source: z.string(),
  publishedAt: z.string(),
  image: z.string().url().optional(),
  topic: z.string(),
  why: z.string().optional(),
});
export type NewsStory = z.infer<typeof newsStory>;

export const newsFeed = z.object({
  stories: z.array(z.unknown()).transform((list) => list.flatMap((s) => {
    const parsed = newsStory.safeParse(s);
    return parsed.success ? [parsed.data] : [];
  })),
  topics: z.array(z.string()),
  fetchedAt: z.string().nullable().optional(),
  refreshing: z.boolean().optional(),
  whyLabel: z.string().optional(),
  attribution: z.string().optional(),
});
export type NewsFeed = z.infer<typeof newsFeed>;

export const newsTopics = z.object({
  topics: z.array(z.object({ keyword: z.string(), from: z.enum(["you", "suggestion"]).optional() })),
  suggestions: z.array(z.string()),
  why: z.boolean(),
  limits: z.object({ topicsMax: z.number(), keywordMax: z.number() }).optional(),
});
export type NewsTopics = z.infer<typeof newsTopics>;

export const EMPTY_FEED: NewsFeed = { stories: [], topics: [] };

/** True for the error an API without news gives. */
export const notFound = (error: unknown) => error instanceof Error && /\(404\)|not found/i.test(error.message);

type Api = { request<T>(path: string, body?: unknown, method?: string): Promise<T> };

export async function loadNews(api: Api, limit?: number): Promise<NewsFeed> {
  try {
    return newsFeed.parse(await api.request(`/api/news${limit ? `?limit=${limit}` : ""}`));
  } catch (error) {
    if (notFound(error)) return EMPTY_FEED;
    throw error;
  }
}

export async function loadTopics(api: Api): Promise<NewsTopics | null> {
  try {
    return newsTopics.parse(await api.request("/api/news/topics"));
  } catch (error) {
    if (notFound(error)) return null;
    throw error;
  }
}

export async function saveTopics(api: Api, patch: { topics?: string[]; why?: boolean; dismiss?: string }): Promise<NewsTopics> {
  return newsTopics.parse(await api.request("/api/news/topics", patch, "PUT"));
}

/** "bbc.co.uk" from "www.bbc.co.uk". */
export const siteName = (source: string) => source.replace(/^www\./, "");

/** Only web links open from a story card. */
export const safeLink = (url: string) => (/^https?:\/\//i.test(url) ? url : null);
