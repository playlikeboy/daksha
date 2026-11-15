import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { Hono } from "hono";
import { createStore } from "../apps/server/src/db.ts";
import { memoryStore } from "../apps/server/src/debo/dev-store.ts";
import { AppError } from "../apps/server/src/errors.ts";
import { imagePromptProblem } from "../apps/server/src/images/guard.ts";
import { bindingImages } from "../apps/server/src/images/makers.ts";
import { imageRoutes, imageTools } from "../apps/server/src/images/routes.ts";
import { ImageService } from "../apps/server/src/images/service.ts";
import { OwnKeysService } from "../apps/server/src/own-keys/service.ts";
import { handleAi, IMAGE_MODEL, type AiLike } from "../infra/cloudflare/api/src/media.ts";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const OPENROUTER_KEY = "sk-or-v1-TESTKEYqrstuvwxyz0123456789-4321";
/** The first bytes of a JPEG and a PNG, enough for the type check. */
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]).toString("base64");
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9]).toString("base64");

/** The Worker's AI binding, faked: the real handler from os/infra runs in front of it. */
function fakeAi(behaviour: "ok" | "unsafe" = "ok") {
  const runs: { model: string; input: Record<string, unknown> }[] = [];
  const ai: AiLike = {
    async run(model, input) {
      runs.push({ model, input });
      if (behaviour === "unsafe") throw new Error("NSFW content detected");
      return { image: JPEG };
    },
  };
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) =>
    handleAi(new Request(String(input), init), ai)) as typeof fetch;
  return { runs, maker: bindingImages("http://ai.internal", fetcher) };
}

