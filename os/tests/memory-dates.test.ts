import assert from "node:assert/strict";
import { test } from "node:test";
import { datedFor } from "@debo/memory";
import { devMemoryBackend } from "../apps/server/src/debo/dev-backend.ts";

test("a backdated entry is sent to memory with its own day, not today", () => {
  const march = new Date("2026-03-14T18:30:00Z");
  const dated = datedFor(march);
  assert.ok(dated);
  assert.equal(dated.timestamp, Math.floor(march.getTime() / 1000), "Mem0 wants whole seconds");
  assert.equal(dated.lead, "Written about 2026-03-14");
  // The person's own day: 18:30 UTC is already the 15th in Kolkata.
  assert.equal(datedFor(march, "Asia/Kolkata")?.lead, "Written about 2026-03-15");
  // An unknown zone falls back to UTC instead of failing.
  assert.equal(datedFor(march, "Not/AZone")?.lead, "Written about 2026-03-14");
  // Text dates work too; nothing or nonsense sends no date.
  assert.equal(datedFor("2026-03-14T18:30:00Z")?.timestamp, dated.timestamp);
  assert.equal(datedFor(null), null);
  assert.equal(datedFor("not a date"), null);
});

test("the dev journal dates a memory by the day its entry is about", async () => {
  const backend = devMemoryBackend();
  const march = new Date("2026-03-14T09:00:00Z");
  const entry = await backend.entries.create("p1", "Walked by the river with Arun", march);
  await backend.afterChange("p1", entry.id, "saved");
  const [memory] = (await backend.memories?.list("p1")) ?? [];
  assert.equal(memory?.createdAt, march.toISOString());
});
