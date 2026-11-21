// The topics a person follows for their news, and the checks that keep them generic.
//
//   news-topics   One row per person: the topics they follow ("cricket", "AI", "Bengaluru
//                 weather"), the suggestions they put away, and whether they want a short
//                 "why this may interest you" line under each story.
//
// Privacy: a topic is the only thing Daksha ever sends to a news service. So a topic must be a
// short, generic keyword the person chose. It can't hold a name of someone in People in your
// life, words like "my" or "mum", an email, a web address, a phone number or a long sentence.
// Suggestions come from a fixed list of generic topics matched against the person's own
// entries on this server; the entries themselves never leave, and a suggestion is only
// followed when the person accepts it.
import { z } from "zod";
import type { Store } from "../db.ts";
import { AppError } from "../errors.ts";

export const NEWS_TOPICS_KIND = "news-topics";
const ROW_ID = "current";
export const TOPICS_MAX = 12;
export const KEYWORD_MAX = 40;
const WORDS_MAX = 4;

export interface NewsTopic {
  keyword: string;
  addedAt: string;
  /** "you" when typed or asked for; "suggestion" when the person accepted one Daksha offered. */
  from: "you" | "suggestion";
}

export interface NewsTopicsRow {
  id: typeof ROW_ID;
  topics: NewsTopic[];
  /** Suggestions the person put away. They are not offered again. */
  dismissed: string[];
  /** A short AI-written line under each story. Off unless the person turns it on. */
  why: boolean;
  updatedAt: string;
}

const EMPTY: NewsTopicsRow = { id: ROW_ID, topics: [], dismissed: [], why: false, updatedAt: "" };

/** Words that point at the person's own life, not a public topic. */
const PERSONAL_WORDS = new Set([
  // Not "us" or "we": "US elections" is a fine topic.
  "i", "me", "my", "mine", "myself", "our", "you", "your",
  "mum", "mom", "mother", "dad", "father", "papa", "mummy", "wife", "husband", "son", "daughter",
  "brother", "sister", "girlfriend", "boyfriend", "friend", "boss", "aunt", "uncle", "grandma", "grandpa",
  "diary", "journal", "password", "address",
]);

