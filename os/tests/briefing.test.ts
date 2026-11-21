// The briefing talk style and the daily briefing: what it says, built from fakes; the morning
// briefing notification; and the settings round-trip by screen and by asking.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { after, before, test } from "node:test";
import { Hono } from "hono";
import { briefingTools, buildBriefing, spokenTime } from "../apps/server/src/briefing.ts";
import { CompanionJobs } from "../apps/server/src/companion-jobs.ts";
import { createStore, type Store } from "../apps/server/src/db.ts";
import { personality } from "../apps/server/src/engine/personality.ts";
import { PeopleStore } from "../apps/server/src/people.ts";
import { NEWS_CACHE_KIND, NewsService } from "../apps/server/src/news/service.ts";
import { PoliteFetcher } from "../apps/server/src/news/sources.ts";
import { CompanionSettingsStore, ReminderStore, zonedTime } from "../apps/server/src/reminders.ts";
import { settingsTools } from "../apps/server/src/settings-tools.ts";
import {
  BRIEFING_VOICE,
  briefingVoiceStyle,
  stylePrompt,
  TalkSettingsStore,
  talkSettingsRoutes,
  VOICES,
  voiceFor,
} from "../apps/server/src/talk-settings.ts";
import { TimeZoneStore } from "../apps/server/src/time-zone.ts";

let db: Store;
before(async () => {
  db = await createStore();
});
after(async () => {
  await db.close();
});

const ZONE = "Asia/Kolkata";
const at = (day: string, time: string) => zonedTime(day, time, ZONE);
const DAY = "2026-11-21";
const MORNING = at(DAY, "07:40");

/** A news service that can never reach the network: any request fails the test. */
const offlineNews = () =>
  new NewsService({
    db,
    fetcher: new PoliteFetcher(async () => {
      throw new Error("no network in tests");
    }),
  });

async function seed(owner: string, news: NewsService) {
  await new TimeZoneStore(db).remember(owner, ZONE);
  await new TalkSettingsStore(db).set(owner, { style: "briefing", callMe: "Riya" });
  await new ReminderStore(db).add(owner, { title: "Call the bank", at: at(DAY, "18:00") }, `${owner}:bank`);
  await new ReminderStore(db).add(owner, { title: "Yesterday's thing", at: at("2026-11-20", "10:00") }, `${owner}:old`);
  await new PeopleStore(db).note(owner, { name: "Asha", relation: "friend", birthday: "11-21" });
  await db.put(owner, "tasks", { id: "t1", title: "Fill the form", status: "waiting_input", createdAt: "", updatedAt: "" });
  await news.topics.follow(owner, "cricket");
  await news.topics.follow(owner, "AI");
  const story = (n: number, topic: string) => ({
    id: `s${n}`,
    title: `Headline ${n}`,
    url: `https://n.example/${n}`,
    source: `site${n}.example`,
    publishedAt: MORNING.toISOString(),
    topic,
    from: "gdelt" as const,
  });
  await db.put(owner, NEWS_CACHE_KIND, {
    id: "current",
    stories: [story(1, "cricket"), story(2, "AI"), story(3, "cricket"), story(4, "football")],
    topics: ["cricket", "ai"],
    fetchedAt: at(DAY, "06:00").toISOString(),
    triedAt: at(DAY, "06:00").toISOString(),
    failed: [],
  });
}

const calendar = async () => [
  { title: "Dentist", start: at(DAY, "16:00").toISOString() },
  { title: "Team call", start: at(DAY, "11:30").toISOString() },
  { title: "Early run", start: at(DAY, "06:00").toISOString() },
  { title: "Diwali shopping", start: DAY, allDay: true },
];

test("spoken times are short", () => {
  assert.equal(spokenTime(at(DAY, "16:00"), ZONE), "4 pm");
  assert.equal(spokenTime(at(DAY, "09:30"), ZONE), "9:30 am");
  assert.equal(spokenTime(at(DAY, "12:00"), ZONE), "12 pm");
});

test("the briefing greets by name and says the day in order, from fakes", async () => {
  const owner = "brief-1";
  const news = offlineNews();
  await seed(owner, news);
  const brief = await buildBriefing({ db, news, calendar }, owner, { now: MORNING });
  assert.equal(brief.greeting, "Good morning, Riya.");
  assert.deepEqual(brief.lines, [
    "Today: Diwali shopping.",
    "Then Team call at 11:30 am.",
    "And 1 more on your calendar.",
    "Reminder at 6 pm: Call the bank.",
    "It's Asha's birthday today.",
    "One task needs you.",
    "Two stories on topics you follow: Headline 1, from site1.example; Headline 2, from site2.example.",
  ]);
  assert.ok(brief.spoken.startsWith("Good morning, Riya. Today: Diwali shopping."));
  assert.ok(!brief.events.some((e) => e.title === "Early run"), "a timed event already over is left out");
  assert.ok(!brief.news.some((s) => s.topic === "football"), "only topics they follow");
  assert.deepEqual(brief.gaps, []);
});

test("no calendar connected is not a gap; a broken one is; stale news is left out", async () => {
  const owner = "brief-2";
  const news = offlineNews();
  await seed(owner, news);
  const later = at("2026-11-22", "08:00");
  const none = await buildBriefing({ db, news, calendar: async () => null }, owner, { now: later });
  assert.deepEqual(none.gaps, []);
  assert.equal(none.news.length, 0, "news older than a day is not read out");
  const broken = await buildBriefing({ db, news, calendar: async () => { throw new Error("google down"); } }, owner, { now: later });
  assert.deepEqual(broken.gaps, ["calendar"]);
  const empty = await buildBriefing({ db }, "brief-empty", { now: MORNING, timeZone: ZONE });
  assert.equal(empty.greeting, "Good morning.", "no name until the person gives one");
  assert.deepEqual(empty.lines, ["Your day looks clear."]);
});

