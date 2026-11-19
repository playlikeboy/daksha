import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { EventType, type RunAgentInput } from "@ag-ui/core";
import { defineTool } from "@copilotkit/runtime/v2";
import { Hono } from "hono";
import { z } from "zod";
import { accountRoutes } from "../apps/server/src/account.ts";
import type { Config } from "../apps/server/src/config.ts";
import { createStore } from "../apps/server/src/db.ts";
import { tanstackAgent } from "../apps/server/src/engine/tanstack-agent.ts";
import { AppError } from "../apps/server/src/errors.ts";
import { Files } from "../apps/server/src/files.ts";
import { ownKeyRoutes } from "../apps/server/src/own-keys/routes.ts";
import { OwnKeysService } from "../apps/server/src/own-keys/service.ts";
import { chatCompletionsFixture } from "./helpers/model.ts";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const ENC = randomBytes(32).toString("base64");
const ANTHROPIC_KEY = "sk-ant-api03-TESTKEYabcdefghijklmnop-9876";
const OPENROUTER_KEY = "sk-or-v1-TESTKEYqrstuvwxyz0123456789-4321";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** Anthropic's Models API and OpenRouter, in this process. Only the right keys are accepted. */
function fakeProviders(options: { toolModels?: string[] } = {}) {
  const seen: string[] = [];
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    const headers = new Headers(input instanceof Request ? input.headers : init?.headers);
    seen.push(url);
    if (url.startsWith("https://api.anthropic.com/v1/models/")) {
      if (headers.get("x-api-key") !== ANTHROPIC_KEY)
        return json({ type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }, 401);
      const id = url.split("/").at(-1) ?? "";
      if (!id.startsWith("claude-haiku") && !id.startsWith("claude-sonnet"))
        return json({ type: "error", error: { type: "not_found_error", message: "model not found" } }, 404);
      return json({ type: "model", id, display_name: id, created_at: "2026-10-01T00:00:00Z" });
    }
    if (url.startsWith("https://openrouter.ai/api/v1/")) {
      if (headers.get("authorization") !== `Bearer ${OPENROUTER_KEY}`) return json({ error: { message: "No auth" } }, 401);
      if (url.endsWith("/key")) return json({ data: { label: "test" } });
      const chat = url.match(/\/models\/(.+)\/endpoints$/)?.[1];
      if (chat && !url.includes("/images/")) {
        if (chat === "missing/model") return json({ error: { message: "not found" } }, 404);
        const tools = (options.toolModels ?? ["google/gemini-3.8-flash"]).includes(chat);
        return json({ data: { endpoints: [{ supported_parameters: tools ? ["tools", "max_tokens"] : ["max_tokens"] }] } });
      }
      const image = url.match(/\/images\/models\/(.+)\/endpoints$/)?.[1];
      if (image) return image === "google/gemini-3.1-flash-image" ? json({ id: image, endpoints: [{}] }) : json({}, 404);
    }
    return new Response("unexpected", { status: 500 });
  }) as typeof fetch;
  return { fetcher, seen };
}

async function fixture(toolModels?: string[]) {
  const db = await createStore();
  const logs: string[] = [];
  const providers = fakeProviders({ toolModels });
  const keys = new OwnKeysService(db, {
    encryptionKey: ENC,
    fetcher: providers.fetcher,
    log: (entry) => logs.push(JSON.stringify(entry)),
  });
  const api = new Hono<{ Variables: { owner: string } }>();
  let owner = A;
  api.use("*", async (c, next) => {
    c.set("owner", owner);
    await next();
  });
  api.onError((error, c) =>
    error instanceof AppError ? c.json({ error: error.message }, error.status) : c.json({ error: "failed" }, 500),
  );
  api.route("/api/own-keys", ownKeyRoutes(keys));
  const config = { mode: "sample", dataDir: "/nonexistent" } as unknown as Config;
  const files = new Files(db, config, { sign: () => "", verify: () => A } as never);
  api.route("/api/account", accountRoutes(db, files, undefined, undefined, undefined, keys));
  const call = async (path: string, init?: { method?: string; body?: unknown }) => {
    const response = await api.request(path, {
      method: init?.method ?? "GET",
      headers: { "content-type": "application/json" },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    });
    return { status: response.status, text: await response.text() };
  };
  return { db, keys, call, logs, providers, as: (id: string) => (owner = id) };
}

