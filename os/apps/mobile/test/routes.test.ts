import assert from "node:assert/strict";
import test from "node:test";
import type { Section } from "../../../packages/domain/src/index.ts";
import { parsePath, pathFor, pathFromUrl, titleFor } from "../src/routes.ts";

const all: Section[] = [
  "home",
  "chat",
  "talk",
  "journal",
  "knows",
  "activity",
  "apps",
  "ideas",
  "goals",
  "mail",
  "calendar",
  "files",
  "browser",
];

test("every screen has its own address that reads back to the same screen", () => {
  const paths = all.map((section) => pathFor(section));
  assert.equal(new Set(paths).size, all.length);
  for (const section of all) assert.deepEqual(parsePath(pathFor(section)), { section });
  assert.equal(pathFor("activity"), "/tasks");
  assert.equal(pathFor("knows"), "/knows");
});
test("a conversation and a journal entry get their own address", () => {
  assert.equal(pathFor("chat", { threadId: "abc-123" }), "/chat/abc-123");
  assert.deepEqual(parsePath("/chat/abc-123"), { section: "chat", threadId: "abc-123" });
  assert.equal(pathFor("journal", { entryId: "e_1" }), "/journal/e_1");
  assert.deepEqual(parsePath("/journal/e_1"), { section: "journal", entryId: "e_1" });
  assert.equal(pathFor("talk", { threadId: "x" }), "/talk");
});
test("the home address opens Home, and old section names go to Chat or Apps", () => {
  assert.deepEqual(parsePath("/"), { section: "home" });
  assert.deepEqual(parsePath(""), { section: "home" });
  assert.equal(pathFor("home"), "/home");
  assert.equal(titleFor({ section: "home" }), "Home · Daksha");
  assert.equal(pathFor("today"), "/chat");
  assert.equal(pathFor("connections"), "/apps");
});
test("addresses ignore case, a trailing slash, a query and a hash", () => {
  assert.deepEqual(parsePath("/Journal/"), { section: "journal" });
  assert.deepEqual(parsePath("/talk?x=1#y"), { section: "talk" });
});
test("unknown addresses give nothing", () => {
  for (const p of ["/nope", "/tasks/1", "/apps/x", "/chat/a/b", "/chat/a b", "/journal/%00", "/today"])
    assert.equal(parsePath(p), null, p);
});
test("native deep links turn into addresses", () => {
  assert.equal(pathFromUrl("debo://journal/abc"), "/journal/abc");
  assert.equal(pathFromUrl("debo:///talk"), "/talk");
  assert.equal(pathFromUrl("https://my.daksha.life/ideas?x=1"), "/ideas");
  assert.equal(pathFromUrl("/mail"), "/mail");
});
test("each screen has a page title", () => {
  assert.equal(titleFor({ section: "journal" }), "Journal · Daksha");
  assert.equal(titleFor({ section: "activity" }), "Tasks · Daksha");
  assert.equal(titleFor(null), "That page isn't here · Daksha");
});
test("Talk is not a tab in the bottom bar, but /talk still opens it", async () => {
  const { readFileSync } = await import("node:fs");
  const app = readFileSync(`${import.meta.dirname}/../App.tsx`, "utf8");
  const start = app.indexOf("const nav:");
  const nav = app.slice(start, app.indexOf("];", start));
  assert.ok(nav.includes('id: "chat"'));
  assert.ok(!nav.includes('id: "talk"'));
  assert.deepEqual(parsePath("/talk"), { section: "talk" });
});

test("a chat address shows a readable name, the id after it is the truth, and old addresses still work", async () => {
  const { rememberChatName, slugify } = await import("../src/routes.ts");
  const id = "1b4e28ba-2fa1-4c3d-9a10-6f7d5c1e2b34";
  assert.equal(slugify("Trip to Goa!  (March)"), "trip-to-goa-march");
  assert.equal(slugify("   "), "");
  assert.ok(slugify("x".repeat(200)).length <= 40);
  // Without a known name the address is the old plain one.
  assert.equal(pathFor("chat", { threadId: id }), `/chat/${id}`);
  rememberChatName(id, "Trip to Goa");
  assert.equal(pathFor("chat", { threadId: id }), `/chat/trip-to-goa-${id}`);
  assert.deepEqual(parsePath(`/chat/trip-to-goa-${id}`), { section: "chat", threadId: id });
  assert.deepEqual(parsePath(`/chat/${id}`), { section: "chat", threadId: id });
  // A wrong or missing slug still opens the same chat.
  assert.deepEqual(parsePath(`/chat/anything-else-${id}`), { section: "chat", threadId: id });
  assert.equal(titleFor({ section: "chat", threadId: id }), "Trip to Goa \u00b7 Daksha");
  // A voice call's chat has a readable address too.
  const call = `voice-${"ab12".repeat(16)}`;
  rememberChatName(call, "Voice call, 14 November");
  assert.equal(pathFor("chat", { threadId: call }), `/chat/voice-call-14-november-${call}`);
  assert.deepEqual(parsePath(`/chat/voice-call-14-november-${call}`), { section: "chat", threadId: call });
  // Other ids (older chats) are left alone.
  assert.deepEqual(parsePath("/chat/abc-123"), { section: "chat", threadId: "abc-123" });
});

test("a journal entry address shows its title, the id after it is the truth, and plain ids still work", async () => {
  const { rememberEntryName, entryIdFrom } = await import("../src/routes.ts");
  const id = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
  assert.equal(pathFor("journal", { entryId: id }), `/journal/${id}`);
  rememberEntryName(id, "Dinner with Meera, at last!");
  assert.equal(pathFor("journal", { entryId: id }), `/journal/dinner-with-meera-at-last-${id}`);
  assert.deepEqual(parsePath(`/journal/dinner-with-meera-at-last-${id}`), { section: "journal", entryId: id });
  assert.deepEqual(parsePath(`/journal/${id}`), { section: "journal", entryId: id });
  // A changed title or a wrong slug still opens the same entry.
  assert.deepEqual(parsePath(`/journal/an-old-title-${id}`), { section: "journal", entryId: id });
  assert.equal(entryIdFrom(`x-${id.toUpperCase()}`), id.toUpperCase());
  // The phone's deep link reads the same way.
  assert.deepEqual(parsePath(pathFromUrl(`debo://journal/dinner-${id}`)), { section: "journal", entryId: id });
  assert.deepEqual(parsePath(pathFromUrl(`https://my.daksha.life/journal/dinner-${id}`)), { section: "journal", entryId: id });
  assert.equal(titleFor({ section: "journal", entryId: id }), "Dinner with Meera, at last! · Daksha");
  // A title in another script has no slug: the address is the plain id.
  const other = "8d9e6679-7425-40de-944b-e07fc1f90ae8";
  rememberEntryName(other, "आज का दिन");
  assert.equal(pathFor("journal", { entryId: other }), `/journal/${other}`);
  // The list keeps its own address.
  assert.deepEqual(parsePath("/journal"), { section: "journal" });
});
