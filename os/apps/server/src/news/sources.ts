// Where the news comes from (decision 37). Both are free, need no key, and allow this use:
//
//   GDELT DOC 2.0   api.gdeltproject.org   Any topic, many languages, worldwide. GDELT's data is
//                                          free for any use, commercial too, with a citation to
//                                          the GDELT Project. Asked to keep to about one request
//                                          every five seconds.
//   Hacker News     hn.algolia.com         Technology topics only (AI, programming, startups...).
//                                          The HN Search API by Algolia, no key, generous limits.
//
// The only thing sent is the topic keyword (checked in topics.ts). The server makes the call, so
// the person's device address never reaches a news service. Requests go one at a time per
// service with a gap between them, each with a timeout and a size cap. Story text is data,
// never instructions.
import { z } from "zod";

export interface RawStory {
  title: string;
  url: string;
  /** The site, like "bbc.co.uk". */
  source: string;
  publishedAt: string;
  image?: string;
  snippet?: string;
  /** The followed topic this story was found for. */
  topic: string;
  from: SourceName;
  /** Hacker News points, when known. */
  points?: number;
}

export type SourceName = "gdelt" | "hn";
export type Fetch = (url: string, init: { signal: AbortSignal; headers: Record<string, string> }) => Promise<Response>;

export interface NewsSource {
  name: SourceName;
  /** Whether this source is worth asking about this topic. */
  covers(topic: string): boolean;
  /** The exact address asked. Holds only the topic keyword. */
  url(topic: string, now: Date): string;
  parse(body: unknown, topic: string): RawStory[];
}

const TIMEOUT_MS = 10_000;
const BODY_MAX = 1024 * 1024;
const HEADERS = { Accept: "application/json", "User-Agent": "Daksha news (+https://daksha.life)" };

/**
 * GDELT turns down words shorter than three letters, so short topics get a longer phrase.
 * The phrase says the same thing; it never adds anything about the person.
 */
const GDELT_PHRASES: Record<string, string> = {
  ai: '"artificial intelligence"',
  f1: '"Formula 1"',
  ev: '"electric vehicle"',
  evs: '"electric vehicles"',
  uk: '"United Kingdom"',
  us: '"United States"',
  ipl: '"Indian Premier League"',
};

export function gdeltTerms(topic: string): string {
  const words = topic.trim().split(/\s+/);
  const phrased = words.map((w) => GDELT_PHRASES[w.toLocaleLowerCase()] ?? w);
  // Words side by side must all appear ("Bengaluru weather"), in any order.
  return phrased.join(" ");
}

const gdeltArticle = z.object({
  url: z.string().url(),
  title: z.string().min(1),
  seendate: z.string().regex(/^\d{8}T\d{6}Z$/),
  socialimage: z.string().optional(),
  domain: z.string().optional(),
  language: z.string().optional(),
});

/** "20261121T101500Z" to an ISO instant. */
export function gdeltDate(seen: string): string {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(seen);
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}.000Z` : new Date(0).toISOString();
}

const httpsOnly = (text: string | undefined) => (text && /^https:\/\//i.test(text) ? text : undefined);
const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

export const gdelt: NewsSource = {
  name: "gdelt",
  covers: () => true,
  url(topic) {
    // English sources for an English-letters topic; any language for one in another script.
    const ascii = /^[\x20-\x7e]+$/.test(topic);
    const query = `${gdeltTerms(topic)}${ascii ? " sourcelang:english" : ""}`;
    const params = new URLSearchParams({ query, mode: "artlist", format: "json", maxrecords: "30", timespan: "2d", sort: "datedesc" });
    return `https://api.gdeltproject.org/api/v2/doc/doc?${params}`;
  },
  parse(body, topic) {
    const list = z.object({ articles: z.array(z.unknown()).optional() }).safeParse(body);
    if (!list.success) return [];
    const out: RawStory[] = [];
    for (const raw of list.data.articles ?? []) {
      const a = gdeltArticle.safeParse(raw);
      if (!a.success) continue;
      out.push({
        title: a.data.title.trim(),
        url: a.data.url,
        source: a.data.domain || hostOf(a.data.url),
        publishedAt: gdeltDate(a.data.seendate),
        ...(httpsOnly(a.data.socialimage) ? { image: httpsOnly(a.data.socialimage) } : {}),
        topic,
        from: "gdelt",
      });
    }
    return out;
  },
};

