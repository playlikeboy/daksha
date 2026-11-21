// The person's news feed: stories on the topics they follow, fetched by this server, ranked,
// and kept for a few hours.
//
//   news-cache   One row per person: the ranked stories, which topics they were for, when they
//                were fetched, and the optional "why" lines. Exported and deleted with the account.
//
// Only topic keywords leave the server (see topics.ts and sources.ts). Answers for one topic are
// shared for half an hour across everyone who follows it, because a topic says nothing about who
// asked; the ranked feed itself is always the person's own row.
import type { Store } from "../db.ts";
import { backgroundFailure } from "../log.ts";
import { type NewsStory, rankStories } from "./rank.ts";
import { type Fetch, type NewsSource, PoliteFetcher, type RawStory, SOURCES, type SourceName } from "./sources.ts";
import { keyOf, NEWS_TOPICS_KIND, type NewsTopicsRow, NewsTopicsStore, suggestTopics } from "./topics.ts";
import type { NewsWhy } from "./why.ts";

export const NEWS_CACHE_KIND = "news-cache";
const ROW_ID = "current";
/** A feed is fetched again after this long. */
export const REFRESH_MS = 3 * 3_600_000;
/** After a failed fetch, wait this long before trying again. */
const RETRY_MS = 20 * 60_000;
/** One topic's answer from one service is reused for this long, for everyone. */
const TOPIC_CACHE_MS = 30 * 60_000;
/** How many stories get a "why" line. */
export const WHY_STORIES = 6;
/** How many people the background loop refreshes in one pass. */
const PEOPLE_PER_TICK = 3;
export const FEED_MAX = 20;
export const WHY_LABEL = "Why it may interest you, written by AI from the headline";
export const ATTRIBUTION = "Found through the GDELT Project (gdeltproject.org) and Hacker News.";

export interface NewsCache {
  id: typeof ROW_ID;
  stories: NewsStory[];
  /** The topics this feed was made for, lower case. A change in topics makes it old. */
  topics: string[];
  /** When the stories were last fetched with at least one answer. */
  fetchedAt: string;
  /** When a fetch was last tried, even one that failed. */
  triedAt: string;
  /** Services that did not answer last time. */
  failed: SourceName[];
}

export interface NewsDeps {
  db: Store;
  fetch?: Fetch;
  /** Tests pass one with no gaps. */
  fetcher?: PoliteFetcher;
  sources?: readonly NewsSource[];
  why?: NewsWhy;
  /** Names from People in your life, so no topic can carry one. */
  names?: (owner: string) => Promise<string[]>;
  /** The person's own texts, read on this server only, to suggest topics. */
  texts?: (owner: string) => Promise<string[]>;
}

export interface Feed {
  stories: NewsStory[];
  topics: string[];
  fetchedAt: string | null;
  /** True while a fetch is still running; ask again in a little while. */
  refreshing: boolean;
  failed: SourceName[];
  whyLabel: string;
  attribution: string;
}

const sameTopics = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && [...a].sort().join("\n") === [...b].sort().join("\n");

export class NewsService {
  readonly topics: NewsTopicsStore;
  private readonly fetcher: PoliteFetcher;
  private readonly sources: readonly NewsSource[];
  private readonly shared = new Map<string, { at: number; stories: RawStory[] }>();
  private readonly running = new Map<string, Promise<NewsCache>>();
  private ticking = false;

  constructor(private readonly deps: NewsDeps) {
    this.topics = new NewsTopicsStore(deps.db, deps.names);
    this.fetcher = deps.fetcher ?? new PoliteFetcher(deps.fetch);
    this.sources = deps.sources ?? SOURCES;
  }

  async cached(owner: string): Promise<NewsCache | null> {
    return this.deps.db.get<NewsCache>(owner, NEWS_CACHE_KIND, ROW_ID);
  }

