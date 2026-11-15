// An entry's own page: GET /api/debo/entries/:id and its "Similar entries"
// (GET /api/debo/entries/:id/similar). Both are for the owner only.
import assert from "node:assert/strict";
import { test } from "node:test";
import { Hono } from "hono";
import { deboRoutes, DeboService } from "../apps/server/src/debo/index.ts";
import { SIMILAR_LIMIT, snippetOf } from "../apps/server/src/debo/service.ts";
import { ALICE, BOB, fakeBackend } from "./helpers/debo.ts";

function setup() {
  const backend = fakeBackend();
  const debo = new DeboService(backend);
  const app = new Hono<{ Variables: { owner: string } }>();
  app.use("*", async (c, next) => {
    c.set("owner", c.req.header("x-owner") ?? ALICE);
    await next();
  });
  app.route("/api/debo", deboRoutes(debo));
  const get = (path: string, owner: string) => app.request(`/api/debo${path}`, { headers: { "x-owner": owner } });
  const add = async (owner: string, text: string, vector: number[], happenedAt?: string) => {
    const response = await app.request("/api/debo/entries", {
      method: "POST",
      headers: { "x-owner": owner, "Content-Type": "application/json" },
      body: JSON.stringify({ text, ...(happenedAt ? { happenedAt } : {}) }),
    });
    const { entry } = (await response.json()) as { entry: { id: string } };
    backend.setVector(owner, entry.id, vector);
    return entry.id;
  };
  return { backend, get, add };
}

type Similar = { id: string; kind: string; title: string; happenedAt: string; snippet: string; label: string };

test("an entry page loads its own entry, and only for its owner", async () => {
  const { get, add } = setup();
  const id = await add(ALICE, "Walked by the river with Arun", [1, 0, 0]);
  const mine = await get(`/entries/${id}`, ALICE);
  assert.equal(mine.status, 200);
  const { entry } = await mine.json();
  assert.equal(entry.id, id);
  assert.equal(entry.kind, "journal");
  assert.equal(entry.text, "Walked by the river with Arun");

  const theirs = await get(`/entries/${id}`, BOB);
  assert.equal(theirs.status, 404);
  assert.match((await theirs.json()).error, /couldn't find that entry/);
  assert.equal((await get("/entries/not-an-id", ALICE)).status, 404);
});

test("similar entries: closest first, never itself, at most five", async () => {
  const { get, add } = setup();
  const self = await add(ALICE, "Hiking in the hills", [1, 0, 0]);
  const close = await add(ALICE, "A long walk up the hill", [0.95, 0.1, 0]);
  const closer = await add(ALICE, "Hiking again in the hills", [0.99, 0.02, 0]);
  const far = await add(ALICE, "Paid the electricity bill", [0, 0, 1]);
  for (let i = 0; i < 5; i++) await add(ALICE, `Another hill walk ${i}`, [0.8, 0.3 + i * 0.05, 0]);

  const response = await get(`/entries/${self}/similar`, ALICE);
  assert.equal(response.status, 200);
  const { similar } = (await response.json()) as { similar: Similar[] };
  const ids = similar.map((s) => s.id);
  assert.equal(similar.length, SIMILAR_LIMIT);
  assert.ok(!ids.includes(self), "never the entry itself");
  assert.ok(!ids.includes(far), "an unrelated entry is left out");
  assert.deepEqual(ids.slice(0, 2), [closer, close], "closest first");
  for (const s of similar) {
    assert.equal(s.kind, "journal");
    assert.match(s.label, /^Journal, \d+ \w+$/);
    assert.ok(s.snippet.length > 0 && s.snippet.length <= 180);
    assert.ok(!Number.isNaN(Date.parse(s.happenedAt)));
  }
});

test("similar entries never cross from one person to another", async () => {
  const { get, add } = setup();
  const alice = await add(ALICE, "Dinner with Meera at the new place", [1, 0]);
  const bobTwin = await add(BOB, "Dinner with Meera at the new place", [1, 0]);
  const aliceOther = await add(ALICE, "Lunch with Meera", [0.9, 0.1]);

  const { similar } = (await (await get(`/entries/${alice}/similar`, ALICE)).json()) as { similar: Similar[] };
  assert.deepEqual(similar.map((s) => s.id), [aliceOther]);

  // Bob cannot ask about Alice's entry, and his own list has none of hers.
  const asBob = await get(`/entries/${alice}/similar`, BOB);
  assert.equal(asBob.status, 404);
  const bobs = (await (await get(`/entries/${bobTwin}/similar`, BOB)).json()) as { similar: Similar[] };
  assert.deepEqual(bobs.similar, []);
});

test("an entry with no embeddings yet has no similar entries", async () => {
  const { backend, get, add } = setup();
  await add(ALICE, "Something", [1, 0]);
  const created = await backend.entries.create(ALICE, "Not indexed yet");
  const response = await get(`/entries/${created.id}/similar`, ALICE);
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).similar, []);
});

test("snippets are short and lose the call's time marks", () => {
  assert.equal(snippetOf("[00:00] You: what did I do\n[00:07] Debo: You went hiking."), "what did I do You went hiking.");
  const long = snippetOf("word ".repeat(100));
  assert.ok(long.length <= 180 && long.endsWith("…"));
});
