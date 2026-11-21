// A turned-on skill reaches the chat as a name and one line, and its text only through load_skill.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { EventType, type RunAgentInput } from "@ag-ui/core";
import { lastValueFrom, toArray } from "rxjs";
import { createApp } from "../apps/server/src/app.ts";
import type { Config } from "../apps/server/src/config.ts";
import { createStore } from "../apps/server/src/db.ts";
import { ConversationAgent } from "../apps/server/src/engine/conversation.ts";
import { modelFixture } from "./helpers/model.ts";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

async function fixture(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), "daksha-skills-chat-"));
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
  return { server, config };
}

async function ask(conversation: ConversationAgent, text: string) {
  const input: RunAgentInput = {
    threadId: `thread-${randomUUID()}`,
    runId: randomUUID(),
    messages: [{ id: randomUUID(), role: "user", content: text }],
    tools: [],
    context: [],
    state: {},
  };
  return lastValueFrom(conversation.run(input).pipe(toArray()));
}
const toolNames = (body: string) => ((JSON.parse(body).tools ?? []) as { name: string }[]).map((x) => x.name);

test("a turned-on skill is listed by name, and load_skill reads its text", async (t) => {
  const f = await fixture(t);
  await f.server.agent.skills?.set(A, "humanizer", { enabled: true });
  const { requests } = await modelFixture(t, (i) =>
    i === 0 ? { name: "load_skill", arguments: { name: "humanizer" } } : undefined,
  );
  const events = await ask(new ConversationAgent(f.config, f.server.agent, A), "make this sound like me");
  assert.ok(toolNames(requests[0].body).includes("load_skill"));
  assert.match(requests[0].body, /SKILLS the person turned on/);
  assert.match(requests[0].body, /humanizer: Humanize text/);
  assert.doesNotMatch(requests[0].body, /WikiProject AI Cleanup/, "the text is not in the first prompt");
  const result = events.find((e) => e.type === EventType.TOOL_CALL_RESULT) as { content?: string } | undefined;
  assert.match(result?.content ?? "", /skill_instructions/);
  assert.match(result?.content ?? "", /WikiProject AI Cleanup/);
});

test("with no skill turned on there is no load_skill and no SKILLS list", async (t) => {
  const f = await fixture(t);
  await f.server.agent.skills?.set(A, "humanizer", { enabled: true });
  const { requests } = await modelFixture(t, () => undefined);
  await ask(new ConversationAgent(f.config, f.server.agent, B), "hi");
  assert.ok(!toolNames(requests[0].body).includes("load_skill"));
  assert.doesNotMatch(requests[0].body, /SKILLS the person turned on/);
});
