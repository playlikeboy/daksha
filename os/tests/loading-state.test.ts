import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { listState } from "../apps/mobile/src/loading-state.ts";

test("a list says it is empty only after it has loaded", () => {
  assert.equal(listState(false, 0), "loading", "no flash of 'nothing here yet' while loading");
  assert.equal(listState(true, 0), "empty");
  assert.equal(listState(false, 3), "list", "replayed messages show as soon as they arrive");
  assert.equal(listState(true, 3), "list");
});

test("Chat and Tasks wait for their data before showing the empty state", () => {
  const source = (file: string) => readFileSync(new URL(`../apps/mobile/src/${file}`, import.meta.url), "utf8");
  assert.match(source("chat.tsx"), /listState\(loaded, visible\.length\) === "empty"/);
  assert.match(source("chat.tsx"), /accessibilityLabel="Loading conversation"/);
  assert.match(source("agent-ui.tsx"), /listState\(!!data, tasks\.length\) === "empty"/);
});
