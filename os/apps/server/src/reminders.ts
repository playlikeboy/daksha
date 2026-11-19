// Reminders and the companion settings that decide what Daksha sends on her own.
//
//   reminders            One row per reminder the person asked for (today: by accepting a promise
//                        Daksha found in an entry). Sent once at its time as an in-app update, and
//                        as a push to devices where the person turned that on.
//   companion-settings   One row per person: birthday and special-day reminders (on unless the
//                        person turns them off), the morning check-in (off unless turned on) and
//                        its time.
//
// Both are the person's own rows in the records table: exported and deleted with the account.
// Nothing is sent between 22:00 and 07:00 in the person's own time zone.
import { createHash } from "node:crypto";
import { Hono } from "hono";
import { z } from "zod";
import type { Evidence } from "../../../packages/domain/src/agent.ts";
import type { Store } from "./db.ts";
import { AppError } from "./errors.ts";
import { comingUp, type Person, PeopleStore } from "./people.ts";
import { readTimeZone, TIME_ZONE_KIND, TimeZoneStore, type SavedTimeZone } from "./time-zone.ts";

export const REMINDER_KIND = "reminders";
export const COMPANION_SETTINGS_KIND = "companion-settings";
const SETTINGS_ID = "current";
const REMINDERS_MAX = 200;

/** Quiet hours, local time: nothing is sent from 22:00 until 07:00. */
export const QUIET_FROM = 22 * 60;
export const QUIET_UNTIL = 7 * 60;
/** Special days: the day before at 18:00, and the morning of at 08:00. */
export const DAY_BEFORE_AT = "18:00";
export const MORNING_OF_AT = "08:00";
/** A reminder made without a day is set for 09:00. */
export const DEFAULT_REMINDER_AT = "09:00";
/** The check-in is only sent within this long after its time, so "Good morning" never comes at night. */
export const CHECKIN_WINDOW_MINUTES = 180;

export interface Reminder {
  id: string;
  /** What to do, in a few plain words: "Call Mum". This is also the push title. */
  title: string;
  /** When to remind, as an ISO instant. */
  at: string;
  status: "scheduled" | "sent";
  /** The journal entry it came from, when there is one. Deleting the entry deletes the reminder. */
  entryId?: string;
  ideaId?: string;
  evidence: Evidence[];
  createdAt: string;
  sentAt?: string;
}

export interface CompanionSettings {
  id: typeof SETTINGS_ID;
  /** Birthday and special-day reminders from People in your life. */
  specialDays: boolean;
  /** The morning check-in. Off unless the person turns it on. */
  checkin: boolean;
  /** "HH:MM", local time. */
  checkinAt: string;
  updatedAt?: string;
}

export const DEFAULT_SETTINGS: CompanionSettings = {
  id: SETTINGS_ID,
  specialDays: true,
  checkin: false,
  checkinAt: "08:00",
};

const clock = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Say the time as hours and minutes, for example 08:00.");

export const settingsInput = z
  .object({
    specialDays: z.boolean(),
    checkin: z.boolean(),
    checkinAt: clock.refine((value) => !quiet(minutesOf(value)), "Pick a time between 07:00 and 22:00."),
  })
  .partial();

export const minutesOf = (time: string) => {
  const [h, m] = time.split(":").map(Number) as [number, number];
  return h * 60 + m;
};

/** True inside quiet hours (22:00 to 07:00). */
export const quiet = (minutes: number) => minutes >= QUIET_FROM || minutes < QUIET_UNTIL;

/** The local day (YYYY-MM-DD) and minutes since midnight in a zone. Unknown zones use UTC. */
export function localClock(now: Date, timeZone?: string): { day: string; minutes: number; timeZone: string } {
  const zone = readTimeZone(timeZone) ?? "UTC";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return {
    day: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
    timeZone: zone,
  };
}

/** The instant of a local day and time ("2026-11-20", "09:00") in a zone. */
export function zonedTime(day: string, time: string, timeZone?: string): Date {
  const zone = readTimeZone(timeZone) ?? "UTC";
  const [y, mo, d] = day.split("-").map(Number) as [number, number, number];
  const [h, mi] = time.split(":").map(Number) as [number, number];
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  const offset = (at: number) => {
    const c = localClock(new Date(at), zone);
    const [cy, cm, cd] = c.day.split("-").map(Number) as [number, number, number];
    return Date.UTC(cy, cm - 1, cd) + c.minutes * 60_000 - at;
  };
  // Twice, so a guess on the other side of a clock change settles on the right offset.
  let at = wall - offset(wall);
  at = wall - offset(at);
  return new Date(at);
}

