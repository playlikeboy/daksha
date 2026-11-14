import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { EventType, type RunAgentInput } from "@ag-ui/core";
import { Hono } from "hono";
import { lastValueFrom, toArray } from "rxjs";
import { createApp } from "../apps/server/src/app.ts";
import type { Config } from "../apps/server/src/config.ts";
import {
  ConnectorService,
  connectorRoutes,
  FakeConnectorBackend,
  wrapAppData,
} from "../apps/server/src/connectors/index.ts";
import { createStore } from "../apps/server/src/db.ts";
import { ConversationAgent } from "../apps/server/src/engine/conversation.ts";
import type { ActionProposal } from "../packages/domain/src/index.ts";
import { APPROVAL_MESSAGE } from "../apps/server/src/voice/brain.ts";
import { EngineVoiceBrain } from "../apps/server/src/voice/engine-brain.ts";
import { modelFixture } from "./helpers/model.ts";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

async function fixture(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), "debo-connectors-power-"));
  const db = await createStore();
  const backend = new FakeConnectorBackend();
  const service = new ConnectorService({
    backend,
    publicUrl: "http://localhost:8787",
    googleBuiltIn: false,
    log: () => undefined,
  });
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
  const server = await createApp(db, config, { connectors: service });
  t.after(async () => {
    await server.agent.stop();
    await db.close();
    await rm(directory, { recursive: true, force: true });
  });
  return { db, backend, service, server, config };
}

async function ask(conversation: ConversationAgent, text = "do it") {
  const input: RunAgentInput = {
    threadId: `thread-${randomUUID()}`,
    runId: randomUUID(),
    messages: [{ id: randomUUID(), role: "user", content: text }],
    tools: [],
    context: [],
    state: {},
  };
  const events = await lastValueFrom(conversation.run(input).pipe(toArray()));
  assert.equal(events.at(-1)?.type, EventType.RUN_FINISHED, JSON.stringify(events.at(-1)));
  return events;
}
const results = (events: Awaited<ReturnType<typeof ask>>) =>
  events
    .filter((e) => e.type === EventType.TOOL_CALL_RESULT)
    .map((e) => JSON.parse((e as unknown as { content: string }).content));
const toolNames = (body: string) =>
  ((JSON.parse(body).tools ?? []) as { name: string }[]).map((x) => x.name);

const slackSend = {
  name: "use_app_tool",
  arguments: { tool: "SLACK_SEND_MESSAGE", arguments: { channel: "#general", text: "Lunch at noon" } },
};

test("mail goes through the person's connected Gmail, not the old Google tools", async (t) => {
  const f = await fixture(t);
  f.backend.connect(A, "gmail");
  await f.db.put(A, "settings", { id: "google", enabled: false });
  f.backend.respond = () => ({ messages: [{ subject: "Welcome", from: "a@example.com" }] });
  const { requests } = await modelFixture(t, (i) =>
    i === 0
      ? { name: "find_app_tools", arguments: { request: "latest emails" } }
      : i === 1
        ? {
            name: "use_app_tool",
            arguments: { tool: "GMAIL_FETCH_EMAILS", arguments: { query: "in:inbox" } },
          }
        : undefined,
  );
  const chat = new ConversationAgent(f.config, f.server.agent, A);
  const out = results(await ask(chat, "whats the latest emails in my mailbox"));
  assert.equal(out.length, 2);
  assert.match(out[1].source, /Gmail, untrusted data/);
  assert.match(out[1].data, /Welcome/);
  const names = toolNames(requests[0].body);
  assert.ok(names.includes("find_app_tools") && names.includes("use_app_tool"));
  for (const gone of ["search_mail", "read_mail_thread", "read_calendar"])
    assert.ok(!names.includes(gone), `${gone} must not be offered`);
  assert.match(requests[0].body, /connected right now: Gmail/);
});

test("a person whose own Google is on still gets the built-in mail and calendar tools", async (t) => {
  const f = await fixture(t);
  const { requests } = await modelFixture(t, () => undefined);
  await ask(new ConversationAgent(f.config, f.server.agent, B), "hi");
  const names = toolNames(requests[0].body);
  for (const kept of ["search_mail", "read_mail_thread", "read_calendar"])
    assert.ok(names.includes(kept), kept);
});

