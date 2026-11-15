// Daily companion, part two: birthday reminders, the morning check-in, promises from the
// journal, reminders and web push.
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import type { AgentNotification, Idea } from "../packages/domain/src/agent.ts";
import { accountRoutes } from "../apps/server/src/account.ts";
import { createApp } from "../apps/server/src/app.ts";
import { checkinBody, CompanionJobs } from "../apps/server/src/companion-jobs.ts";
import type { Config } from "../apps/server/src/config.ts";
import { createStore, type Store } from "../apps/server/src/db.ts";
import { DeboService } from "../apps/server/src/debo/index.ts";
import type { Files } from "../apps/server/src/files.ts";
import { PeopleStore } from "../apps/server/src/people.ts";
import { PromiseFinder } from "../apps/server/src/promises.ts";
import { allowedPushEndpoint, PUSH_KIND, PushService, pushKeysFromEnv } from "../apps/server/src/push.ts";
import {
  CompanionSettingsStore,
  localClock,
  quiet,
  ReminderStore,
  reminderTime,
  specialDayNotices,
  upcoming,
  zonedTime,
} from "../apps/server/src/reminders.ts";
import { TimeZoneStore } from "../apps/server/src/time-zone.ts";
import { fakeBackend } from "./helpers/debo.ts";
import { Hono } from "hono";

let db: Store;
let directory: string;
before(async () => {
  db = await createStore();
  directory = await mkdtemp(join(tmpdir(), "debo-companion-"));
});
after(async () => {
  await db.close();
  await rm(directory, { recursive: true, force: true });
});

const KOLKATA = "Asia/Kolkata";
/** A local time in Kolkata (UTC+5:30) as an instant. */
const kolkata = (day: string, time: string) => zonedTime(day, time, KOLKATA);

/** Collects what would be shown and pushed, with the same once-per-key rule as the app. */
function recorder(store: Store) {
  const pushed: { owner: string; title: string }[] = [];
  const shown: { owner: string; title: string; body: string; key: string }[] = [];
  const jobs = new CompanionJobs({
    db: store,
    notify: async (owner, title, body, key) => {
      const { createHash } = await import("node:crypto");
      const id = createHash("sha256").update(key).digest("hex");
      const saved = await store.insertIfAbsent(owner, "notifications", { id, title, body, createdAt: "", read: false });
      if (saved) shown.push({ owner, title, body, key });
      return Boolean(saved);
    },
    push: { send: async (owner, title) => (pushed.push({ owner, title }), 1) },
  });
  return { jobs, pushed, shown };
}

test("local times: a Kolkata morning, quiet hours and a clock change", () => {
  assert.equal(kolkata("2026-11-20", "08:00").toISOString(), "2026-11-20T02:30:00.000Z");
  assert.deepEqual(localClock(new Date("2026-11-20T02:30:00Z"), KOLKATA), {
    day: "2026-11-20",
    minutes: 8 * 60,
    timeZone: KOLKATA,
  });
  // London moves its clocks on 29 March 2026; 09:00 is still 09:00 on both sides.
  assert.equal(zonedTime("2026-03-28", "09:00", "Europe/London").toISOString(), "2026-03-28T09:00:00.000Z");
  assert.equal(zonedTime("2026-03-30", "09:00", "Europe/London").toISOString(), "2026-03-30T08:00:00.000Z");
  assert.equal(quiet(22 * 60), true);
  assert.equal(quiet(6 * 60 + 59), true);
  assert.equal(quiet(7 * 60), false);
  assert.equal(quiet(21 * 60 + 59), false);
});

test("a promise's reminder: 09:00 on its day, tomorrow without one, never in quiet hours", () => {
  const now = kolkata("2026-11-15", "10:00");
  assert.equal(reminderTime("2026-11-22", now, KOLKATA).toISOString(), kolkata("2026-11-22", "09:00").toISOString());
  assert.equal(reminderTime(null, now, KOLKATA).toISOString(), kolkata("2026-11-16", "09:00").toISOString());
  // Today, but 09:00 has passed: an hour from now.
  assert.equal(reminderTime("2026-11-15", now, KOLKATA).toISOString(), kolkata("2026-11-15", "11:00").toISOString());
  // Late at night: an hour from now would be quiet, so the next morning.
  const late = kolkata("2026-11-15", "21:30");
  assert.equal(reminderTime("2026-11-15", late, KOLKATA).toISOString(), kolkata("2026-11-16", "09:00").toISOString());
});

