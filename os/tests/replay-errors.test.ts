import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { type BaseEvent, EventType } from "@ag-ui/client";
import type { AgentRunnerConnectRequest } from "@copilotkit/runtime/v2";
import { firstValueFrom, toArray } from "rxjs";
import {
  duringReplay,
  logsCopilotError,
  replayedRunError,
} from "../apps/mobile/src/conversation-run.ts";
import { createStore, type Store } from "../apps/server/src/db.ts";
import { DatabaseAgentRunner, replayEvents, threadOwner } from "../apps/server/src/thread-runner.ts";
import { ThreadStore } from "../apps/server/src/threads.ts";

let db: Store;
before(async () => {
  db = await createStore();
});
after(async () => {
  await db.close();
});

const started = (runId: string) => ({ type: EventType.RUN_STARTED, threadId: "t1", runId }) as BaseEvent;
const failed = { type: EventType.RUN_ERROR, message: "The model is busy" } as BaseEvent;
const finished = (runId: string) => ({ type: EventType.RUN_FINISHED, threadId: "t1", runId }) as BaseEvent;

test("a saved run that failed is replayed as finished, so the old error is not shown again", () => {
  const replayed = replayEvents([started("r1"), failed, started("r2"), finished("r2")]);
  assert.deepEqual(
    replayed.map((e) => e.type),
    [EventType.RUN_STARTED, EventType.RUN_FINISHED, EventType.RUN_STARTED, EventType.RUN_FINISHED],
  );
  assert.deepEqual(replayed[1], { type: EventType.RUN_FINISHED, threadId: "t1", runId: "r1" });
  // A run never ends twice: an error after its finish is dropped.
  assert.deepEqual(
    replayEvents([started("r3"), finished("r3"), failed]).map((e) => e.type),
    [EventType.RUN_STARTED, EventType.RUN_FINISHED],
  );
});

test("opening a chat with an old failed run sends no RUN_ERROR", async () => {
  const threads = new ThreadStore(db);
  await threads.ensure("alice", "t1", "default");
  await threads.appendRun("alice", "t1", [started("r1"), failed], []);
  const runner = new DatabaseAgentRunner(threads);
  const events = await threadOwner.run("alice", () =>
    firstValueFrom(runner.connect({ threadId: "t1" } as AgentRunnerConnectRequest).pipe(toArray())),
  );
  assert.ok(events.length > 0, "history was replayed");
  assert.ok(!events.some((e) => e.type === EventType.RUN_ERROR));
  assert.ok(events.some((e) => e.type === EventType.RUN_FINISHED));
});

test("the app-wide error handler stays quiet about run errors only while a chat replays", async () => {
  const event = { code: replayedRunError };
  assert.equal(logsCopilotError(event), true, "a live run error is still logged");
  await duringReplay(async () => {
    assert.equal(logsCopilotError(event), false);
    assert.equal(logsCopilotError({ code: "agent_connect_failed" }), true, "other errors still log");
  });
  assert.equal(logsCopilotError(event), true, "the count goes back down");
  await assert.rejects(duringReplay(() => Promise.reject(new Error("offline"))));
  assert.equal(logsCopilotError(event), true, "a failed replay also ends the count");
});
