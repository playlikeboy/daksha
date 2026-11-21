import assert from "node:assert/strict";
import test from "node:test";
import { loadNews, loadTopics, safeLink, siteName } from "../src/news-data.ts";

const api = (answer: () => unknown) => ({ request: async <T,>() => answer() as T });

test("an API without news reads as an empty feed, not an error", async () => {
  const missing = api(() => {
    throw new Error("Request failed (404)");
  });
  assert.deepEqual(await loadNews(missing), { stories: [], topics: [] });
  assert.equal(await loadTopics(missing), null);
  await assert.rejects(loadNews(api(() => {
    throw new Error("The server is busy");
  })), /busy/);
});

test("stories that don't parse are dropped, the rest are kept", async () => {
  const feed = await loadNews(
    api(() => ({
      stories: [
        { id: "a", title: "Hello", url: "https://bbc.co.uk/x", source: "www.bbc.co.uk", publishedAt: "2026-11-21T06:00:00Z", topic: "cricket", why: "A guess." },
        { id: "b", title: "No link" },
      ],
      topics: ["cricket"],
      refreshing: false,
    })),
  );
  assert.equal(feed.stories.length, 1);
  assert.equal(feed.stories[0]?.why, "A guess.");
  assert.equal(siteName(feed.stories[0]!.source), "bbc.co.uk");
});

test("only web links open from a card", () => {
  assert.equal(safeLink("https://a.example"), "https://a.example");
  assert.equal(safeLink("javascript:alert(1)"), null);
});
