import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { EventType, type RunAgentInput } from "@ag-ui/core";
import { lastValueFrom, toArray } from "rxjs";
import { createApp } from "../apps/server/src/app.ts";
import type { Config } from "../apps/server/src/config.ts";
import { createStore } from "../apps/server/src/db.ts";
import { ConversationAgent } from "../apps/server/src/engine/conversation.ts";
import {
  canonicalize,
  DEFAULT_TOOL_TIMEOUT_MS,
  RepeatToolGuard,
  TOOL_TIMEOUT,
  timeoutFor,
  withNotice,
  withTimeout,
} from "../apps/server/src/engine/guards.ts";
import { modelFixture } from "./helpers/model.ts";

test("repeat guard: gentle at 3, detailed at 5 and 8, silent in between", () => {
  const guard = new RepeatToolGuard();
  const seen = Array.from({ length: 9 }, () => guard.observe("search_web", { query: "rain" }));
  assert.deepEqual(
    seen.map((notice) => (notice === undefined ? "-" : notice.startsWith("Repeated") ? "D" : "G")),
    ["-", "-", "G", "-", "D", "-", "-", "D", "-"],
  );
  assert.match(seen[4] ?? "", /consecutive_calls: 5/);
  assert.match(seen[4] ?? "", /arguments: \{"query":"rain"\}/);
});

test("repeat guard: property order does not matter, other arguments or tools break the chain", () => {
  const guard = new RepeatToolGuard();
  guard.observe("t", { a: 1, b: { c: 2, d: 3 } });
  guard.observe("t", { b: { d: 3, c: 2 }, a: 1 });
  assert.ok(guard.observe("t", { a: 1, b: { c: 2, d: 3 } }), "the third same call is caught");
  const other = new RepeatToolGuard();
  other.observe("t", { a: 1 });
  other.observe("t", { a: 2 });
  assert.equal(other.observe("t", { a: 1 }), undefined);
  other.observe("u", { a: 1 });
  other.observe("u", { a: 1 });
  assert.ok(other.observe("u", { a: 1 }));
  other.reset();
  assert.equal(other.observe("u", { a: 1 }), undefined);
  assert.equal(canonicalize({ b: [2, { z: 1, y: 2 }], a: null }), '{"a":null,"b":[2,{"y":2,"z":1}]}');
});

test("repeat guard: excluded tools are invisible, include limits the tracked tools", () => {
  const guard = new RepeatToolGuard({ exclude: ["agent_*"] });
  guard.observe("t", {});
  guard.observe("agent_status", {});
  guard.observe("t", {});
  assert.ok(guard.observe("t", {}), "the excluded call did not reset the chain");
  for (let i = 0; i < 5; i++) assert.equal(guard.observe("agent_status", {}), undefined);
  const only = new RepeatToolGuard({ include: ["search_*"] });
  for (let i = 0; i < 4; i++) assert.equal(only.observe("browse_web", {}), undefined);
});

test("repeat guard: long arguments are cut in the reminder only; bad settings fail loudly", () => {
  const guard = new RepeatToolGuard({ thresholds: [2, 3], argumentsPreviewChars: 10 });
  const text = "x".repeat(50);
  guard.observe("t", { text });
  guard.observe("t", { text });
  assert.match(guard.observe("t", { text }) ?? "", /… \(\+\d+ more chars\)/);
  assert.throws(() => new RepeatToolGuard({ thresholds: [] }), /must not be empty/);
  assert.throws(() => new RepeatToolGuard({ thresholds: [1] }), /integer >= 2/);
  assert.throws(() => new RepeatToolGuard({ thresholds: [3, 3] }), /duplicates/);
  assert.throws(() => new RepeatToolGuard({ argumentsPreviewChars: 0 }), /argumentsPreviewChars/);
});

test("time limits: per tool, by pattern, none for the computer, a default for the rest", () => {
  assert.equal(timeoutFor("browse_web"), 90_000);
  assert.equal(timeoutFor("computer_status"), undefined);
  assert.equal(timeoutFor("run_computer_command"), undefined);
  assert.equal(timeoutFor("start_computer"), undefined);
  assert.equal(timeoutFor("use_desktop"), undefined);
  assert.equal(timeoutFor("ask_my_life"), DEFAULT_TOOL_TIMEOUT_MS);
  assert.equal(timeoutFor("x", { x: 5 }), 5);
});

test("a slow tool returns a timeout result and its late failure is swallowed", async () => {
  let rejectLate: (error: Error) => void = () => {};
  const slow = new Promise<string>((_, reject) => {
    rejectLate = reject;
  });
  const result = await withTimeout("slow_tool", () => slow, 20);
  assert.equal((result as { code?: string }).code, TOOL_TIMEOUT);
  assert.match((result as { error: string }).error, /slow_tool took longer than 0 seconds/);
  rejectLate(new Error("late"));
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(await withTimeout("fast", async () => "ok", 1000), "ok");
  assert.equal(await withTimeout("none", async () => "ok", undefined), "ok");
  await assert.rejects(withTimeout("boom", async () => Promise.reject(new Error("boom")), 1000), /boom/);
});

test("a notice rides on the result without changing it", () => {
  assert.deepEqual(withNotice({ a: 1 }, "n"), { a: 1, guardNotice: "n" });
  assert.deepEqual(withNotice("text", "n"), { result: "text", guardNotice: "n" });
  const parts = withNotice([{ type: "text", content: "hi" }], "n") as { content: string }[];
  assert.equal(parts.length, 2);
  assert.match(parts[1]?.content ?? "", /\[Daksha guard\] n/);
});

test("in a real run, the third identical call carries the reminder", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "daksha-guards-"));
  const db = await createStore();
  const config: Config = {
    mode: "sample",
    port: 8787,
    host: "127.0.0.1",
    publicUrl: "http://localhost:8787",
    dataDir: directory,
    agentBackend: "model",
    model: "openai/fixture",
    googleRedirectUri: "http://localhost:8787/api/google/callback",
    allowedOrigins: [],
  };
  const server = await createApp(db, config);
  t.after(async () => {
    await server.agent.stop();
    await db.close();
    await rm(directory, { recursive: true, force: true });
  });
  await modelFixture(t, (i) => (i < 3 ? { name: "agent_status", arguments: {} } : undefined));
  const input: RunAgentInput = {
    threadId: `thread-${randomUUID()}`,
    runId: randomUUID(),
    messages: [{ id: randomUUID(), role: "user", content: "what's going on" }],
    tools: [],
    context: [],
    state: {},
  };
  const events = await lastValueFrom(
    new ConversationAgent(config, server.agent, "11111111-1111-4111-8111-111111111111").run(input).pipe(toArray()),
  );
  const results = events
    .filter((e) => e.type === EventType.TOOL_CALL_RESULT)
    .map((e) => JSON.parse((e as unknown as { content: string }).content) as { guardNotice?: string });
  assert.equal(results.length, 3);
  assert.equal(results[0]?.guardNotice, undefined);
  assert.equal(results[1]?.guardNotice, undefined);
  assert.match(results[2]?.guardNotice ?? "", /repeating the exact same tool call/);
});
