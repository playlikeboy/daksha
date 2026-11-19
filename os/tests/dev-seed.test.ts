import assert from "node:assert/strict";
import { test } from "node:test";
import { devMemoryBackend } from "../apps/server/src/debo/dev-backend.ts";
import { seedDevJournal } from "../apps/server/src/debo/dev-seed.ts";
import { devSeedRequested } from "../apps/server/src/debo/index.ts";

test("the made-up journal is off unless DEBO_DEV_SEED asks for it", () => {
  assert.equal(devSeedRequested({}), false);
  assert.equal(devSeedRequested({ DEBO_DEV_SEED: "0" }), false);
  assert.equal(devSeedRequested({ DEBO_DEV_SEED: "1" }), true);
  assert.equal(devSeedRequested({ DEBO_DEV_SEED: " On " }), true);
});

test("the seed fills only the named person's in-memory journal, newest first, with memories", async () => {
  const backend = devMemoryBackend();
  await seedDevJournal(backend, "local-user");
  const entries = await backend.entries.list("local-user", { limit: 50 });
  assert.equal(entries.length, 6);
  assert.equal(entries[0]?.title, "Long walk by the lake after work");
  assert.ok(entries.every((e, i) => i === 0 || e.happenedAt <= (entries[i - 1]?.happenedAt ?? e.happenedAt)));
  assert.equal((await backend.memories?.list("local-user"))?.length, 6);
  assert.equal((await backend.entries.list("someone-else", { limit: 50 })).length, 0);
});
