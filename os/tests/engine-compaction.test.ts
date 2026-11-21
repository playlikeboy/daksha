import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { EventType } from "@ag-ui/core";
import { defineTool } from "@copilotkit/runtime/v2";
import type { ModelMessage } from "@tanstack/ai";
import { z } from "zod";
import { tanstackAgent } from "../apps/server/src/engine/tanstack-agent.ts";
import { modelFixture } from "./helpers/model.ts";
import { createStore, type Store } from "../apps/server/src/db.ts";
import {
  balancedCuts,
  codePointLength,
  compactMessages,
  PRUNE_MARKER,
  pruneOldToolResults,
  pruneText,
  resolvePruneConfig,
} from "../apps/server/src/engine/compaction.ts";
import {
  READ_MAX_CHARS,
  readToolResultTool,
  SPILL_HEAD_CHARS,
  SPILL_KIND,
  SPILL_THRESHOLD_CHARS,
  SpillStore,
  spillIfLarge,
} from "../apps/server/src/engine/spill.ts";

let db: Store;
before(async () => {
  db = await createStore();
});
after(async () => {
  await db.close();
});

const user = (content: string): ModelMessage => ({ role: "user", content });
const assistant = (content: string, calls = 0): ModelMessage => ({
  role: "assistant",
  content,
  ...(calls
    ? { toolCalls: Array.from({ length: calls }, (_, i) => ({ id: `c${i}`, type: "function" as const, function: { name: "t", arguments: "{}" } })) }
    : {}),
});
const tool = (content: string, id = "c0"): ModelMessage => ({ role: "tool", content, toolCallId: id });

test("pruning keeps the head and tail by code point, and never splits an emoji", () => {
  const config = resolvePruneConfig({ thresholdChars: 100, headChars: 10, tailChars: 5 });
  assert.equal(pruneText("short", config), null);
  const text = `${"😀".repeat(60)}${"a".repeat(60)}`;
  const pruned = pruneText(text, config) ?? "";
  assert.ok(pruned.startsWith("😀".repeat(10)));
  assert.ok(pruned.endsWith("aaaaa"));
  assert.ok(pruned.includes(PRUNE_MARKER));
  assert.equal(codePointLength(pruned), 10 + codePointLength(PRUNE_MARKER) + 5);
  assert.throws(() => resolvePruneConfig({ thresholdChars: 10, headChars: 10 }), /at most thresholdChars/);
  assert.throws(() => resolvePruneConfig({ headChars: -1 }), /non-negative/);
});

test("only tool results from earlier turns are pruned; this turn's stay whole", () => {
  const big = "x".repeat(10_000);
  const messages = [user("one"), assistant("", 1), tool(big), assistant("done"), user("two"), assistant("", 1), tool(big)];
  const { messages: out, charsRemoved } = pruneOldToolResults(messages);
  assert.ok(String(out[2]?.content).includes(PRUNE_MARKER));
  assert.equal(out[6]?.content, big);
  assert.ok(charsRemoved > 0);
  assert.equal(messages[2]?.content, big, "the input is not changed");
});

test("a cut is balanced only when no tool call waits for its result", () => {
  const messages = [user("a"), assistant("", 2), tool("r", "c0"), tool("r", "c1"), user("b")];
  assert.deepEqual(balancedCuts(messages), [true, true, false, false, true, true]);
  // A result with no call breaks every later cut, rather than throwing.
  assert.deepEqual(balancedCuts([tool("r"), user("a")]), [true, false, false]);
});

test("a short chat is sent as it is", () => {
  const messages = [user("hi"), assistant("hello")];
  const out = compactMessages(messages);
  assert.equal(out.dropped, 0);
  assert.deepEqual(out.messages, messages);
});

