// The news feed: topics stay generic and private, stories are deduped and ranked, each person
// sees only their own feed, and it is exported and deleted with the account. No test here ever
// reaches a real news service: every request goes to a fake that records what was asked.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { Hono } from "hono";
import { accountRoutes } from "../apps/server/src/account.ts";
import { AppError } from "../apps/server/src/errors.ts";
import { createStore, type Store } from "../apps/server/src/db.ts";
import type { Files } from "../apps/server/src/files.ts";
import { PeopleStore } from "../apps/server/src/people.ts";
import { normalUrl, paywalled, rankStories } from "../apps/server/src/news/rank.ts";
import { newsRoutes } from "../apps/server/src/news/routes.ts";
import { NEWS_CACHE_KIND, NewsService } from "../apps/server/src/news/service.ts";
import { gdelt, gdeltDate, gdeltTerms, hackerNews, PoliteFetcher, type Fetch, type RawStory } from "../apps/server/src/news/sources.ts";
import { newsTools } from "../apps/server/src/news/tools.ts";
import { keywordProblem, NEWS_TOPICS_KIND, suggestTopics } from "../apps/server/src/news/topics.ts";

let db: Store;
before(async () => {
  db = await createStore();
});
after(async () => {
  await db.close();
});

const NOW = new Date("2026-11-21T06:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);
const seen = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** A fake network: answers like GDELT and Hacker News, and records every address asked. */
function fakeNet(answer?: (url: URL) => unknown) {
  const asked: URL[] = [];
  const fetch: Fetch = async (raw) => {
    const url = new URL(raw);
    asked.push(url);
    if (!["api.gdeltproject.org", "hn.algolia.com"].includes(url.hostname)) throw new Error(`unexpected host ${url.hostname}`);
    const body =
      answer?.(url) ??
      (url.hostname === "api.gdeltproject.org"
        ? {
            articles: [
              {
                url: `https://news.example.org/${encodeURIComponent(url.searchParams.get("query") ?? "")}`,
                title: `Latest on ${(url.searchParams.get("query") ?? "").split(" ")[0]}`,
                seendate: seen(hoursAgo(2)),
                domain: "news.example.org",
                socialimage: "https://news.example.org/pic.jpg",
              },
            ],
          }
        : { hits: [] });
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  // No gaps in tests, so they run fast; the gap logic has its own test.
  const fetcher = new PoliteFetcher(fetch, { gdelt: 0, hn: 0 }, async () => {});
  return { asked, fetcher };
}

const serviceFor = (net: ReturnType<typeof fakeNet>, extra: Partial<ConstructorParameters<typeof NewsService>[0]> = {}) =>
  new NewsService({
    db,
    fetcher: net.fetcher,
    names: async (owner) => (await new PeopleStore(db).list(owner)).map((p) => p.name),
    ...extra,
  });

type Tool = { name: string; execute: (args: unknown) => Promise<Record<string, unknown>> };
const toolsFor = (news: NewsService, owner: string) => {
  const tools = newsTools(news, owner) as unknown as Tool[];
  return (name: string, args: unknown) => tools.find((t) => t.name === name)!.execute(args);
};

test("a topic must be a short generic keyword: no names, family words, emails, numbers or sentences", () => {
  for (const ok of ["cricket", "AI", "Bengaluru weather", "electric cars", "Formula 1", "US elections", "क्रिकेट"])
    assert.equal(keywordProblem(ok), null, ok);
  assert.match(String(keywordProblem("my mum's surgery")), /not about you/);
  assert.match(String(keywordProblem("Riya cricket", ["Riya Sharma"])), /People in your life/);
  assert.match(String(keywordProblem("sharma", ["Riya Sharma"])), /People in your life/);
  assert.match(String(keywordProblem("me@example.com")), /email/);
  assert.match(String(keywordProblem("call 98450 12345")), /long number/);
  assert.match(String(keywordProblem("I felt really sad today after the meeting")), /not about you|words or fewer|short/);
  assert.match(String(keywordProblem("one two three four five")), /4 words/);
  assert.match(String(keywordProblem("x")), /two letters/);
});

test("only the topic keyword goes into a news query, never journal text or names", async () => {
  const owner = "privacy-1";
  await new PeopleStore(db).note(owner, { name: "Riya Sharma", relation: "sister" });
  const secret = "I told Riya about my divorce and the hospital bills";
  const net = fakeNet();
  const news = serviceFor(net, { texts: async () => [secret, "We watched cricket and the IPL final, then more cricket."] });
  const run = toolsFor(news, owner);

  // Refused before any request: a name, a family word, a sentence.
  for (const topic of ["Riya", "my divorce", secret]) {
    const out = await run("follow_topic", { topic });
    assert.ok(out.error, topic);
    const search = await run("get_news", { topic });
    assert.ok(search.error, topic);
  }
  assert.equal(net.asked.length, 0, "nothing was sent for refused topics");

  // Suggestions are read here from the person's texts, come from a fixed list, and are not followed.
  const view = await news.topicsView(owner);
  assert.deepEqual(view.suggestions, ["cricket"]);
  assert.equal(view.topics.length, 0);

  await run("follow_topic", { topic: "cricket" });
  await run("follow_topic", { topic: "AI" });
  await news.refresh(owner, NOW);
  assert.ok(net.asked.length >= 3, "GDELT for both, Hacker News for AI");
  const allowed = new Set(["cricket", "sourcelang:english", '"artificial', 'intelligence"', "ai"]);
  for (const url of net.asked) {
    const text = decodeURIComponent(url.toString()).toLowerCase();
    for (const word of ["riya", "sharma", "divorce", "hospital", "bills", "sister", "ipl", "final"])
      assert.ok(!text.includes(word), `${word} leaked into ${url.hostname}`);
    const q = url.searchParams.get("query") ?? "";
    for (const part of q.toLowerCase().split(/\s+/)) assert.ok(allowed.has(part), `unexpected query word ${part}`);
    assert.equal(url.username + url.password, "");
    assert.ok(!url.searchParams.has("owner") && !url.toString().includes(owner));
  }
});

test("GDELT and Hacker News answers are read safely; short topics get a longer phrase", () => {
  assert.equal(gdeltTerms("AI"), '"artificial intelligence"');
  assert.equal(gdeltTerms("Bengaluru weather"), "Bengaluru weather");
  assert.equal(gdeltDate("20261121T101500Z"), "2026-11-21T10:15:00.000Z");
  const g = new URL(gdelt.url("cricket", NOW));
  assert.equal(g.searchParams.get("query"), "cricket sourcelang:english");
  assert.equal(new URL(gdelt.url("क्रिकेट", NOW)).searchParams.get("query"), "क्रिकेट");
  const stories = gdelt.parse(
    { articles: [{ url: "https://a.example/x", title: "Hello", seendate: "20261121T101500Z", socialimage: "http://insecure/pic.jpg" }, { title: "no url" }] },
    "cricket",
  );
  assert.equal(stories.length, 1);
  assert.equal(stories[0]?.image, undefined, "only https pictures");
  assert.equal(hackerNews.covers("cricket"), false);
  assert.equal(hackerNews.covers("AI"), true);
  const hn = hackerNews.parse({ hits: [{ objectID: "42", title: "Ask HN: x", created_at: "2026-11-21T01:00:00Z", points: 10 }] }, "AI");
  assert.equal(hn[0]?.url, "https://news.ycombinator.com/item?id=42");
  assert.deepEqual(gdelt.parse("Phrase too short", "AI"), []);
});

test("the polite fetcher asks one service one at a time, with a gap", async () => {
  const waits: number[] = [];
  let open = 0;
  let most = 0;
  const fetch: Fetch = async () => {
    open++;
    most = Math.max(most, open);
    await new Promise((r) => setTimeout(r, 5));
    open--;
    return new Response(JSON.stringify({ articles: [] }));
  };
  const fetcher = new PoliteFetcher(fetch, { gdelt: 1000, hn: 0 }, async (ms) => void waits.push(ms));
  await Promise.all([fetcher.ask(gdelt, "a1", NOW), fetcher.ask(gdelt, "b2", NOW), fetcher.ask(gdelt, "c3", NOW)]);
  assert.equal(most, 1, "never two at once");
  assert.equal(waits.length, 2, "a gap before the second and third");
  const bad = new PoliteFetcher(async () => new Response("Phrase too short"), { gdelt: 0, hn: 0 });
  await assert.rejects(bad.ask(gdelt, "AI", NOW), /did not answer with JSON/);
});

const raw = (over: Partial<RawStory>): RawStory => ({
  title: "A headline",
  url: "https://site.example/a",
  source: "site.example",
  publishedAt: hoursAgo(1).toISOString(),
  topic: "cricket",
  from: "gdelt",
  ...over,
});

test("ranking: one copy of each story, fresh and on-topic first, a mix of sites, no paywalls", () => {
  assert.equal(normalUrl("https://www.site.example/a/?utm_source=x&id=1#top"), "https://site.example/a?id=1");
  assert.equal(normalUrl("http://m.site.example/a/amp"), "https://site.example/a");
  assert.equal(paywalled({ url: "https://www.wsj.com/x", source: "wsj.com", title: "x" }), true);
  assert.equal(paywalled({ url: "https://bbc.co.uk/x", source: "bbc.co.uk", title: "x" }), false);

  const stories = rankStories(
    [
      raw({ title: "India win the cricket test in Chennai", url: "https://one.example/a?utm_source=feed", source: "one.example" }),
      raw({ title: "India win the cricket test in Chennai - One News", url: "https://www.one.example/a", source: "one.example", image: "https://one.example/p.jpg" }),
      raw({ title: "India win the cricket test in Chennai | Two", url: "https://two.example/b", source: "two.example", publishedAt: hoursAgo(3).toISOString() }),
      raw({ title: "Old cricket story from last week", url: "https://three.example/c", source: "three.example", publishedAt: hoursAgo(60).toISOString() }),
      raw({ title: "Cricket board meets", url: "https://wsj.com/d", source: "wsj.com" }),
      raw({ title: "Cricket A", url: "https://busy.example/1", source: "busy.example" }),
      raw({ title: "Cricket B match", url: "https://busy.example/2", source: "busy.example" }),
      raw({ title: "Cricket C final", url: "https://busy.example/3", source: "busy.example" }),
      raw({ title: "New AI model released", url: "https://ai.example/e", source: "ai.example", topic: "AI" }),
    ],
    NOW,
  );
  const titles = stories.map((s) => s.title);
  assert.equal(titles.filter((t) => t.startsWith("India win")).length, 1, "duplicates merged");
  assert.equal(stories.find((s) => s.title.startsWith("India win"))?.image, "https://one.example/p.jpg", "the picture is kept from a twin");
  assert.ok(!titles.includes("Cricket board meets"), "paywalled skipped");
  assert.equal(stories.filter((s) => s.source === "busy.example").length, 2, "at most two per site");
  assert.equal(titles.at(-1), "Old cricket story from last week", "older stories come last");
  assert.ok(titles.indexOf("New AI model released") < 4, "another topic is mixed in near the top");
  assert.equal(new Set(stories.map((s) => s.id)).size, stories.length);
});

test("the feed is the owner's own: routes never show or change another person's topics or stories", async () => {
  const net = fakeNet();
  const news = serviceFor(net);
  const app = new Hono<{ Variables: { owner: string } }>();
  app.use("*", async (c, next) => {
    c.set("owner", c.req.header("x-owner") ?? "nobody");
    await next();
  });
  app.route("/api/news", newsRoutes(news));
  // The real app turns a plain AppError into its status (app.ts onError).
  app.onError((error, c) => (error instanceof AppError ? c.json({ error: error.message }, error.status) : c.json({ error: "failed" }, 500)));
  const as = (owner: string, path: string, init: RequestInit = {}) =>
    app.request(path, { ...init, headers: { "x-owner": owner, "Content-Type": "application/json" } });

  const empty = (await (await as("iso-a", "/api/news")).json()) as { stories: unknown[]; topics: string[] };
  assert.deepEqual([empty.stories.length, empty.topics.length], [0, 0], "no topics: an empty feed, not an error");

  const put = await as("iso-a", "/api/news/topics", { method: "PUT", body: JSON.stringify({ topics: ["cricket", "space"], why: false }) });
  assert.equal(put.status, 200);
  const bad = await as("iso-a", "/api/news/topics", { method: "PUT", body: JSON.stringify({ topics: ["my wife"] }) });
  assert.equal(bad.status, 422);

  const feedA = (await (await as("iso-a", "/api/news")).json()) as { stories: { topic: string }[]; topics: string[] };
  assert.deepEqual(feedA.topics, ["cricket", "space"]);
  assert.ok(feedA.stories.length >= 2);

  const topicsB = (await (await as("iso-b", "/api/news/topics")).json()) as { topics: unknown[] };
  assert.equal(topicsB.topics.length, 0);
  const feedB = (await (await as("iso-b", "/api/news")).json()) as { stories: unknown[] };
  assert.equal(feedB.stories.length, 0);
  assert.equal(await db.get("iso-b", NEWS_CACHE_KIND, "current"), null);

  // Taking a topic away hides its stories at once.
  await as("iso-a", "/api/news/topics", { method: "PUT", body: JSON.stringify({ topics: ["space"] }) });
  const after = (await (await as("iso-a", "/api/news")).json()) as { stories: { topic: string }[] };
  assert.ok(after.stories.every((s) => s.topic === "space"));
});

test("accepting a suggestion is marked; putting one away keeps it away", async () => {
  const owner = "suggest-1";
  const news = serviceFor(fakeNet(), { texts: async () => ["Went to the gym, then a long run. Gym again tomorrow."] });
  assert.deepEqual((await news.topicsView(owner)).suggestions, ["fitness"]);
  await news.topics.set(owner, { topics: ["fitness"] }, ["fitness"]);
  assert.equal((await news.topics.get(owner)).topics[0]?.from, "suggestion");
  await news.topics.set(owner, { topics: [], dismiss: "fitness" });
  assert.deepEqual((await news.topicsView(owner)).suggestions, []);
  assert.deepEqual(suggestTopics(["cricket once"], []), [], "one mention is not enough");
});

test("why lines are off by default, cached per story, and only get the headline and topic", async () => {
  const owner = "why-1";
  const calls: { owner: string; stories: { title: string; topic: string }[] }[] = [];
  const net = fakeNet();
  const news = serviceFor(net, {
    why: async (o, stories) => {
      calls.push({ owner: o, stories });
      return stories.map((s) => `Because you follow ${s.topic}.`);
    },
  });
  await news.topics.follow(owner, "cricket");
  await news.refresh(owner, NOW);
  assert.equal(calls.length, 0, "off unless turned on");
  await news.topics.set(owner, { why: true });
  await news.refresh(owner, NOW);
  assert.equal(calls.length, 1);
  assert.deepEqual(Object.keys(calls[0]!.stories[0]!).sort(), ["title", "topic"]);
  const feed = await news.feed(owner, { now: NOW });
  assert.equal(feed.stories[0]?.why, "Because you follow cricket.");
  assert.match(feed.whyLabel, /written by AI/);
  await news.refresh(owner, new Date(NOW.getTime() + 60_000));
  assert.equal(calls.length, 1, "the same story is not asked about again");
});

test("a failed fetch keeps the saved stories, says which service failed, and waits before trying again", async () => {
  const owner = "fail-1";
  let down = false;
  const net = fakeNet((url) => {
    if (down) throw new Error("offline");
    return undefined as unknown;
  });
  const news = serviceFor(net);
  await news.topics.follow(owner, "space");
  const first = await news.refresh(owner, NOW);
  assert.ok(first.stories.length);
  down = true;
  const later = new Date(NOW.getTime() + 4 * 3_600_000);
  // A different topic answer cache: wait past it.
  const kept = await news.refresh(owner, later);
  assert.equal(kept.stories.length, first.stories.length);
  assert.deepEqual(kept.failed.sort(), ["gdelt", "hn"], "space goes to both services");
  const row = await news.topics.get(owner);
  assert.equal(news.needsRefresh(kept, row, new Date(later.getTime() + 60_000)), false, "no retry storm");
});

test("export holds the topics and the feed; deleting the account removes both", async () => {
  const owner = "export-news";
  const news = serviceFor(fakeNet());
  await news.topics.follow(owner, "cricket");
  await news.refresh(owner, NOW);
  const files = { removeAll: async () => 0 } as unknown as Files;
  const app = new Hono<{ Variables: { owner: string } }>();
  app.use("*", async (c, next) => {
    c.set("owner", owner);
    await next();
  });
  app.route("/", accountRoutes(db, files));
  const exported = (await (await app.request("/export")).json()) as { records: { kind: string; data: Record<string, unknown> }[] };
  assert.ok(exported.records.some((r) => r.kind === NEWS_TOPICS_KIND));
  assert.ok(exported.records.some((r) => r.kind === NEWS_CACHE_KIND));
  const gone = await app.request("/", { method: "DELETE", body: JSON.stringify({ confirm: true }) });
  assert.equal(gone.status, 200);
  assert.equal(await db.get(owner, NEWS_TOPICS_KIND, "current"), null);
  assert.equal(await db.get(owner, NEWS_CACHE_KIND, "current"), null);
});

test("the tools: follow, unfollow, the feed and a one-off search", async () => {
  const owner = "tools-1";
  const net = fakeNet();
  const run = toolsFor(serviceFor(net), owner);
  const none = await run("get_news", {});
  assert.match(String(none.message), /follows no topics/);
  const followed = await run("follow_topic", { topic: "  Space  " });
  assert.equal(followed.status, "saved");
  assert.deepEqual(followed.topics, ["Space"]);
  assert.deepEqual((await run("follow_topic", { topic: "space" })).changed, [], "no double");
  const feed = await run("get_news", {});
  assert.ok((feed.stories as unknown[]).length >= 1);
  assert.match(String(feed.attribution), /GDELT/);
  const one = await run("get_news", { topic: "tennis" });
  assert.equal(one.topic, "tennis");
  assert.deepEqual((await run("unfollow_topic", { topic: "SPACE" })).status, "saved");
  assert.equal((await run("unfollow_topic", { topic: "space" })).status, "unchanged");
});

test("the background pass refreshes old feeds behind the loop, and never twice at once", async () => {
  const owner = "tick-1";
  const net = fakeNet();
  const news = serviceFor(net);
  await news.topics.follow(owner, "climate");
  await news.tick(NOW);
  await news.tick(NOW);
  for (let i = 0; i < 50 && !(await news.cached(owner)); i++) await new Promise((r) => setTimeout(r, 10));
  assert.ok(await news.cached(owner));
  const asked = net.asked.filter((u) => u.searchParams.get("query")?.startsWith("climate")).length;
  assert.equal(asked, 1);
});