async function fixture(options: { behaviour?: "ok" | "unsafe"; perDay?: number } = {}) {
  const db = await createStore();
  const store = memoryStore("http://localhost:8787");
  const ai = fakeAi(options.behaviour);
  const logs: string[] = [];
  const openRouterCalls: { url: string; auth: string | null; body: string }[] = [];
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const auth = new Headers(init?.headers).get("authorization");
    if (url === "https://openrouter.ai/api/v1/images") {
      openRouterCalls.push({ url, auth, body: String(init?.body) });
      return new Response(JSON.stringify({ data: [{ b64_json: PNG, media_type: "image/png" }] }), { status: 200 });
    }
    if (auth !== `Bearer ${OPENROUTER_KEY}`) return new Response("{}", { status: 401 });
    return new Response(JSON.stringify({ data: {} }), { status: 200 });
  }) as typeof fetch;
  const ownKeys = new OwnKeysService(db, { encryptionKey: randomBytes(32).toString("base64"), fetcher, log: () => {} });
  const images = new ImageService(db, {
    store: () => store,
    maker: ai.maker,
    ownKeys,
    fetcher,
    perDay: options.perDay,
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
  api.route("/api/images", imageRoutes(images));
  return { db, store, ai, images, ownKeys, api, logs, openRouterCalls, as: (id: string) => (owner = id) };
}

const runTool = async (images: ImageService, owner: string, args: unknown) => {
  const [tool] = imageTools(images, owner, "chat");
  assert.equal(tool?.name, "make_image");
  return (tool?.execute as (a: unknown) => Promise<Record<string, unknown>>)(args);
};

test("make_image draws on Workers AI, keeps the picture in the bucket, and the app gets a link", async () => {
  const f = await fixture();
  const result = await runTool(f.images, A, { prompt: "a red kite over a green hill", style: "watercolor" });
  assert.equal(result.status, "made");
  const id = String(result.imageId);
  assert.equal(f.ai.runs.length, 1);
  assert.equal(f.ai.runs[0]?.model, IMAGE_MODEL);
  assert.equal(f.ai.runs[0]?.input.prompt, "a red kite over a green hill. Style: watercolor.");
  assert.ok(f.store.objects.has(`${A}/${id}.jpg`), "the file is under the owner's folder");

  const link = await f.api.request(`/api/images/${id}`);
  assert.equal(link.status, 200);
  const body = (await link.json()) as { url: string; prompt: string };
  assert.match(body.url, /^http:\/\/localhost:8787\/api\/dev-r2\//);
  assert.equal(body.prompt, "a red kite over a green hill");

  // Another person can't see it.
  f.as(B);
  assert.equal((await f.api.request(`/api/images/${id}`)).status, 404);
  f.as(A);

  // The prompt is never logged.
  for (const line of f.logs) assert.ok(!line.includes("kite"), "logs carry ids only");

  // Deleting it deletes the file too.
  assert.equal((await f.api.request(`/api/images/${id}`, { method: "DELETE" })).status, 200);
  assert.ok(!f.store.objects.has(`${A}/${id}.jpg`));
  assert.equal((await f.api.request(`/api/images/${id}`)).status, 404);
});

test("the daily limit counts pictures on Debo's service, and deleting one does not reset it", async () => {
  const f = await fixture({ perDay: 2 });
  const first = await runTool(f.images, A, { prompt: "a cat" });
  await runTool(f.images, A, { prompt: "a dog" });
  await f.images.remove(A, String(first.imageId));
  const third = await runTool(f.images, A, { prompt: "a bird" });
  assert.equal(third.status, "failed");
  assert.match(String(third.error), /daily limit/);
  assert.equal(f.ai.runs.length, 2, "no third call to the picture service");
  assert.equal((await runTool(f.images, B, { prompt: "a bird" })).status, "made", "the limit is per person");
});

test("a person's own OpenRouter picture model is used instead, on their key, with no Debo limit", async () => {
  const f = await fixture({ perDay: 0 });
  await f.ownKeys.save(A, "openrouter", { key: OPENROUTER_KEY, imageModel: "google/gemini-3.1-flash-image" });
  const result = await runTool(f.images, A, { prompt: "a lighthouse at dawn", shape: "wide" });
  assert.equal(result.status, "made", JSON.stringify(result));
  assert.equal(result.shape, "wide");
  assert.equal(f.ai.runs.length, 0, "Debo's service was not used");
  assert.equal(f.openRouterCalls.length, 1);
  assert.equal(f.openRouterCalls[0]?.auth, `Bearer ${OPENROUTER_KEY}`);
  assert.match(f.openRouterCalls[0]?.body ?? "", /"model":"google\/gemini-3.1-flash-image"/);
  assert.match(f.openRouterCalls[0]?.body ?? "", /"aspect_ratio":"16:9"/);
  assert.ok(f.store.objects.has(`${A}/${result.imageId}.png`));
});

test("unsafe requests are refused before any service is asked, and the service's own refusal is plain", async () => {
  assert.match(imagePromptProblem("a nude photo of my neighbour") ?? "", /don't make sexual/);
  assert.match(imagePromptProblem("a fake passport with my face") ?? "", /fool people/);
  assert.match(imagePromptProblem("a deepfake of the president") ?? "", /fool people/);
  assert.equal(imagePromptProblem("a birthday cake with seven candles"), null);

  const f = await fixture();
  const refused = await runTool(f.images, A, { prompt: "naked people on a beach" });
  assert.equal(refused.status, "failed");
  assert.equal(f.ai.runs.length, 0);

  const g = await fixture({ behaviour: "unsafe" });
  const turnedDown = await runTool(g.images, A, { prompt: "a quiet forest" });
  assert.equal(turnedDown.status, "failed");
  assert.match(String(turnedDown.error), /turned this request down/);
  assert.equal(g.store.objects.size, 0, "nothing is stored");
});

test("removeAll deletes every picture and its record, for account deletion", async () => {
  const f = await fixture();
  await runTool(f.images, A, { prompt: "one" });
  await runTool(f.images, A, { prompt: "two" });
  await runTool(f.images, B, { prompt: "three" });
  assert.equal(await f.images.removeAll(A), 2);
  assert.equal((await f.images.list(A)).length, 0);
  assert.equal([...f.store.objects.keys()].filter((k) => k.startsWith(`${A}/`)).length, 0);
  assert.equal((await f.images.list(B)).length, 1, "another person's pictures stay");
});

test("the Worker's /image route passes only the prompt and steps", async () => {
  const runs: Record<string, unknown>[] = [];
  const ai: AiLike = {
    async run(_model, input) {
      runs.push(input);
      return { image: JPEG };
    },
  };
  const ok = await handleAi(
    new Request("http://ai.internal/image", {
      method: "POST",
      body: JSON.stringify({ prompt: "a boat", steps: 4, extra: "dropped" }),
    }),
    ai,
  );
  assert.equal(ok.status, 200);
  assert.deepEqual(runs[0], { prompt: "a boat", steps: 4 });
  const empty = await handleAi(new Request("http://ai.internal/image", { method: "POST", body: "{}" }), ai);
  assert.equal(empty.status, 400);
});