test("a key is checked, stored encrypted, read back on the server, and never sent to the app", async () => {
  const f = await fixture();
  const saved = await f.call("/api/own-keys/anthropic", { method: "PUT", body: { key: ANTHROPIC_KEY, model: "claude-sonnet-5-5" } });
  assert.equal(saved.status, 200, saved.text);
  assert.ok(!saved.text.includes(ANTHROPIC_KEY), "the save answer has no key");
  assert.match(saved.text, /"endsIn":"9876"/);

  // Encryption round trip: the stored record is not the key, the server can read it back.
  const rows = await f.db.listOwner(A);
  const credential = rows.find((row) => row.kind === "credentials");
  assert.ok(credential, "an encrypted credential record exists");
  assert.ok(!JSON.stringify(rows).includes(ANTHROPIC_KEY), "no record holds the key in plain text");
  assert.equal(await f.keys.secret(A, "anthropic"), ANTHROPIC_KEY);
  assert.equal(await f.keys.secret(B, "anthropic"), undefined, "another person sees nothing");

  const listed = await f.call("/api/own-keys");
  assert.ok(!listed.text.includes(ANTHROPIC_KEY));
  assert.match(listed.text, /"provider":"anthropic","set":true,"endsIn":"9876","model":"claude-sonnet-5-5"/);

  const exported = await f.call("/api/account/export");
  assert.ok(!exported.text.includes(ANTHROPIC_KEY), "the download has no key");
  assert.ok(!exported.text.includes("9876"), "the download does not even have the last characters");
  assert.deepEqual(JSON.parse(exported.text).ownKeys, [{ provider: "anthropic", keySet: true }]);

  for (const line of f.logs) assert.ok(!line.includes(ANTHROPIC_KEY) && !line.includes("9876"), "logs carry no key");
});

