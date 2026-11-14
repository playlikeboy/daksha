import assert from "node:assert/strict";
import { test } from "node:test";
import type { RunAgentInput } from "@ag-ui/client";
import { objectToolArguments } from "../apps/server/src/engine/tanstack-agent.ts";

const call = (args: unknown) => ({ id: "c1", type: "function", function: { name: "clear_persona", arguments: args } });
const input = (args: unknown) =>
  ({
    threadId: "t",
    runId: "r",
    tools: [],
    context: [],
    messages: [
      { id: "1", role: "user", content: "stop the role" },
      { id: "2", role: "assistant", content: "", toolCalls: [call(args)] },
      { id: "3", role: "tool", toolCallId: "c1", content: "done" },
    ],
  }) as unknown as RunAgentInput;
const args = (value: RunAgentInput) =>
  (value.messages[1] as unknown as { toolCalls: { function: { arguments: string } }[] }).toolCalls[0]?.function.arguments;

test("a saved tool call with empty or broken arguments is sent to the model as an empty object", () => {
  for (const bad of ["", "null", "[]", '"text"', "{broken", undefined]) assert.equal(args(objectToolArguments(input(bad))), "{}");
});

test("good arguments and other messages are left exactly as they were", () => {
  const good = input('{"day":"2026-11-14"}');
  assert.equal(objectToolArguments(good), good);
});