/** Topics Hacker News is good for. Anything else goes to GDELT only. */
const TECH = new Set([
  "ai", "artificial intelligence", "programming", "startups", "startup", "tech", "technology", "software",
  "open source", "javascript", "typescript", "python", "rust", "linux", "security", "cybersecurity",
  "machine learning", "llm", "llms", "crypto", "space", "science", "smartphones", "apple", "google",
  "web development", "databases", "gaming", "electric cars", "robotics",
]);

const hnHit = z.object({
  objectID: z.string(),
  title: z.string().min(1).nullish(),
  url: z.string().url().nullish(),
  created_at: z.string(),
  points: z.number().nullish(),
});

export const hackerNews: NewsSource = {
  name: "hn",
  covers: (topic) => TECH.has(topic.trim().toLocaleLowerCase()),
  url(topic, now) {
    const since = Math.floor(now.getTime() / 1000) - 2 * 86_400;
    const params = new URLSearchParams({ query: topic, tags: "story", numericFilters: `created_at_i>${since}`, hitsPerPage: "20" });
    return `https://hn.algolia.com/api/v1/search_by_date?${params}`;
  },
  parse(body, topic) {
    const list = z.object({ hits: z.array(z.unknown()).optional() }).safeParse(body);
    if (!list.success) return [];
    const out: RawStory[] = [];
    for (const raw of list.data.hits ?? []) {
      const h = hnHit.safeParse(raw);
      if (!h.success || !h.data.title) continue;
      // An "Ask HN" with no link opens its discussion page.
      const url = h.data.url ?? `https://news.ycombinator.com/item?id=${encodeURIComponent(h.data.objectID)}`;
      out.push({
        title: h.data.title.trim(),
        url,
        source: hostOf(url),
        publishedAt: new Date(Date.parse(h.data.created_at) || 0).toISOString(),
        topic,
        from: "hn",
        ...(typeof h.data.points === "number" ? { points: h.data.points } : {}),
      });
    }
    return out;
  },
};

export const SOURCES: readonly NewsSource[] = [gdelt, hackerNews];

/** The smallest gap between two requests to the same service. GDELT asks for five seconds. */
export const GAPS_MS: Record<SourceName, number> = { gdelt: 5_500, hn: 1_000 };

/**
 * One request at a time per service, with a gap between them, a timeout and a size cap.
 * Shared by everyone on this server, so the gap holds however many people refresh at once.
 */
export class PoliteFetcher {
  private readonly last = new Map<SourceName, Promise<number>>();
  constructor(
    private readonly fetcher: Fetch = (url, init) => fetch(url, init),
    private readonly gaps: Record<SourceName, number> = GAPS_MS,
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {}

  /** Asks one source about one topic. Throws on a network error, a timeout or a bad answer. */
  async ask(source: NewsSource, topic: string, now: Date, signal?: AbortSignal): Promise<RawStory[]> {
    const turn = this.turn(source.name);
    await turn.ready;
    try {
      signal?.throwIfAborted();
      const timeout = AbortSignal.timeout(TIMEOUT_MS);
      const both = signal ? AbortSignal.any([signal, timeout]) : timeout;
      const response = await this.fetcher(source.url(topic, now), { signal: both, headers: HEADERS });
      if (!response.ok) throw new Error(`${source.name} answered ${response.status}`);
      const text = await response.text();
      if (text.length > BODY_MAX) throw new Error(`${source.name} answer too large`);
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        // GDELT answers a refused query with plain words, not JSON.
        throw new Error(`${source.name} did not answer with JSON`);
      }
      return source.parse(body, topic);
    } finally {
      turn.done();
    }
  }

  private turn(name: SourceName) {
    const before = this.last.get(name) ?? Promise.resolve(0);
    let done!: () => void;
    const finished = new Promise<number>((resolve) => {
      done = () => resolve(Date.now());
    });
    this.last.set(name, finished);
    const ready = before.then(async (at) => {
      const wait = at + this.gaps[name] - Date.now();
      if (at && wait > 0) await this.sleep(wait);
    });
    return { ready, done };
  }
}