test("a key that fails its check is not kept, and the reason is plain", async () => {
  const f = await fixture();
  const bad = await f.call("/api/own-keys/anthropic", { method: "PUT", body: { key: "sk-ant-api03-wrongwrongwrong-0000" } });
  assert.equal(bad.status, 400);
  assert.match(bad.text, /Anthropic did not accept that key/);
  assert.equal(await f.keys.secret(A, "anthropic"), undefined);
  assert.equal((await f.keys.list(A)).length, 0);

  const model = await f.call("/api/own-keys/anthropic", { method: "PUT", body: { key: ANTHROPIC_KEY, model: "claude-imaginary-9" } });
  assert.equal(model.status, 400);
  assert.match(model.text, /doesn't know the model/);

  const shape = await f.call("/api/own-keys/openrouter", { method: "PUT", body: { key: "has spaces in it" } });
  assert.equal(shape.status, 400);
  assert.ok(!shape.text.includes("has spaces"), "the error never repeats what was typed");
});

test("an OpenRouter chat model must support tools; a picture model must exist", async () => {
  const f = await fixture(["google/gemini-3.8-flash"]);
  const noTools = await f.call("/api/own-keys/openrouter", {
    method: "PUT",
    body: { key: OPENROUTER_KEY, model: "some/plain-model" },
  });
  assert.equal(noTools.status, 400);
  assert.match(noTools.text, /can't use tools/);
  const unknown = await f.call("/api/own-keys/openrouter", {
    method: "PUT",
    body: { key: OPENROUTER_KEY, imageModel: "not/an-image-model" },
  });
  assert.equal(unknown.status, 400);
  assert.match(unknown.text, /not a picture model/);
  const ok = await f.call("/api/own-keys/openrouter", {
    method: "PUT",
    body: { key: OPENROUTER_KEY, model: "google/gemini-3.8-flash", imageModel: "google/gemini-3.1-flash-image" },
  });
  assert.equal(ok.status, 200, ok.text);
  assert.ok(!ok.text.includes(OPENROUTER_KEY));
  // Changing only the model keeps the saved key.
  const changed = await f.call("/api/own-keys/openrouter", { method: "PUT", body: { model: "google/gemini-3.8-flash" } });
  assert.equal(changed.status, 200, changed.text);
  assert.equal(await f.keys.secret(A, "openrouter"), OPENROUTER_KEY);
  assert.equal(await f.keys.imageChoice(A), undefined, "the picture model was cleared");
});

test("which model a chat uses: Anthropic key first, OpenRouter with a chat model next, else Daksha's", async () => {
  const f = await fixture();
  assert.equal(await f.keys.chatChoice(A, "anthropic/claude-haiku-5-5"), undefined);
  await f.keys.save(A, "openrouter", { key: OPENROUTER_KEY, imageModel: "google/gemini-3.1-flash-image" });
  assert.equal(await f.keys.chatChoice(A), undefined, "a pictures-only OpenRouter key leaves chat on Daksha's");
  await f.keys.save(A, "openrouter", { model: "google/gemini-3.8-flash", imageModel: "google/gemini-3.1-flash-image" });
  assert.deepEqual(await f.keys.chatChoice(A), {
    provider: "openrouter",
    spec: "openrouter/google/gemini-3.8-flash",
    apiKey: OPENROUTER_KEY,
  });
  await f.keys.save(A, "anthropic", { key: ANTHROPIC_KEY });
  assert.deepEqual(await f.keys.chatChoice(A, "anthropic/claude-haiku-5-5"), {
    provider: "anthropic",
    spec: "anthropic/claude-haiku-5-5",
    apiKey: ANTHROPIC_KEY,
  });
  const removed = await f.call("/api/own-keys/anthropic", { method: "DELETE" });
  assert.equal(removed.status, 200);
  assert.equal(await f.keys.secret(A, "anthropic"), undefined, "removing deletes the key");
  assert.equal((await f.keys.chatChoice(A))?.provider, "openrouter");
});

test("deleting the account deletes every key", async () => {
  const f = await fixture();
  await f.keys.save(A, "anthropic", { key: ANTHROPIC_KEY });
  await f.keys.save(B, "anthropic", { key: ANTHROPIC_KEY });
  const gone = await f.call("/api/account", { method: "DELETE", body: { confirm: true } });
  assert.equal(gone.status, 200, gone.text);
  assert.equal(await f.keys.secret(A, "anthropic"), undefined);
  assert.equal((await f.keys.list(A)).length, 0);
  assert.equal(await f.keys.secret(B, "anthropic"), ANTHROPIC_KEY, "another person's key stays");
});

test("without TOKEN_ENCRYPTION_KEY no key is saved", async () => {
  const db = await createStore();
  const keys = new OwnKeysService(db, { fetcher: fakeProviders().fetcher });
  await assert.rejects(keys.save(A, "anthropic", { key: ANTHROPIC_KEY }), /can't store keys safely/);
  assert.equal(keys.available, false);
});

test("an OpenRouter chat runs through Chat Completions on the person's key, with tools", async (t) => {
  const { requests } = await chatCompletionsFixture(t, (index) =>
    index === 0 ? { name: "note_step", arguments: { note: "done" } } : undefined,
  );
  const previous = process.env.OPENROUTER_BASE_URL;
  process.env.OPENROUTER_BASE_URL = process.env.OPENAI_BASE_URL;
  t.after(() => {
    if (previous === undefined) delete process.env.OPENROUTER_BASE_URL;
    else process.env.OPENROUTER_BASE_URL = previous;
  });
  let toolRuns = 0;
  const agent = tanstackAgent({
    model: "openrouter/google/gemini-3.8-flash",
    apiKey: OPENROUTER_KEY,
    maxSteps: 3,
    tools: [
      defineTool({
        name: "note_step",
        description: "Record a step note",
        parameters: z.object({ note: z.string() }),
        execute: async () => {
          toolRuns++;
          return { ok: true };
        },
      }),
    ],
    prompt: "Use the tool once.",
  });
  const input: RunAgentInput = {
    threadId: "own-key",
    runId: "own-key-run",
    messages: [{ id: "m1", role: "user", content: "Go" }],
    state: {},
    tools: [],
    context: [],
    forwardedProps: {},
  };
  let error: string | undefined;
  await new Promise<void>((resolve) =>
    agent.run(input).subscribe({
      next: (event) => {
        if (event.type === EventType.RUN_ERROR && "message" in event) error = String(event.message);
      },
      error: (cause) => {
        error = String(cause);
        resolve();
      },
      complete: () => resolve(),
    }),
  );
  assert.equal(error, undefined);
  assert.equal(toolRuns, 1, "tool calling still works");
  assert.ok(requests.length >= 2);
  for (const request of requests) {
    assert.equal(request.path, "/v1/chat/completions");
    assert.equal(request.authorization, `Bearer ${OPENROUTER_KEY}`, "the person's key, not Daksha's");
    assert.match(request.body, /"model":"google\/gemini-3.8-flash"/);
  }
});
