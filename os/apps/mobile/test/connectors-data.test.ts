import assert from "node:assert/strict";
import test from "node:test";
import type { FuseApi } from "../src/api.ts";
import {
  APPS_BUSY,
  APPS_OFFLINE,
  APPS_SIGNED_OUT,
  APPS_SLOW,
  loadConnectors,
  plainAppsError,
} from "../src/connectors-data.ts";

test("raw network and status errors become a plain next step", () => {
  assert.equal(plainAppsError(new TypeError("Failed to fetch")), APPS_OFFLINE);
  assert.equal(plainAppsError(new Error("Network request failed")), APPS_OFFLINE);
  assert.equal(plainAppsError(new DOMException("The operation was aborted.", "AbortError")), APPS_SLOW);
  assert.equal(plainAppsError(new Error("Request failed (502)")), APPS_BUSY);
  assert.equal(plainAppsError(new Error("Request failed (401)")), APPS_SIGNED_OUT);
  assert.equal(plainAppsError(new Error("The server returned an unreadable response (200).")), APPS_BUSY);
  for (const words of [APPS_OFFLINE, APPS_SLOW, APPS_BUSY, APPS_SIGNED_OUT])
    assert.doesNotMatch(words, /fetch|error|\(\d+\)/i);
});

test("the server's own plain sentence is kept", () => {
  const said = "I couldn't reach your connected apps just now. Try again in a moment.";
  assert.equal(plainAppsError(new Error(said)), said);
});

test("loading the Apps list shows plain words when the network fails", async () => {
  const api = {
    request: async () => {
      throw new TypeError("Failed to fetch");
    },
  } as unknown as FuseApi;
  await assert.rejects(loadConnectors(api), (error: Error) => error.message === APPS_OFFLINE);
});

test("a request that never answers is given up on, with a time limit passed to fetch", async () => {
  let signal: AbortSignal | undefined;
  const api = {
    request: async (_path: string, _body: unknown, _method: unknown, init: { signal?: AbortSignal }) => {
      signal = init.signal;
      return { configured: true, connections: [], curated: [] };
    },
  } as unknown as FuseApi;
  await loadConnectors(api);
  assert.ok(signal instanceof AbortSignal);
});