test("daily_briefing works as a tool and reads only this person's data", async () => {
  const news = offlineNews();
  await seed("brief-3", news);
  const [tool] = briefingTools({ db, news, calendar }, "brief-other") as unknown as { execute: (a: unknown) => Promise<Record<string, unknown>> }[];
  const out = await tool!.execute({});
  assert.equal((out.reminders as unknown[]).length, 0);
  assert.equal((out.news as unknown[]).length, 0);
  assert.ok(!String(out.greeting).includes("Riya"));
});

test("the morning briefing notification is off by default, then sent once with only a greeting as its push", async () => {
  const owner = "brief-push";
  const news = offlineNews();
  await seed(owner, news);
  const pushed: string[] = [];
  const shown: { title: string; body: string }[] = [];
  const jobs = new CompanionJobs({
    db,
    notify: async (o, title, body, key) => {
      const id = createHash("sha256").update(key).digest("hex");
      const saved = await db.insertIfAbsent(o, "notifications", { id, title, body, createdAt: "", read: false });
      if (saved && o === owner && key.startsWith("briefing:")) shown.push({ title, body });
      return Boolean(saved);
    },
    push: { send: async (o, title) => (o === owner && title.startsWith("Good") && pushed.push(title), 1) },
    briefing: (o, now) => buildBriefing({ db, news, calendar }, o, { now }),
  });
  await new CompanionSettingsStore(db).set(owner, { specialDays: false });
  await jobs.tick(MORNING);
  assert.equal(shown.length, 0, "off by default");
  await new CompanionSettingsStore(db).set(owner, { briefing: true, briefingAt: "07:30" });
  await jobs.tick(at(DAY, "07:20"));
  assert.equal(shown.length, 0, "not before its time");
  await jobs.tick(MORNING);
  await jobs.tick(at(DAY, "07:50"));
  assert.equal(shown.length, 1, "once a day");
  assert.equal(shown[0]?.title, "Good morning, Riya");
  assert.match(shown[0]!.body, /Reminder at 6 pm: Call the bank/);
  assert.deepEqual(pushed, ["Good morning, Riya"]);
  await assert.rejects(new CompanionSettingsStore(db).set(owner, { briefingAt: "05:00" }), /between 07:00 and 22:00/);
});

test("talk settings round-trip: the briefing style and a name, by screen and by asking", async () => {
  const owner = "style-1";
  const store = new TalkSettingsStore(db);
  const app = new Hono<{ Variables: { owner: string } }>();
  app.use("*", async (c, next) => {
    c.set("owner", owner);
    await next();
  });
  app.route("/", talkSettingsRoutes(store, async () => "debo"));
  const put = await app.request("/", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ style: "briefing", callMe: ' Riya\n"R" ' }) });
  assert.equal(put.status, 200);
  const got = (await (await app.request("/")).json()) as { settings: { style: string; callMe: string }; voice: { voice: string }; briefingVoice: string };
  assert.equal(got.settings.style, "briefing");
  assert.equal(got.settings.callMe, "Riya R");
  assert.equal(got.voice.voice, BRIEFING_VOICE, "the calm voice when none was picked");
  assert.equal(VOICES.find((v) => v.id === BRIEFING_VOICE)?.name, "Robyn");
  assert.equal(voiceFor({ style: "briefing", voice: VOICES[3].id }, "debo").voice, VOICES[3].id, "a picked voice wins");

  const tools = settingsTools(db, "style-2") as unknown as { name: string; execute: (a: unknown) => Promise<Record<string, unknown>> }[];
  const run = (name: string, args: unknown) => tools.find((t) => t.name === name)!.execute(args);
  const saved = await run("update_talk_settings", { style: "briefing", callMe: "Kunal" });
  assert.equal(saved.status, "saved");
  assert.deepEqual(saved.changed, ["Style: briefing (crisp and calm)", "I'll call you Kunal"]);
  assert.equal((await store.get("style-2"))?.callMe, "Kunal");
  assert.ok((await run("update_talk_settings", { style: "jarvis" })).error);
  const reminders = await run("update_reminders", { briefing: true, briefingAt: "07:15" });
  assert.deepEqual(reminders.changed, ["Morning briefing: on", "Briefing time: 07:15"]);
  assert.ok((await run("update_reminders", { briefingAt: "23:00" })).error);
  assert.equal((await store.get("style-other")), null);
});

test("the briefing style is original and keeps every safety rule", () => {
  const prompt = stylePrompt(undefined, { id: "current", style: "briefing", callMe: "Riya", updatedAt: "" });
  assert.match(prompt, /BRIEFING STYLE/);
  assert.match(prompt, /"Riya"/);
  assert.match(prompt, /Never imitate a film, TV or game character/);
  assert.match(prompt, /every safety and honesty rule still applies/);
  assert.match(prompt, /waits for their tap/);
  assert.doesNotMatch(prompt + briefingVoiceStyle, /jarvis|stark|sir\b/i);
  assert.match(briefingVoiceStyle, /'Done\.'/);
  // The base character, with its crisis and honesty lines, is not changed by the style.
  assert.match(personality, /crisis/);
  assert.match(personality, /you are an AI/);
  assert.equal(stylePrompt(undefined, { id: "current", callMe: "Sam", updatedAt: "" }).includes("BRIEFING"), false);
});