test("a long chat drops its oldest turns at a user message, with a note of what was asked", () => {
  const compact = { budgetChars: 1000, thresholdRatio: 0.8, retainRatio: 0.3 };
  const messages: ModelMessage[] = [];
  for (let i = 0; i < 10; i++) messages.push(user(`question ${i}`), assistant("", 1), tool("y".repeat(60)), assistant("z".repeat(40)));
  const out = compactMessages(messages, { compact });
  assert.ok(out.dropped > 0);
  const first = out.messages[0];
  assert.equal(first?.role, "user");
  assert.match(String(first?.content), /^\[Note from Daksha, not from the person: \d+ earlier messages/);
  assert.match(String(first?.content), /- question 0/);
  // The kept part starts at a whole turn: the next message answers that user message.
  assert.match(String(first?.content), /question \d+$/);
  const size = out.messages.reduce((n, m) => n + String(m.content).length, 0);
  assert.ok(size < messages.reduce((n, m) => n + String(m.content).length, 0));
  // No tool result is left without its call.
  assert.ok(balancedCuts(out.messages).at(-1));
  assert.ok(out.messages.filter((m) => m.role === "user").length >= 2);
});

test("spill: a long result from a tool without a card is saved, with its start and a pointer", async () => {
  const store = new SpillStore(db);
  const long = { data: "d".repeat(SPILL_THRESHOLD_CHARS + 100) };
  const shown = (await spillIfLarge(store, "ann", "use_server_tool", long)) as {
    preview: string;
    spilled: { id: string; totalChars: number };
    note: string;
  };
  assert.ok(shown.preview.length < 10_000);
  assert.match(shown.note, /read_tool_result/);
  assert.ok(shown.spilled.id.startsWith("tr_"));
  const page = await store.read("ann", shown.spilled.id, SPILL_HEAD_CHARS);
  assert.equal(page?.offset, SPILL_HEAD_CHARS);
  assert.equal(page?.text.length, READ_MAX_CHARS);
  assert.equal(page && "nextOffset" in page ? page.nextOffset : undefined, SPILL_HEAD_CHARS + READ_MAX_CHARS);
  // Someone else cannot read it.
  assert.equal(await store.read("bob", shown.spilled.id), null);
  // Short results, and tools the app draws as cards, are untouched.
  assert.deepEqual(await spillIfLarge(store, "ann", "use_server_tool", { ok: 1 }), { ok: 1 });
  assert.equal(await spillIfLarge(store, "ann", "browse_web", long), long);
});

test("spill: the read tool checks its input, and old results are swept", async () => {
  const store = new SpillStore(db);
  const saved = await store.save("cat", "find_app_tools", "abc", new Date("2026-01-01T00:00:00Z"));
  const fresh = await store.save("cat", "find_app_tools", "def");
  const read = readToolResultTool(store, "cat").execute as (args: unknown) => Promise<{ text?: string; error?: string; done?: boolean }>;
  assert.equal((await read({ id: fresh.id })).text, "def");
  assert.equal((await read({ id: fresh.id })).done, true);
  assert.match((await read({ id: "../x" })).error ?? "", /Use the id/);
  assert.match((await read({ id: "tr_00000000-0000-4000-8000-000000000000" })).error ?? "", /not there/);
  assert.equal(await store.sweep(new Date("2026-01-09T00:00:00Z")), 1);
  assert.equal(await db.get("cat", SPILL_KIND, saved.id), null);
  assert.ok(await db.get("cat", SPILL_KIND, fresh.id));
});

test("in a run, a long tool result reaches the model as a preview, and a long chat is compacted", async (t) => {
  const store = new SpillStore(db);
  const { requests } = await modelFixture(t, (i) => (i === 0 ? { name: "big_read", arguments: {} } : undefined));
  const agent = tanstackAgent({
    model: "openai/fixture",
    maxSteps: 3,
    tools: [
      defineTool({
        name: "big_read",
        description: "Returns a lot",
        parameters: z.object({}),
        execute: async () => ({ text: "q".repeat(SPILL_THRESHOLD_CHARS * 2) }),
      }),
    ],
    prompt: "Use the tool once.",
    keepResult: (name, result) => spillIfLarge(store, "dan", name, result),
  });
  const old = Array.from({ length: 300 }, (_, i) => ({
    id: `m${i}`,
    role: i % 2 ? ("assistant" as const) : ("user" as const),
    content: `${i % 2 ? "answer" : "question"} ${i} ${"w".repeat(1000)}`,
  }));
  const events: { type: string; content?: string }[] = [];
  await new Promise<void>((resolve, reject) =>
    agent
      .run({
        threadId: "c",
        runId: "r",
        messages: [...old, { id: "now", role: "user", content: "read it" }],
        state: {},
        tools: [],
        context: [],
        forwardedProps: {},
      })
      .subscribe({ next: (e) => events.push(e as never), error: reject, complete: () => resolve() }),
  );
  const result = events.find((e) => e.type === EventType.TOOL_CALL_RESULT);
  assert.match(result?.content ?? "", /read_tool_result/);
  assert.ok((result?.content ?? "").length < 12_000);
  assert.equal((await db.list("dan", SPILL_KIND)).length, 1);
  // The first model request carried the note instead of all 300 old messages.
  const body = requests[0]?.body ?? "";
  assert.match(body, /earlier messages of this chat were left out/);
  assert.ok(!body.includes("question 0 "), "the oldest turn was left out");
  assert.ok(body.includes("read it"));
});

test("spill: saved results go with the account", async () => {
  const store = new SpillStore(db);
  await store.save("eve", "find_app_tools", "x");
  assert.equal((await db.list("eve", SPILL_KIND)).length, 1);
  await db.removeOwner("eve");
  assert.equal((await db.list("eve", SPILL_KIND)).length, 0);
});
