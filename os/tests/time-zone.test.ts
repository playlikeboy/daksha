import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { timeZoneHeaders } from "../apps/mobile/src/time-zone.ts";
import { createApp } from "../apps/server/src/app.ts";
import { buildCheckin, companionTools } from "../apps/server/src/companion.ts";
import type { Config } from "../apps/server/src/config.ts";
import { createStore, type Store } from "../apps/server/src/db.ts";
import {
  readTimeZone,
  requestTimeZone,
  TIME_ZONE_ID,
  TIME_ZONE_KIND,
  TimeZoneStore,
  todayPrompt,
} from "../apps/server/src/time-zone.ts";

let db: Store;
let directory: string;
before(async () => {
  db = await createStore();
  directory = await mkdtemp(join(tmpdir(), "debo-tz-"));
});
after(async () => {
  await db.close();
  await rm(directory, { recursive: true, force: true });
});

// 20:00 UTC on the 14th is already the 15th in Kolkata (UTC+5:30).
const lateEvening = new Date("2026-11-14T20:00:00Z");

test("only real zone names are accepted", () => {
  assert.equal(readTimeZone("Asia/Kolkata"), "Asia/Kolkata");
  assert.equal(readTimeZone(" Europe/London "), "Europe/London");
  assert.equal(readTimeZone("Not/AZone"), undefined);
  assert.equal(readTimeZone(""), undefined);
  assert.equal(readTimeZone(42), undefined);
  assert.equal(readTimeZone("x".repeat(65)), undefined);
});

test("the last zone is kept on the person's own records, and only theirs", async () => {
  const zones = new TimeZoneStore(db);
  assert.equal(await zones.get("tz-alice"), undefined);
  await zones.remember("tz-alice", "Asia/Kolkata");
  assert.equal(await zones.get("tz-alice"), "Asia/Kolkata");
  assert.equal(await zones.get("tz-bob"), undefined, "another person sees nothing");
  const saved = await db.get<{ id: string; timeZone: string; updatedAt: string }>(
    "tz-alice",
    TIME_ZONE_KIND,
    TIME_ZONE_ID,
  );
  assert.equal(saved?.timeZone, "Asia/Kolkata");
  assert.ok(saved?.updatedAt);
  // A bad zone is ignored, never saved.
  await zones.remember("tz-alice", "Not/AZone");
  assert.equal(await zones.get("tz-alice"), "Asia/Kolkata");
  // Travelling: the new zone replaces the old.
  await zones.remember("tz-alice", "Europe/London");
  assert.equal(await zones.get("tz-alice"), "Europe/London");
});

test("the zone used: one asked for, then the request's, then the saved one", async () => {
  const zones = new TimeZoneStore(db);
  await zones.remember("tz-carol", "Asia/Kolkata");
  assert.equal(await zones.current("tz-carol"), "Asia/Kolkata");
  await requestTimeZone.run("America/New_York", async () => {
    assert.equal(await zones.current("tz-carol"), "America/New_York");
    assert.equal(await zones.current("tz-carol", "Asia/Tokyo"), "Asia/Tokyo");
  });
  assert.equal(await zones.current("tz-nobody"), undefined, "unknown means UTC to callers");
});

test("the prompt says what day it is where the person is", () => {
  assert.match(todayPrompt(lateEvening, "Asia/Kolkata"), /Today is Sunday, 15 November 2026 in Asia\/Kolkata \(it is 01:30 there\)/);
  assert.match(todayPrompt(lateEvening), /Today is Saturday, 14 November 2026 in UTC.*not known/);
});

test("the check-in and list_people use the saved zone when nothing else is given", async () => {
  await new TimeZoneStore(db).remember("tz-dev", "Asia/Kolkata");
  const brief = await buildCheckin({ db }, "tz-dev", { now: lateEvening });
  assert.equal(brief.timeZone, "Asia/Kolkata");
  assert.equal(brief.day, "2026-11-15");
  assert.equal(brief.partOfDay, "night");
  // A zone the model passes does not beat the one the app sent.
  const tools = companionTools({ db }, "tz-dev") as unknown as {
    name: string;
    execute: (args: unknown) => Promise<Record<string, unknown>>;
  }[];
  const checkin = await tools.find((t) => t.name === "daily_checkin")!.execute({ timeZone: "America/Los_Angeles" });
  assert.equal(checkin.timeZone, "Asia/Kolkata");
});

test("the app sends its zone on every request, and the server keeps it", async () => {
  assert.deepEqual(timeZoneHeaders("Asia/Kolkata"), { "X-Time-Zone": "Asia/Kolkata" });
  assert.deepEqual(timeZoneHeaders(""), {}, "no header when the device cannot tell");

  const config: Config = {
    mode: "sample",
    port: 8787,
    host: "127.0.0.1",
    publicUrl: "http://localhost:8787",
    dataDir: directory,
    agentBackend: "sample",
    googleRedirectUri: "http://localhost:8787/api/google/callback",
    allowedOrigins: ["http://localhost:8081"],
  };
  const { app } = await createApp(db, config);
  const session = await app.request("/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  const { token } = (await session.json()) as { token: string };
  const auth = { Authorization: `Bearer ${token}` };

  // A browser may send the header: the preflight allows it.
  const preflight = await app.request("/api/checkin", {
    method: "OPTIONS",
    headers: {
      Origin: "http://localhost:8081",
      "Access-Control-Request-Method": "GET",
      "Access-Control-Request-Headers": "authorization,x-time-zone",
    },
  });
  assert.match(preflight.headers.get("access-control-allow-headers") ?? "", /x-time-zone/i);

  const withZone = await app.request("/api/checkin", { headers: { ...auth, "X-Time-Zone": "Asia/Kolkata" } });
  assert.equal(withZone.status, 200);
  assert.equal(((await withZone.json()) as { timeZone: string }).timeZone, "Asia/Kolkata");
  // The next request without the header still uses the person's zone.
  const later = await app.request("/api/checkin", { headers: auth });
  assert.equal(((await later.json()) as { timeZone: string }).timeZone, "Asia/Kolkata");
  // A made-up zone changes nothing and fails nothing.
  const bad = await app.request("/api/checkin", { headers: { ...auth, "X-Time-Zone": "Not/AZone" } });
  assert.equal(bad.status, 200);
  assert.equal(((await bad.json()) as { timeZone: string }).timeZone, "Asia/Kolkata");
});