/** A day a number of days after another (YYYY-MM-DD). */
export function addDays(day: string, days: number): string {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * When to remind about a promise: 09:00 on its day, or 09:00 tomorrow when no day was said.
 * A time already past moves to an hour from now, and out of quiet hours.
 */
export function reminderTime(due: string | null | undefined, now: Date, timeZone?: string): Date {
  const local = localClock(now, timeZone);
  const day = due && /^\d{4}-\d{2}-\d{2}$/.test(due) ? due : addDays(local.day, 1);
  let at = zonedTime(day, DEFAULT_REMINDER_AT, timeZone);
  if (at.getTime() <= now.getTime()) at = new Date(now.getTime() + 60 * 60_000);
  const there = localClock(at, timeZone);
  if (quiet(there.minutes))
    at = zonedTime(there.minutes < QUIET_UNTIL ? there.day : addDays(there.day, 1), DEFAULT_REMINDER_AT, timeZone);
  return at;
}

const hash = (text: string) => createHash("sha256").update(text).digest("hex");

export class CompanionSettingsStore {
  constructor(private readonly db: Store) {}

  async get(owner: string): Promise<CompanionSettings> {
    const saved = await this.db.get<Partial<CompanionSettings>>(owner, COMPANION_SETTINGS_KIND, SETTINGS_ID);
    return { ...DEFAULT_SETTINGS, ...(saved ?? {}), id: SETTINGS_ID };
  }

  async set(owner: string, input: unknown): Promise<CompanionSettings> {
    const next = { ...(await this.get(owner)), ...settingsInput.parse(input), updatedAt: new Date().toISOString() };
    return this.db.put(owner, COMPANION_SETTINGS_KIND, next);
  }

  /** Every person who changed a setting, with what they chose. For the background loop. */
  async all(): Promise<Map<string, CompanionSettings>> {
    const rows = await this.db.scan<Partial<CompanionSettings>>(COMPANION_SETTINGS_KIND);
    return new Map(rows.map(({ owner, value }) => [owner, { ...DEFAULT_SETTINGS, ...value, id: SETTINGS_ID }]));
  }
}

/** Every person's saved time zone, for work that runs with no request. */
export async function allTimeZones(db: Store): Promise<Map<string, string>> {
  const rows = await db.scan<SavedTimeZone>(TIME_ZONE_KIND);
  const zones = new Map<string, string>();
  for (const { owner, value } of rows) {
    const zone = readTimeZone(value.timeZone);
    if (zone) zones.set(owner, zone);
  }
  return zones;
}

export class ReminderStore {
  constructor(private readonly db: Store) {}

  async list(owner: string): Promise<Reminder[]> {
    return (await this.db.list<Reminder>(owner, REMINDER_KIND)).sort((a, b) => a.at.localeCompare(b.at));
  }

  /** Makes a reminder. The same `key` always makes the same reminder, so a retry never doubles it. */
  async add(
    owner: string,
    input: { title: string; at: Date; entryId?: string; ideaId?: string; evidence?: Evidence[] },
    key: string,
  ): Promise<Reminder> {
    const id = hash(`reminder:${key}`);
    const existing = await this.db.get<Reminder>(owner, REMINDER_KIND, id);
    if (existing) return existing;
    if ((await this.db.list(owner, REMINDER_KIND)).length >= REMINDERS_MAX)
      throw new AppError(`You can keep up to ${REMINDERS_MAX} reminders. Delete some old ones first.`, 422);
    const reminder: Reminder = {
      id,
      title: input.title.trim().slice(0, 160),
      at: input.at.toISOString(),
      status: "scheduled",
      ...(input.entryId ? { entryId: input.entryId } : {}),
      ...(input.ideaId ? { ideaId: input.ideaId } : {}),
      evidence: input.evidence ?? [],
      createdAt: new Date().toISOString(),
    };
    return (await this.db.insertIfAbsent(owner, REMINDER_KIND, reminder)) ?? reminder;
  }

  async remove(owner: string, id: string): Promise<void> {
    await this.db.remove(owner, REMINDER_KIND, id);
  }

  /** Deletes every reminder that came from one entry. */
  async removeForEntry(owner: string, entryId: string): Promise<number> {
    const gone = (await this.db.list<Reminder>(owner, REMINDER_KIND)).filter((r) => r.entryId === entryId);
    for (const r of gone) await this.db.remove(owner, REMINDER_KIND, r.id);
    return gone.length;
  }

  /** Reminders whose time has come, across everyone. For the background loop. */
  async due(now: Date): Promise<{ owner: string; reminder: Reminder }[]> {
    return (await this.db.scan<Reminder>(REMINDER_KIND))
      .filter(({ value }) => value.status === "scheduled" && Date.parse(value.at) <= now.getTime())
      .map(({ owner, value }) => ({ owner, reminder: value }));
  }

  /** Marks a reminder sent. Only the first caller wins, so it is never sent twice. */
  async markSent(owner: string, id: string, now: Date): Promise<boolean> {
    const done = await this.db.compareAndSwap(owner, REMINDER_KIND, id, { status: "scheduled" }, { status: "sent", sentAt: now.toISOString() });
    return Boolean(done);
  }
}

/** One thing coming up that a phone can show by itself at its time. */
export interface Upcoming {
  id: string;
  title: string;
  at: string;
}

/**
 * What a phone should hold as local notifications: scheduled reminders, and birthday and
 * special-day reminders, in the next `days` days. The titles carry names only, no notes.
 */
export async function upcoming(db: Store, owner: string, now = new Date(), days = 30): Promise<Upcoming[]> {
  const [reminders, settings, people, zone] = await Promise.all([
    new ReminderStore(db).list(owner),
    new CompanionSettingsStore(db).get(owner),
    new PeopleStore(db).list(owner),
    new TimeZoneStore(db).current(owner),
  ]);
  const horizon = now.getTime() + days * 86_400_000;
  const out: Upcoming[] = reminders
    .filter((r) => r.status === "scheduled" && Date.parse(r.at) > now.getTime() && Date.parse(r.at) <= horizon)
    .map((r) => ({ id: r.id, title: r.title, at: r.at }));
  if (settings.specialDays)
    for (const notice of specialDayNotices(people, localClock(now, zone).day, zone, days))
      if (Date.parse(notice.at) > now.getTime() && Date.parse(notice.at) <= horizon)
        out.push({ id: hash(notice.key), title: notice.title, at: notice.at });
  return out.sort((a, b) => a.at.localeCompare(b.at));
}

/** A birthday or special-day notice: the day before and the morning of, each with its own key. */
export interface SpecialDayNotice {
  key: string;
  title: string;
  body: string;
  at: string;
}

const whose = (name: string) => (name.endsWith("s") ? `${name}'` : `${name}'s`);

function noticeText(name: string, what: string, when: "today" | "tomorrow", turns?: number): { title: string; body: string } {
  const thing = what === "birthday" ? "birthday" : what;
  const title = `${when === "today" ? "Today" : "Tomorrow"} is ${whose(name)} ${thing}`;
  const age = what === "birthday" && turns ? ` They turn ${turns}.` : "";
  const body =
    when === "today"
      ? `${age.trim()} A message or a call would be lovely.`.trim()
      : `${age.trim()} You have a day to plan something, if you'd like.`.trim();
  return { title, body };
}

/** Notices for birthdays and special days in the next `days` days, in the person's zone. */
export function specialDayNotices(people: Person[], today: string, timeZone: string | undefined, days = 2): SpecialDayNotice[] {
  const out: SpecialDayNotice[] = [];
  for (const c of comingUp(people, today, days)) {
    const base = `special-day:${c.personId}:${c.what}:${c.on}`;
    const morning = noticeText(c.name, c.what, "today", c.turns);
    out.push({ key: `${base}:day`, ...morning, at: zonedTime(c.on, MORNING_OF_AT, timeZone).toISOString() });
    const eve = noticeText(c.name, c.what, "tomorrow", c.turns);
    out.push({ key: `${base}:before`, ...eve, at: zonedTime(addDays(c.on, -1), DAY_BEFORE_AT, timeZone).toISOString() });
  }
  return out;
}

/**
 * GET/PUT /api/companion/settings, GET /api/companion/reminders, DELETE /api/companion/reminders/:id,
 * GET /api/companion/upcoming (for the phone). Mount after the owner sign-in check.
 */
export function companionRoutes(db: Store) {
  const app = new Hono<{ Variables: { owner: string } }>();
  const settings = new CompanionSettingsStore(db);
  const reminders = new ReminderStore(db);
  app.get("/settings", async (c) =>
    c.json({
      settings: await settings.get(c.get("owner")),
      quietHours: { from: "22:00", until: "07:00" },
    }),
  );
  app.put("/settings", async (c) => c.json({ settings: await settings.set(c.get("owner"), await c.req.json()) }));
  app.get("/reminders", async (c) => c.json({ reminders: await reminders.list(c.get("owner")) }));
  app.delete("/reminders/:id", async (c) => {
    await reminders.remove(c.get("owner"), c.req.param("id"));
    return c.json({ ok: true });
  });
  app.get("/upcoming", async (c) => c.json({ upcoming: await upcoming(db, c.get("owner")) }));
  return app;
}
