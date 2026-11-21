// The suggested tool servers in the app must match the Hermes manifests they came from.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { suggestToolServers, TOOL_SERVER_SUGGESTIONS } from "../apps/mobile/src/mcp-suggestions.ts";

const manifests = fileURLToPath(new URL("../../third_party/hermes-mcps/optional-mcps", import.meta.url));
const LEFT_OUT = ["n8n-official", "unreal-engine", "asana", "paypal", "square", "robinhood", "rentahuman"];

test("every suggestion matches its manifest's address and sign-in", () => {
  for (const s of TOOL_SERVER_SUGGESTIONS) {
    const manifest = parse(readFileSync(join(manifests, s.id, "manifest.yaml"), "utf8")) as {
      transport: { type: string; url: string };
      auth: { type: string };
      description: string;
    };
    assert.equal(manifest.transport.type, "http", s.id);
    assert.equal(s.url, manifest.transport.url, s.id);
    assert.equal(s.auth, manifest.auth.type === "oauth" ? "sign-in" : "none", s.id);
    assert.equal(s.about, manifest.description.trim(), s.id);
    assert.match(s.url, /^https:\/\//, s.id);
    assert.ok(s.name.length <= 40, `${s.id}: the add form allows 40 characters`);
  }
});

test("each manifest is suggested or left out on purpose, and nothing twice", () => {
  const ids = TOOL_SERVER_SUGGESTIONS.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of readdirSync(manifests)) assert.ok(ids.includes(id) !== LEFT_OUT.includes(id), id);
  assert.equal(ids.length + LEFT_OUT.length, readdirSync(manifests).length);
});

test("search finds by name and shows everyday servers first", () => {
  assert.equal(suggestToolServers("linear")[0]?.id, "linear");
  assert.ok(suggestToolServers("").every((s) => s.everyday));
  assert.equal(suggestToolServers("", 100).length, TOOL_SERVER_SUGGESTIONS.length);
  assert.deepEqual(suggestToolServers("no such thing at all"), []);
});
