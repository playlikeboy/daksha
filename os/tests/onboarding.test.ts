import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { Hono } from "hono";
import { createStore, type Store } from "../apps/server/src/db.ts";
import { OnboardingStore, onboardingRoutes } from "../apps/server/src/onboarding.ts";

let db: Store;
before(async () => {
  db = await createStore();
});
after(async () => {
  await db.close();
});

test("onboarding: unseen, then finished, per person, and reset", async () => {
  const store = new OnboardingStore(db);
  assert.equal(await store.get("a"), null);
  await store.set("a", { status: "finished" });
  assert.equal((await store.get("a"))?.status, "finished");
  assert.equal(await store.get("b"), null);
  await store.set("a", { status: "skipped" });
  assert.equal((await store.get("a"))?.status, "skipped");
  await store.reset("a");
  assert.equal(await store.get("a"), null);
  await assert.rejects(store.set("a", { status: "maybe" }));
});

test("onboarding routes read, set and reset for the signed-in person only", async () => {
  const app = new Hono<{ Variables: { owner: string } }>();
  app.use("*", async (c, next) => {
    c.set("owner", c.req.header("x-owner") ?? "route-owner");
    await next();
  });
  app.route("/o", onboardingRoutes(new OnboardingStore(db)));
  const json = { "Content-Type": "application/json" };
  assert.equal((await (await app.request("/o")).json()).onboarding, null);
  const put = await app.request("/o", { method: "PUT", headers: json, body: JSON.stringify({ status: "finished" }) });
  assert.equal((await put.json()).onboarding.status, "finished");
  assert.equal((await (await app.request("/o")).json()).onboarding.status, "finished");
  // Someone else has not seen it.
  assert.equal((await (await app.request("/o", { headers: { "x-owner": "other" } })).json()).onboarding, null);
  assert.equal((await (await app.request("/o", { method: "DELETE" })).json()).onboarding, null);
  assert.equal((await (await app.request("/o")).json()).onboarding, null);
});