/** One spacing, no fences, no odd quotes. The person's capital letters are kept for display. */
export function cleanKeyword(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f"“”`<>{}[\]\\|^~*_=;:!?,()]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export const keyOf = (keyword: string) => cleanKeyword(keyword).toLocaleLowerCase();

/**
 * Why a keyword can't be a topic, in plain words, or null when it is fine. `people` are the
 * names saved in People in your life: no topic may contain one.
 */
export function keywordProblem(keyword: string, people: readonly string[] = []): string | null {
  const clean = cleanKeyword(keyword);
  if (clean.length < 2) return "A topic needs at least two letters, like cricket or AI.";
  if (clean.length > KEYWORD_MAX) return `Keep a topic short, under ${KEYWORD_MAX} letters, like "electric cars".`;
  if (/@|https?:|www\.|\.(com|in|org|net)\b/i.test(clean)) return "A topic can't be an email or a web address.";
  if (/\d[\d\s-]{4,}\d/.test(clean)) return "A topic can't hold a long number, like a phone number.";
  if (!/^[\p{L}\p{M}\p{N} &+.'#-]+$/u.test(clean)) return "Use letters and numbers only, like cricket or AI.";
  const words = clean.toLocaleLowerCase().split(" ");
  if (words.length > WORDS_MAX) return `Keep a topic to ${WORDS_MAX} words or fewer, like "Bengaluru weather".`;
  if (words.some((w) => PERSONAL_WORDS.has(w.replace(/'s$/, ""))))
    return "A topic should be about the world, not about you or your family, so nothing personal goes to a news service.";
  for (const name of people) {
    const parts = cleanKeyword(name).toLocaleLowerCase().split(" ").filter((p) => p.length >= 2);
    if (parts.some((p) => words.includes(p)))
      return "That topic has the name of someone in People in your life. Names are never sent to news services.";
  }
  return null;
}

/**
 * Generic topics Daksha can suggest, each with the words that hint at it. Every suggestion
 * is one of these keywords, so a suggestion can never carry the person's own words.
 */
export const SUGGESTABLE: readonly { keyword: string; hints: readonly string[] }[] = [
  { keyword: "cricket", hints: ["cricket", "ipl", "t20", "odi", "test match", "wicket"] },
  { keyword: "football", hints: ["football", "premier league", "fifa", "isl", "la liga"] },
  { keyword: "tennis", hints: ["tennis", "wimbledon", "grand slam"] },
  { keyword: "Formula 1", hints: ["formula 1", "f1", "grand prix"] },
  { keyword: "AI", hints: ["ai", "chatgpt", "machine learning", "llm", "claude", "artificial intelligence"] },
  { keyword: "startups", hints: ["startup", "startups", "founder", "funding round", "pitch deck", "investors"] },
  { keyword: "programming", hints: ["coding", "programming", "javascript", "python", "typescript", "github"] },
  { keyword: "smartphones", hints: ["iphone", "android phone", "pixel", "smartphone", "galaxy"] },
  { keyword: "stock market", hints: ["stocks", "sensex", "nifty", "shares", "mutual fund", "stock market"] },
  { keyword: "crypto", hints: ["crypto", "bitcoin", "ethereum"] },
  { keyword: "electric cars", hints: ["electric car", "ev", "tesla", "charging station"] },
  { keyword: "space", hints: ["isro", "nasa", "rocket", "space station", "spacex", "moon mission"] },
  { keyword: "climate", hints: ["climate", "heatwave", "monsoon", "pollution", "aqi"] },
  { keyword: "movies", hints: ["movie", "movies", "film", "cinema", "bollywood", "netflix"] },
  { keyword: "music", hints: ["concert", "album", "song", "spotify", "music"] },
  { keyword: "books", hints: ["novel", "book club", "reading", "kindle"] },
  { keyword: "gaming", hints: ["gaming", "playstation", "xbox", "nintendo", "video game"] },
  { keyword: "fitness", hints: ["gym", "workout", "marathon", "running", "yoga"] },
  { keyword: "food", hints: ["recipe", "cooking", "baking", "restaurant"] },
  { keyword: "travel", hints: ["trip", "flight", "travel", "holiday", "vacation"] },
  { keyword: "photography", hints: ["photography", "camera", "lens"] },
  { keyword: "science", hints: ["science", "physics", "biology", "research paper"] },
];

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const hintPatterns = SUGGESTABLE.map((s) => ({
  keyword: s.keyword,
  pattern: new RegExp(`(^|[^\\p{L}\\p{N}])(${s.hints.map(escapeRegex).join("|")})(?=$|[^\\p{L}\\p{N}])`, "giu"),
}));

/**
 * Up to `max` suggestions from the person's own texts, read here and never sent anywhere.
 * A topic needs at least two hints. Followed and put-away topics are left out.
 */
export function suggestTopics(texts: readonly string[], skip: readonly string[], max = 5): string[] {
  const skipped = new Set(skip.map(keyOf));
  const counts: { keyword: string; n: number }[] = [];
  for (const { keyword, pattern } of hintPatterns) {
    if (skipped.has(keyOf(keyword))) continue;
    let n = 0;
    for (const text of texts) n += text.match(pattern)?.length ?? 0;
    if (n >= 2) counts.push({ keyword, n });
  }
  return counts
    .sort((a, b) => b.n - a.n)
    .slice(0, max)
    .map((c) => c.keyword);
}

export const topicsInput = z
  .object({
    topics: z.array(z.string().max(200)).max(TOPICS_MAX, `You can follow up to ${TOPICS_MAX} topics.`),
    why: z.boolean(),
    /** A suggestion to put away for good. */
    dismiss: z.string().max(200),
  })
  .partial();

export class NewsTopicsStore {
  constructor(
    private readonly db: Store,
    /** Names from People in your life, so no topic can carry one. */
    private readonly names: (owner: string) => Promise<string[]> = async () => [],
  ) {}

  async get(owner: string): Promise<NewsTopicsRow> {
    const saved = await this.db.get<Partial<NewsTopicsRow>>(owner, NEWS_TOPICS_KIND, ROW_ID);
    return { ...EMPTY, ...(saved ?? {}), id: ROW_ID };
  }

  /** Throws a plain AppError when the keyword can't be a topic. Returns it cleaned. */
  async check(owner: string, keyword: string): Promise<string> {
    const problem = keywordProblem(keyword, await this.names(owner));
    if (problem) throw new AppError(problem, 422);
    return cleanKeyword(keyword);
  }

  async follow(owner: string, keyword: string, from: NewsTopic["from"] = "you"): Promise<{ row: NewsTopicsRow; added: boolean; keyword: string }> {
    const clean = await this.check(owner, keyword);
    const row = await this.get(owner);
    if (row.topics.some((t) => keyOf(t.keyword) === keyOf(clean))) return { row, added: false, keyword: clean };
    if (row.topics.length >= TOPICS_MAX)
      throw new AppError(`You follow ${TOPICS_MAX} topics already. Stop following one first.`, 422);
    const next: NewsTopicsRow = {
      ...row,
      topics: [...row.topics, { keyword: clean, addedAt: new Date().toISOString(), from }],
      updatedAt: new Date().toISOString(),
    };
    return { row: await this.db.put(owner, NEWS_TOPICS_KIND, next), added: true, keyword: clean };
  }

  async unfollow(owner: string, keyword: string): Promise<{ row: NewsTopicsRow; removed: boolean }> {
    const row = await this.get(owner);
    const left = row.topics.filter((t) => keyOf(t.keyword) !== keyOf(keyword));
    if (left.length === row.topics.length) return { row, removed: false };
    return { row: await this.db.put(owner, NEWS_TOPICS_KIND, { ...row, topics: left, updatedAt: new Date().toISOString() }), removed: true };
  }

  /**
   * The settings screen's save: the whole list, the why switch, or one suggestion put away.
   * A topic that is one of `suggested` is marked as an accepted suggestion.
   */
  async set(owner: string, input: unknown, suggested: readonly string[] = []): Promise<NewsTopicsRow> {
    const ask = topicsInput.parse(input);
    const row = await this.get(owner);
    const next: NewsTopicsRow = { ...row, updatedAt: new Date().toISOString() };
    if (ask.topics) {
      const names = await this.names(owner);
      const seen = new Set<string>();
      const topics: NewsTopic[] = [];
      for (const raw of ask.topics) {
        const problem = keywordProblem(raw, names);
        if (problem) throw new AppError(`"${cleanKeyword(raw).slice(0, KEYWORD_MAX)}": ${problem}`, 422);
        const clean = cleanKeyword(raw);
        if (seen.has(keyOf(clean))) continue;
        seen.add(keyOf(clean));
        const old = row.topics.find((t) => keyOf(t.keyword) === keyOf(clean));
        const fromSuggestion = suggested.some((s) => keyOf(s) === keyOf(clean));
        topics.push(old ?? { keyword: clean, addedAt: new Date().toISOString(), from: fromSuggestion ? "suggestion" : "you" });
      }
      next.topics = topics;
    }
    if (ask.why !== undefined) next.why = ask.why;
    if (ask.dismiss) next.dismissed = [...new Set([...row.dismissed, keyOf(ask.dismiss)])].slice(-50);
    return this.db.put(owner, NEWS_TOPICS_KIND, next);
  }
}