test("with no apps connected the agent is told so and sent to Apps", async (t) => {
  const f = await fixture(t);
  await f.db.put(A, "settings", { id: "google", enabled: false });
  const { requests } = await modelFixture(t, () => undefined);
  await ask(new ConversationAgent(f.config, f.server.agent, A), "what is in my mailbox");
  assert.match(requests[0].body, /has not connected any app yet/);
});

test("voice has the app tools, and a change by voice waits for the on-screen yes", async (t) => {
  const f = await fixture(t);
  f.backend.connect(A, "slack");
  const { requests } = await modelFixture(t, (i) => (i === 0 ? slackSend : undefined));
  const runner = {
    run: ({ agent }: { agent: ConversationAgent }) =>
      agent.run({
        threadId: "voice-v1",
        runId: randomUUID(),
        messages: agent.messages,
        tools: [],
        context: [],
        state: {},
      }),
    stop: async () => true,
  };
  const threads = { history: async () => ({ id: "x", events: [], messages: [] }) };
  const brain = new EngineVoiceBrain(f.config, f.server.agent, runner as never, threads as never);
  const events: { type: string; text?: string }[] = [];
  for await (const e of brain.answer(
    { userId: A, sessionId: "v1", question: "tell the team lunch at noon", history: [] },
    new AbortController().signal,
  ))
    events.push(e as { type: string; text?: string });
  assert.ok(toolNames(requests[0].body).includes("use_app_tool"));
  assert.match(requests[0].body, /SPEAKING OUT LOUD/);
  assert.equal(f.backend.executed.length, 0);
  const actions = await f.db.list<ActionProposal>(A, "actions");
  assert.equal(actions.length, 1);
  assert.equal(actions[0].status, "awaiting_review");
  assert.ok(events.some((e) => e.type === "say" && e.text === APPROVAL_MESSAGE));
});

test("a huge app answer is shortened so it cannot flood the model", () => {
  const mailbox = {
    messages: Array.from({ length: 200 }, (_, i) => ({
      id: i,
      subject: `Mail ${i}`,
      body: "word ".repeat(2000),
    })),
  };
  const wrapped = wrapAppData("Gmail", mailbox);
  assert.equal(wrapped.truncated, true);
  assert.ok(wrapped.data.length < 17_000);
  assert.match(wrapped.notice, /shortened/);
  assert.match(wrapped.data, /Mail 0/);
  const small = wrapAppData("Gmail", { a: "short" });
  assert.equal(small.truncated, false);
});

test("browse pages through the whole catalogue, filters by category, and search finds any app", async (t) => {
  const f = await fixture(t);
  f.backend.toolkits = Array.from({ length: 95 }, (_, i) => ({
    slug: `app${i}`,
    name: `App ${i}`,
    description: i % 2 ? "Email tool" : "Other",
    connectable: i % 5 !== 0,
    categories: [i % 2 ? "Email" : "CRM"],
  }));
  const seen = new Set<string>();
  let offset: number | null = 0;
  let pages = 0;
  while (offset !== null) {
    const page = await f.service.browse({ offset, limit: 30 });
    assert.equal(page.total, 95);
    for (const item of page.items) seen.add(item.slug);
    offset = page.nextOffset;
    pages += 1;
  }
  assert.equal(seen.size, 95);
  assert.equal(pages, 4);
  const first = await f.service.browse({ limit: 5 });
  assert.ok(first.categories?.some((c) => c.name === "Email"));
  assert.equal((await f.service.browse({ offset: 5, limit: 5 })).categories, undefined);
  const email = await f.service.browse({ category: "email", limit: 50 });
  assert.equal(email.total, 47);
  assert.equal((await f.service.browse({ query: "app 94" })).items[0]?.slug, "app94");
  const api = new Hono<{ Variables: { owner: string } }>();
  api.use("*", async (c, next) => {
    c.set("owner", A);
    await next();
  });
  api.route("/api/connectors", connectorRoutes(f.service));
  const res = await api.request("/api/connectors/search?q=app&offset=20&limit=10");
  const body = await res.json();
  assert.equal(body.items.length, 10);
  assert.equal(body.nextOffset, 30);
  assert.equal(body.total, 95);
});