  /** Whether the saved feed should be fetched again. */
  needsRefresh(cache: NewsCache | null, row: NewsTopicsRow, now: Date): boolean {
    if (!row.topics.length) return false;
    if (!cache) return true;
    if (!sameTopics(cache.topics, row.topics.map((t) => keyOf(t.keyword)))) return true;
    const since = now.getTime() - Date.parse(cache.fetchedAt || "1970-01-01");
    const tried = now.getTime() - Date.parse(cache.triedAt || "1970-01-01");
    return since >= REFRESH_MS && tried >= RETRY_MS;
  }

  /**
   * The person's feed. A fresh saved feed comes back at once. An old one comes back too, with a
   * fetch started behind it. With none saved, this waits up to `waitMs` for the first fetch.
   */
  async feed(owner: string, options: { now?: Date; waitMs?: number; limit?: number } = {}): Promise<Feed> {
    const now = options.now ?? new Date();
    const limit = Math.min(FEED_MAX, Math.max(1, options.limit ?? FEED_MAX));
    const row = await this.topics.get(owner);
    const topics = row.topics.map((t) => t.keyword);
    const base = { topics, whyLabel: WHY_LABEL, attribution: ATTRIBUTION };
    if (!topics.length) return { ...base, stories: [], fetchedAt: null, refreshing: false, failed: [] };
    let cache = await this.cached(owner);
    let refreshing = false;
    if (this.needsRefresh(cache, row, now)) {
      const work = this.refresh(owner, now);
      const topicsChanged = cache && !sameTopics(cache.topics, row.topics.map((t) => keyOf(t.keyword)));
      if (!cache || topicsChanged) {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const waited = await Promise.race([
          work.catch(() => null),
          new Promise<null>((resolve) => {
            timer = setTimeout(() => resolve(null), options.waitMs ?? 12_000);
          }),
        ]).finally(() => clearTimeout(timer));
        if (waited) cache = waited;
        else refreshing = true;
      } else refreshing = true;
    }
    const followed = new Set(row.topics.map((t) => keyOf(t.keyword)));
    const stories = (cache?.stories ?? []).filter((s) => followed.has(keyOf(s.topic))).slice(0, limit);
    return {
      ...base,
      stories: row.why ? stories : stories.map(({ why: _w, ...s }) => s),
      fetchedAt: cache?.fetchedAt || null,
      refreshing: refreshing || this.running.has(owner),
      failed: cache?.failed ?? [],
    };
  }

  /** Fetches the feed again. Two calls at once share one fetch. Never throws for a source failure. */
  refresh(owner: string, now = new Date()): Promise<NewsCache> {
    const running = this.running.get(owner);
    if (running) return running;
    const work = this.build(owner, now).finally(() => this.running.delete(owner));
    // A caller that stopped waiting must not leave an unhandled failure behind.
    work.catch((error) => backgroundFailure("news refresh", error));
    this.running.set(owner, work);
    return work;
  }

  private async build(owner: string, now: Date): Promise<NewsCache> {
    const row = await this.topics.get(owner);
    const before = await this.cached(owner);
    const raw: RawStory[] = [];
    const failed = new Set<SourceName>();
    let answered = 0;
    for (const topic of row.topics) {
      for (const source of this.sources) {
        if (!source.covers(topic.keyword)) continue;
        try {
          raw.push(...(await this.ask(source, topic.keyword, now)));
          answered++;
        } catch {
          // Logged without the topic: only which service failed.
          failed.add(source.name);
        }
      }
    }
    const topics = row.topics.map((t) => keyOf(t.keyword));
    if (!answered && before) {
      // Nothing answered: keep the stories already saved, and try again later.
      return this.deps.db.put<NewsCache>(owner, NEWS_CACHE_KIND, { ...before, triedAt: now.toISOString(), failed: [...failed] });
    }
    let stories = rankStories(raw, now, FEED_MAX);
    if (row.why) stories = await this.withWhy(owner, stories, before);
    return this.deps.db.put<NewsCache>(owner, NEWS_CACHE_KIND, {
      id: ROW_ID,
      stories,
      topics,
      fetchedAt: answered ? now.toISOString() : (before?.fetchedAt ?? ""),
      triedAt: now.toISOString(),
      failed: [...failed],
    });
  }

