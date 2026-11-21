// Turning many raw stories into a short, clean feed: one copy of each story, fresh first, close
// to the topic, from a mix of sites and topics, and no stories behind a hard paywall.
import { createHash } from "node:crypto";
import type { RawStory } from "./sources.ts";

export interface NewsStory {
  id: string;
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  image?: string;
  topic: string;
  from: RawStory["from"];
  /** A short AI-written line, when the person turned that on. Labelled in the app. */
  why?: string;
}

/** Sites where almost every story is behind a paywall. Skipped, because the link would not open. */
export const PAYWALLED = new Set([
  "wsj.com", "ft.com", "economist.com", "bloomberg.com", "barrons.com", "thetimes.co.uk", "telegraph.co.uk",
  "nytimes.com", "washingtonpost.com", "theinformation.com", "newyorker.com", "theathletic.com",
  "hbr.org", "businessinsider.com", "the-ken.com", "economictimes.indiatimes.com/prime",
]);

const TRACKING = /^(utm_[a-z]+|fbclid|gclid|mc_cid|mc_eid|ref|cmpid|ocid|taid|smid)$/i;

/** The same story under small differences in its address: tracking tags, www, a trailing slash, AMP. */
export function normalUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    u.hostname = u.hostname.replace(/^(www|m|amp)\./, "");
    for (const key of [...u.searchParams.keys()]) if (TRACKING.test(key) || key === "amp") u.searchParams.delete(key);
    u.pathname = u.pathname.replace(/\/amp\/?$/, "/").replace(/\.amp$/, "").replace(/\/+$/, "") || "/";
    u.protocol = "https:";
    return u.toString();
  } catch {
    return url.trim();
  }
}

export const storyId = (url: string) => createHash("sha256").update(normalUrl(url)).digest("hex").slice(0, 20);

/** "Big news today - BBC News" and "Big news today | Reuters" are the same headline. */
export function titleWords(title: string): Set<string> {
  const bare = title
    .replace(/\s[-–—|]\s[^-–—|]{2,40}$/, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ");
  return new Set(bare.split(/\s+/).filter((w) => w.length > 2));
}

/** How much two headlines share, from 0 to 1. */
export function similarity(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let both = 0;
  for (const w of a) if (b.has(w)) both++;
  return both / (a.size + b.size - both);
}

export function paywalled(story: Pick<RawStory, "url" | "source" | "title">): boolean {
  let host = story.source.toLocaleLowerCase().replace(/^www\./, "");
  let path = "";
  try {
    const u = new URL(story.url);
    host = u.hostname.replace(/^www\./, "");
    path = u.pathname;
  } catch {}
  for (const site of PAYWALLED) {
    const [domain, prefix] = site.split(/\/(.*)/);
    if ((host === domain || host.endsWith(`.${domain}`)) && (!prefix || path.startsWith(`/${prefix}`))) return true;
  }
  return /\b(subscribers? only|subscribe to read|premium story)\b/i.test(story.title);
}

const SAME_STORY = 0.6;
const HOUR = 3_600_000;

/** A score from freshness, how close the headline is to the topic, and Hacker News points. */
export function score(story: RawStory, now: Date): number {
  const age = Math.max(0, (now.getTime() - Date.parse(story.publishedAt)) / HOUR);
  const fresh = Math.exp(-age / 24);
  const topicWords = titleWords(story.topic);
  const title = titleWords(story.title);
  const inTitle = topicWords.size
    ? [...topicWords].filter((w) => title.has(w)).length / topicWords.size
    : story.title.toLocaleLowerCase().includes(story.topic.toLocaleLowerCase()) ? 1 : 0;
  const match = 0.5 + 0.5 * inTitle;
  const points = story.points ? Math.min(0.3, Math.log10(1 + story.points) / 10) : 0;
  return fresh * match + points;
}

/**
 * The feed: duplicates and paywalled stories dropped, then picked one at a time by score, with
 * each extra story from the same site or topic counting for less, at most two per site.
 */
export function rankStories(raw: readonly RawStory[], now: Date, limit = 20): NewsStory[] {
  const scored = raw
    .filter((s) => s.title && s.url && !paywalled(s) && Date.parse(s.publishedAt) <= now.getTime() + HOUR)
    .map((s) => ({ s, score: score(s, now), words: titleWords(s.title), url: normalUrl(s.url) }))
    .sort((a, b) => b.score - a.score);
  const kept: typeof scored = [];
  for (const item of scored) {
    const twin = kept.find((k) => k.url === item.url || similarity(k.words, item.words) >= SAME_STORY);
    if (twin) {
      // Keep the copy with a picture, when only the twin lacks one.
      if (!twin.s.image && item.s.image) twin.s = { ...twin.s, image: item.s.image };
      continue;
    }
    kept.push(item);
  }
  const picked: typeof kept = [];
  const perSite = new Map<string, number>();
  const perTopic = new Map<string, number>();
  const pool = [...kept];
  while (picked.length < limit && pool.length) {
    let best = -1;
    let bestScore = -Infinity;
    for (let i = 0; i < pool.length; i++) {
      const item = pool[i]!;
      const site = perSite.get(item.s.source) ?? 0;
      if (site >= 2) continue;
      const adjusted = item.score * 0.5 ** site * 0.75 ** (perTopic.get(item.s.topic.toLocaleLowerCase()) ?? 0);
      if (adjusted > bestScore) {
        bestScore = adjusted;
        best = i;
      }
    }
    if (best < 0) break;
    const [item] = pool.splice(best, 1);
    picked.push(item!);
    perSite.set(item!.s.source, (perSite.get(item!.s.source) ?? 0) + 1);
    const t = item!.s.topic.toLocaleLowerCase();
    perTopic.set(t, (perTopic.get(t) ?? 0) + 1);
  }
  return picked.map(({ s }) => ({
    id: storyId(s.url),
    title: s.title.slice(0, 300),
    url: s.url,
    source: s.source,
    publishedAt: s.publishedAt,
    ...(s.image ? { image: s.image } : {}),
    topic: s.topic,
    from: s.from,
  }));
}