test("birthdays: the day before at 18:00 and the morning of at 08:00, once each, in the person's zone", async () => {
  const owner = "bday-1";
  await new TimeZoneStore(db).remember(owner, KOLKATA);
  await new PeopleStore(db).add(owner, { name: "Riya", relation: "sister", birthday: "1994-11-20" });
  const { jobs, shown, pushed } = recorder(db);

  await jobs.tick(kolkata("2026-11-19", "17:59"));
  assert.equal(shown.filter((s) => s.owner === owner).length, 0, "not before 18:00 the day before");
  await jobs.tick(kolkata("2026-11-19", "18:00"));
  await jobs.tick(kolkata("2026-11-19", "18:01"));
  const before = shown.filter((s) => s.owner === owner);
  assert.equal(before.length, 1, "sent once, however many times the loop runs");
  assert.equal(before[0]?.title, "Tomorrow is Riya's birthday");
  assert.match(before[0]?.body ?? "", /They turn 32/);

  await jobs.tick(kolkata("2026-11-20", "06:00"));
  assert.equal(shown.filter((s) => s.owner === owner).length, 1, "nothing in quiet hours");
  await jobs.tick(kolkata("2026-11-20", "08:05"));
  await jobs.tick(kolkata("2026-11-20", "12:00"));
  const all = shown.filter((s) => s.owner === owner);
  assert.equal(all.length, 2);
  assert.equal(all[1]?.title, "Today is Riya's birthday");
  assert.deepEqual(
    pushed.filter((p) => p.owner === owner).map((p) => p.title),
    ["Tomorrow is Riya's birthday", "Today is Riya's birthday"],
    "a push carries the title only",
  );
});

test("birthday reminders can be turned off, and a missed one is not sent days late", async () => {
  const owner = "bday-2";
  await new PeopleStore(db).add(owner, { name: "Sam", relation: "friend", birthday: "11-20" });
  await new CompanionSettingsStore(db).set(owner, { specialDays: false });
  const { jobs, shown } = recorder(db);
  await jobs.tick(new Date("2026-11-20T09:00:00Z"));
  assert.equal(shown.filter((s) => s.owner === owner).length, 0);

  await new CompanionSettingsStore(db).set(owner, { specialDays: true });
  await jobs.tick(new Date("2026-11-21T09:00:00Z"));
  assert.equal(shown.filter((s) => s.owner === owner).length, 0, "the day has gone");
  // A name ending in s.
  assert.equal(specialDayNotices([{ id: "x", name: "James", relation: "", birthday: "11-21", dates: [], notes: "", createdAt: "", updatedAt: "" }], "2026-11-20", "UTC")[1]?.title, "Tomorrow is James' birthday");
});