  /** One service's answer for one topic, from the shared half-hour cache when it is there. */
  private async ask(source: NewsSource, topic: string, now: Date): Promise<RawStory[]> {
    const key = `${source.name}:${keyOf(topic)}`;
    const hit = this.shared.get(key);
    if (hit && now.getTime() - hit.at < TOPIC_CACHE_MS) return hit.stories.map((s) => ({ ...s, topic }));
    const stories = await this.fetcher.ask(source, topic, now);
    this.shared.set(key, { at: now.getTime(), stories });
    if (this.shared.size > 500) this.shared.delete(this.shared.keys().next().value as string);
    return stories;
  }

  /** "Why" lines for the top stories. Lines already written for a story are kept. */
  private async withWhy(owner: string, stories: NewsStory[], before: NewsCache | null): Promise<NewsStory[]> {
    const known = new Map((before?.stories ?? []).filter((s) => s.why).map((s) => [s.id, s.why as string]));
    const out = stories.map((s) => (known.has(s.id) ? { ...s, why: known.get(s.id) } : s));
    const missing = out.slice(0, WHY_STORIES).filter((s) => !s.why);
    if (!missing.length || !this.deps.why) return out;
    try {
      const lines = await this.deps.why(owner, missing.map((s) => ({ title: s.title, topic: s.topic })), AbortSignal.timeout(20_000));
      if (!lines) return out;
      const byId = new Map(missing.map((s, i) => [s.id, lines[i]?.trim()]));
      return out.map((s) => (byId.get(s.id) ? { ...s, why: byId.get(s.id) } : s));
    } catch (error) {
      backgroundFailure("news why lines", error);
      return out;
    }
  }

  /** "What's the news on X": a one-off search on a topic the person may not follow. Not saved. */
  async search(owner: string, topic: string, now = new Date(), limit = 8): Promise<NewsStory[]> {
    const keyword = await this.topics.check(owner, topic);
    const raw: RawStory[] = [];
    let answered = 0;
    let lastError: unknown;
    for (const source of this.sources) {
      if (!source.covers(keyword)) continue;
      try {
        raw.push(...(await this.ask(source, keyword, now)));
        answered++;
      } catch (error) {
        lastError = error;
      }
    }
    if (!answered) throw lastError instanceof Error ? lastError : new Error("No news service answered");
    return rankStories(raw, now, limit);
  }

  /**
   * The background loop's pass: refreshes a few people whose feed is old, oldest first. It returns
   * at once and works behind, so the polite gaps never hold up reminders. Never runs twice at once.
   */
  tick(now = new Date()): Promise<void> {
    if (this.ticking) return Promise.resolve();
    this.ticking = true;
    const work = (async () => {
      const rows = await this.deps.db.scan<NewsTopicsRow>(NEWS_TOPICS_KIND);
      const caches = new Map((await this.deps.db.scan<NewsCache>(NEWS_CACHE_KIND)).map((r) => [r.owner, r.value]));
      const due = rows
        .filter(({ owner, value }) => this.needsRefresh(caches.get(owner) ?? null, { ...value, topics: value.topics ?? [] } as NewsTopicsRow, now))
        .sort((a, b) => (caches.get(a.owner)?.triedAt ?? "").localeCompare(caches.get(b.owner)?.triedAt ?? ""))
        .slice(0, PEOPLE_PER_TICK);
      for (const { owner } of due) await this.refresh(owner, now).catch(() => undefined);
    })()
      .catch((error) => backgroundFailure("news upkeep", error))
      .finally(() => {
        this.ticking = false;
      });
    void work;
    return Promise.resolve();
  }

  /** For the settings card: what is followed, and topics to suggest from the person's own texts. */
  async topicsView(owner: string) {
    const row = await this.topics.get(owner);
    const texts = await this.deps.texts?.(owner).catch(() => []) ?? [];
    const suggestions = suggestTopics(texts, [...row.topics.map((t) => t.keyword), ...row.dismissed]);
    return { topics: row.topics, why: row.why, suggestions };
  }
}