test("the morning check-in is off by default; once on it comes at its time, once a day, never at night", async () => {
  const owner = "checkin-1";
  await new TimeZoneStore(db).remember(owner, KOLKATA);
  await new PeopleStore(db).add(owner, { name: "Mum", relation: "mother", birthday: "11-16" });
  const settings = new CompanionSettingsStore(db);
  assert.equal((await settings.get(owner)).checkin, false, "off by default");
  assert.equal((await settings.get(owner)).checkinAt, "08:00");
  const { jobs, shown, pushed } = recorder(db);
  await jobs.tick(kolkata("2026-11-15", "08:30"));
  assert.equal(shown.filter((s) => s.owner === owner && s.title === "Good morning").length, 0);

  await assert.rejects(settings.set(owner, { checkinAt: "23:00" }), /between 07:00 and 22:00/);
  await assert.rejects(settings.set(owner, { checkinAt: "8am" }));
  await settings.set(owner, { checkin: true, checkinAt: "08:00" });
  await jobs.tick(kolkata("2026-11-15", "07:59"));
  assert.equal(shown.filter((s) => s.owner === owner && s.title === "Good morning").length, 0);
  await jobs.tick(kolkata("2026-11-15", "08:00"));
  await jobs.tick(kolkata("2026-11-15", "08:01"));
  const mornings = shown.filter((s) => s.owner === owner && s.title === "Good morning");
  assert.equal(mornings.length, 1);
  assert.match(mornings[0]?.body ?? "", /Mum's birthday is in 1 day/);
  assert.ok(pushed.some((p) => p.owner === owner && p.title === "Good morning"));

  // The server was down all morning: no "Good morning" at 15:00.
  await jobs.tick(kolkata("2026-11-16", "15:00"));
  assert.equal(shown.filter((s) => s.owner === owner && s.title === "Good morning").length, 1);
});

test("the check-in text uses names and counts only", () => {
  const body = checkinBody({
    day: "2026-11-15",
    timeZone: "UTC",
    partOfDay: "morning",
    comingUp: [{ personId: "1", name: "Riya", relation: "sister", what: "birthday", on: "2026-11-15", inDays: 0 }],
    needsYou: [{ id: "t", title: "Fill the school form", status: "needs an answer" }],
    working: 0,
    goals: [{ id: "g", title: "Run 5k", next: "Buy shoes" }],
    followUps: [{ id: "e", label: "Journal, 14 November", day: "2026-11-14", excerpt: "A private thought" }],
    gaps: [],
    note: "",
  });
  assert.equal(body, `It's Riya's birthday today. 1 task is waiting for you. Next for "Run 5k": Buy shoes.`);
  assert.doesNotMatch(body, /private thought/, "journal text never goes in the update");
});

test("reminders go out once at their time, and wait out quiet hours", async () => {
  const owner = "rem-1";
  await new TimeZoneStore(db).remember(owner, KOLKATA);
  const store = new ReminderStore(db);
  const reminder = await store.add(owner, { title: "Call Mum", at: kolkata("2026-11-15", "21:59") }, "test:1");
  const again = await store.add(owner, { title: "Call Mum", at: kolkata("2026-11-15", "21:59") }, "test:1");
  assert.equal(again.id, reminder.id, "the same key never makes two");
  const { jobs, shown, pushed } = recorder(db);
  await jobs.tick(kolkata("2026-11-15", "21:00"));
  assert.equal(shown.filter((s) => s.owner === owner).length, 0, "not before its time");
  await jobs.tick(kolkata("2026-11-15", "22:30"));
  assert.equal(shown.filter((s) => s.owner === owner).length, 0, "quiet hours: it waits");
  await jobs.tick(kolkata("2026-11-16", "07:00"));
  await jobs.tick(kolkata("2026-11-16", "07:01"));
  assert.deepEqual(shown.filter((s) => s.owner === owner).map((s) => s.title), ["Call Mum"]);
  assert.deepEqual(pushed.filter((p) => p.owner === owner).map((p) => p.title), ["Call Mum"]);
  assert.equal((await store.list(owner))[0]?.status, "sent");
});

test("what a phone holds: the next reminders and birthdays, names only", async () => {
  const owner = "phone-1";
  await new TimeZoneStore(db).remember(owner, KOLKATA);
  await new PeopleStore(db).add(owner, { name: "Riya", relation: "sister", birthday: "11-20", notes: "a secret note" });
  await new ReminderStore(db).add(owner, { title: "Send the photos", at: kolkata("2026-11-18", "09:00") }, "phone:1");
  const list = await upcoming(db, owner, kolkata("2026-11-15", "10:00"));
  assert.deepEqual(
    list.map((u) => u.title),
    ["Send the photos", "Tomorrow is Riya's birthday", "Today is Riya's birthday"],
  );
  assert.doesNotMatch(JSON.stringify(list), /secret/);
});

test("promises from an entry: a suggestion with its source, accepted into a reminder, gone with the entry", async () => {
  const owner = "promise-1";
  const found = [{ text: "Call Mum", quote: "I told Mum I'd call on Sunday.", due: "2026-11-22" }];
  const finder = new PromiseFinder(db, { findPromises: async () => found });
  const happenedAt = "2026-11-15T10:00:00.000Z";
  await finder.onEntryChange(owner, { entryId: "e1", change: "saved", text: "Long day. I told Mum I'd call on Sunday.", happenedAt });
  const [idea] = await finder.forEntry(owner, "e1");
  assert.ok(idea);
  assert.equal(idea.kind, "promise");
  assert.equal(idea.status, "new");
  assert.equal(idea.title, "Call Mum");
  assert.deepEqual(idea.evidence, [{ id: "e1", kind: "journal", title: "Journal, 15 November", excerpt: "I told Mum I'd call on Sunday." }]);
  assert.equal((await new ReminderStore(db).list(owner)).length, 0, "nothing happens without a tap");

  // Saving the same entry again does not double it.
  await finder.onEntryChange(owner, { entryId: "e1", change: "saved", text: "Long day. I told Mum I'd call on Sunday." });
  assert.equal((await finder.forEntry(owner, "e1")).length, 1);

  const accepted = await finder.accept(owner, idea, new Date("2026-11-15T10:00:00Z"));
  assert.equal(accepted?.status, "accepted");
  const [reminder] = await new ReminderStore(db).list(owner);
  assert.equal(reminder?.title, "Call Mum");
  assert.equal(reminder?.at, "2026-11-22T09:00:00.000Z", "UTC when no zone is known");
  assert.equal(accepted?.reminderId, reminder?.id);
  await finder.accept(owner, idea);
  assert.equal((await new ReminderStore(db).list(owner)).length, 1, "a second tap makes no second reminder");

  await finder.onEntryChange(owner, { entryId: "e1", change: "deleted" });
  assert.equal((await finder.forEntry(owner, "e1")).length, 0);
  assert.equal((await new ReminderStore(db).list(owner)).length, 0, "the reminder made from it goes too");
});

test("an edit takes away a promise it no longer holds; a dismissed one never comes back", async () => {
  const owner = "promise-2";
  let found = [
    { text: "Send Sam the photos", quote: "I promised Sam the photos.", due: null },
    { text: "Renew my passport", quote: "I must renew my passport.", due: null },
  ];
  const finder = new PromiseFinder(db, { findPromises: async () => found });
  await finder.onEntryChange(owner, { entryId: "e2", change: "saved", text: "x" });
  const ideas = await finder.forEntry(owner, "e2");
  assert.equal(ideas.length, 2);
  const passport = ideas.find((i) => i.title === "Renew my passport");
  assert.ok(passport);
  await db.compareAndSwap(owner, "ideas", passport.id, { status: "new" }, { status: "dismissed" });
  found = [{ text: "Renew my passport", quote: "I must renew my passport.", due: null }];
  await finder.onEntryChange(owner, { entryId: "e2", change: "saved", text: "x" });
  const left = await finder.forEntry(owner, "e2");
  assert.deepEqual(left.map((i) => [i.title, i.status]), [["Renew my passport", "dismissed"]]);
});

test("web push: off without keys, only real push services, title only, a gone device is forgotten", async () => {
  assert.equal(pushKeysFromEnv({}), undefined);
  assert.equal(pushKeysFromEnv({ DEBO_OS_VAPID_PUBLIC_KEY: "a" }), undefined);
  assert.equal(pushKeysFromEnv({ DEBO_OS_VAPID_PUBLIC_KEY: "a", DEBO_OS_VAPID_PRIVATE_KEY: "b" })?.subject, "https://debo.life");
  assert.equal(new PushService(db).configured, false);
  assert.equal(await new PushService(db).send("x", "Hi"), 0);

  assert.equal(allowedPushEndpoint("https://fcm.googleapis.com/fcm/send/abc"), true);
  assert.equal(allowedPushEndpoint("https://web.push.apple.com/abc"), true);
  assert.equal(allowedPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/abc"), true);
  assert.equal(allowedPushEndpoint("http://fcm.googleapis.com/x"), false);
  assert.equal(allowedPushEndpoint("https://evil.example/fcm.googleapis.com"), false);
  assert.equal(allowedPushEndpoint("https://169.254.169.254/latest"), false);
  assert.equal(allowedPushEndpoint("https://fcm.googleapis.com:8443/x"), false);

  const sent: { endpoint: string; payload: string }[] = [];
  const push = new PushService(db, { publicKey: "pub", privateKey: "priv", subject: "https://debo.life" }, async (sub, payload) => {
    sent.push({ endpoint: sub.endpoint, payload });
    if (sub.endpoint.endsWith("gone")) throw Object.assign(new Error("gone"), { statusCode: 410 });
    return { statusCode: 201 };
  });
  const keys = { p256dh: "B".repeat(87), auth: "A".repeat(22) };
  await assert.rejects(push.subscribe("p1", { endpoint: "https://evil.example/x", keys }));
  await push.subscribe("p1", { endpoint: "https://fcm.googleapis.com/fcm/send/live", keys });
  await push.subscribe("p1", { endpoint: "https://fcm.googleapis.com/fcm/send/gone", keys });
  await push.subscribe("p1", { endpoint: "https://fcm.googleapis.com/fcm/send/live", keys });
  assert.equal((await push.list("p1")).length, 2, "the same device is saved once");
  assert.equal((await push.list("p2")).length, 0);
  assert.equal(await push.send("p1", "Good morning"), 1);
  assert.deepEqual(new Set(sent.map((s) => s.payload)), new Set([JSON.stringify({ title: "Good morning" })]));
  assert.deepEqual((await push.list("p1")).map((d) => d.endpoint), ["https://fcm.googleapis.com/fcm/send/live"]);
  await push.unsubscribe("p1", "https://fcm.googleapis.com/fcm/send/live");
  assert.equal((await push.list("p1")).length, 0);
});

test("export lists push devices without their keys; deleting the account removes them and reminders", async () => {
  const owner = "export-1";
  const push = new PushService(db, { publicKey: "pub", privateKey: "priv", subject: "https://debo.life" }, async () => ({ statusCode: 201 }));
  await push.subscribe(owner, { endpoint: "https://fcm.googleapis.com/fcm/send/dev", keys: { p256dh: "B".repeat(87), auth: "A".repeat(22) } });
  await new ReminderStore(db).add(owner, { title: "Call Mum", at: new Date() }, "export:1");
  await new CompanionSettingsStore(db).set(owner, { checkin: true });
  const files = { removeAll: async () => 0 } as unknown as Files;
  const app = new Hono<{ Variables: { owner: string } }>();
  app.use("*", async (c, next) => {
    c.set("owner", owner);
    await next();
  });
  app.route("/", accountRoutes(db, files));
  const exported = (await (await app.request("/export")).json()) as { records: { kind: string; data: Record<string, unknown> }[] };
  const device = exported.records.find((r) => r.kind === PUSH_KIND);
  assert.equal(device?.data.endpoint, "https://fcm.googleapis.com/fcm/send/dev");
  assert.equal(device?.data.keys, undefined);
  assert.ok(exported.records.some((r) => r.kind === "reminders"));
  assert.ok(exported.records.some((r) => r.kind === "companion-settings"));
  const gone = await app.request("/", { method: "DELETE", body: JSON.stringify({ confirm: true }) });
  assert.equal(gone.status, 200);
  assert.equal((await push.list(owner)).length, 0);
  assert.equal((await new ReminderStore(db).list(owner)).length, 0);
});

test("the app: an entry's promise becomes an idea, the tap makes a reminder, and settings and push routes work", async () => {
  const backend = fakeBackend();
  backend.findPromises = async (text: string) =>
    text.includes("promised") ? [{ text: "Water the plants", quote: "I promised to water the plants.", due: null }] : [];
  const debo = new DeboService(backend, ["local-user"]);
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
  const { app } = await createApp(db, config, { debo, push: new PushService(db) });
  const session = await app.request("/api/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  const { token } = (await session.json()) as { token: string };
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const pushInfo = (await (await app.request("/api/push", { headers })).json()) as { configured: boolean; publicKey: string | null };
  assert.deepEqual(pushInfo, { configured: false, publicKey: null, devices: [] } as unknown);
  const refused = await app.request("/api/push/subscriptions", { method: "POST", headers, body: "{}" });
  assert.equal(refused.status, 503, "no keys: push is off");

  const settings = await app.request("/api/companion/settings", { method: "PUT", headers, body: JSON.stringify({ checkin: true, checkinAt: "07:30" }) });
  assert.equal(settings.status, 200);
  const read = (await (await app.request("/api/companion/settings", { headers })).json()) as { settings: { checkin: boolean; checkinAt: string; specialDays: boolean } };
  assert.deepEqual([read.settings.checkin, read.settings.checkinAt, read.settings.specialDays], [true, "07:30", true]);

  const created = await app.request("/api/debo/entries", { method: "POST", headers, body: JSON.stringify({ text: "I promised to water the plants." }) });
  assert.equal(created.status, 201);
  const { entry } = (await created.json()) as { entry: { id: string } };
  await debo.idle();
  const workspace = (await (await app.request("/api/agent", { headers })).json()) as { ideas: Idea[]; notifications: AgentNotification[] };
  const idea = workspace.ideas.find((i) => i.kind === "promise");
  assert.equal(idea?.title, "Water the plants");
  assert.equal(idea?.evidence[0]?.id, entry.id);

  const accepted = await app.request(`/api/agent/ideas/${idea?.id}`, { method: "POST", headers, body: JSON.stringify({ action: "accept" }) });
  assert.equal(((await accepted.json()) as Idea).status, "accepted");
  const reminders = (await (await app.request("/api/companion/reminders", { headers })).json()) as { reminders: { id: string; title: string }[] };
  assert.deepEqual(reminders.reminders.map((r) => r.title), ["Water the plants"]);
  const phone = (await (await app.request("/api/companion/upcoming", { headers })).json()) as { upcoming: { title: string }[] };
  assert.ok(phone.upcoming.some((u) => u.title === "Water the plants"));

  const removed = await app.request(`/api/debo/entries/${entry.id}`, { method: "DELETE", headers });
  assert.equal(removed.status, 200);
  await debo.idle();
  const after = (await (await app.request("/api/agent", { headers })).json()) as { ideas: Idea[] };
  assert.equal(after.ideas.filter((i) => i.kind === "promise").length, 0, "deleting the entry deletes its suggestions");
  const none = (await (await app.request("/api/companion/reminders", { headers })).json()) as { reminders: unknown[] };
  assert.equal(none.reminders.length, 0);
});
