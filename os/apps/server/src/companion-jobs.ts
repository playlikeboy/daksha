// What Daksha sends on her own, checked once a minute by the server's upkeep loop:
//
//   Birthdays and special days  From People in your life: the day before at 18:00 and the
//                               morning of at 08:00, in the person's own time zone. On unless
//                               the person turns it off.
//   Morning check-in            "Good morning" with a short brief, at the time the person picks.
//                               Off unless the person turns it on.
//   Reminders                   The ones the person asked for, at their time.
//   Morning briefing            "Good morning, Riya" with today's calendar, reminders, tasks and
//                               news on topics they follow (briefing.ts). Off unless turned on.
//
// Each goes out once (an idempotent key per day and per thing) as an in-app update, and also
// as a push (title only) to devices where the person turned that on. Nothing is sent between
// 22:00 and 07:00 local time; a reminder due then waits until 07:00.
import { createHash } from "node:crypto";
import type { Store } from "./db.ts";
import type { DeboService } from "./debo/index.ts";
import type { Briefing } from "./briefing.ts";
import { buildCheckin, type Checkin } from "./companion.ts";
import { backgroundFailure } from "./log.ts";
import { PeopleStore, type Person } from "./people.ts";
import type { PushService } from "./push.ts";
import {
  allTimeZones,
  CHECKIN_WINDOW_MINUTES,
  CompanionSettingsStore,
  DEFAULT_SETTINGS,
  localClock,
  minutesOf,
  quiet,
  ReminderStore,
  specialDayNotices,
} from "./reminders.ts";

/** Saves one in-app update. Returns true only the first time a key is used. */
export type Notify = (owner: string, title: string, body: string, key: string) => Promise<boolean>;

export interface CompanionJobDeps {
  db: Store;
  notify: Notify;
  push?: Pick<PushService, "send">;
  debo?: DeboService;
  /** Today's briefing for one person (briefing.ts). Without it, no briefing is sent. */
  briefing?: (owner: string, now: Date) => Promise<Briefing>;
  /** A phone call for a reminder (phone/service.ts). It calls only when the person turned reminder calls on. */
  call?: (owner: string, title: string) => Promise<unknown>;
}

/** The check-in brief as two or three plain lines. Never journal text: only counts and names. */
export function checkinBody(brief: Checkin): string {
  const lines: string[] = [];
  const today = brief.comingUp.filter((c) => c.inDays === 0);
  const soon = brief.comingUp.filter((c) => c.inDays > 0);
  for (const c of today.slice(0, 2)) lines.push(`It's ${c.name}'s ${c.what} today.`);
  if (!today.length && soon[0]) lines.push(`${soon[0].name}'s ${soon[0].what} is in ${soon[0].inDays} day${soon[0].inDays === 1 ? "" : "s"}.`);
  if (brief.needsYou.length)
    lines.push(`${brief.needsYou.length} ${brief.needsYou.length === 1 ? "task is" : "tasks are"} waiting for you.`);
  const goal = brief.goals.find((g) => g.next);
  if (goal && lines.length < 3) lines.push(`Next for "${goal.title}": ${goal.next}.`);
  if (!lines.length) lines.push("Nothing is waiting for you today. Tell me how you are when you have a moment.");
  return lines.slice(0, 3).join(" ");
}

export class CompanionJobs {
  constructor(private readonly deps: CompanionJobDeps) {}

  /** One pass over everyone. Each part runs on its own, so one failure does not stop the rest. */
  async tick(now = new Date()): Promise<void> {
    const [zones, settings] = await Promise.all([allTimeZones(this.deps.db), new CompanionSettingsStore(this.deps.db).all()]);
    await this.specialDays(now, zones, settings).catch((error) => backgroundFailure("special-day reminders", error));
    await this.checkins(now, zones, settings).catch((error) => backgroundFailure("morning check-in", error));
    await this.briefings(now, zones, settings).catch((error) => backgroundFailure("morning briefing", error));
    await this.reminders(now, zones).catch((error) => backgroundFailure("reminders", error));
  }

  private async send(owner: string, title: string, body: string, key: string) {
    if (!(await this.deps.notify(owner, title, body, key))) return;
    await this.deps.push?.send(owner, title).catch((error) => backgroundFailure("send push", error));
  }

  private async specialDays(now: Date, zones: Map<string, string>, settings: Map<string, typeof DEFAULT_SETTINGS>) {
    const byOwner = new Map<string, Person[]>();
    for (const { owner, value } of await this.deps.db.scan<Person>("people")) {
      const list = byOwner.get(owner) ?? [];
      list.push(value);
      byOwner.set(owner, list);
    }
    for (const [owner, people] of byOwner) {
      if (!(settings.get(owner) ?? DEFAULT_SETTINGS).specialDays) continue;
      const zone = zones.get(owner);
      const local = localClock(now, zone);
      if (quiet(local.minutes)) continue;
      for (const notice of specialDayNotices(people, local.day, zone, 1)) {
        const at = Date.parse(notice.at);
        // Only on the day it is meant for: a notice missed while the server was down is not sent late.
        if (at > now.getTime() || localClock(new Date(at), zone).day !== local.day) continue;
        await this.send(owner, notice.title, notice.body, notice.key);
      }
    }
  }

  private async checkins(now: Date, zones: Map<string, string>, settings: Map<string, typeof DEFAULT_SETTINGS>) {
    for (const [owner, chosen] of settings) {
      if (!chosen.checkin) continue;
      const zone = zones.get(owner);
      const local = localClock(now, zone);
      const start = minutesOf(chosen.checkinAt);
      if (quiet(local.minutes) || local.minutes < start || local.minutes >= start + CHECKIN_WINDOW_MINUTES) continue;
      const key = `checkin:${local.day}`;
      if (await this.alreadySent(owner, key)) continue;
      const brief = await buildCheckin({ db: this.deps.db, debo: this.deps.debo }, owner, { timeZone: zone, now });
      await this.send(owner, "Good morning", checkinBody(brief), key);
    }
  }

  private async briefings(now: Date, zones: Map<string, string>, settings: Map<string, typeof DEFAULT_SETTINGS>) {
    if (!this.deps.briefing) return;
    for (const [owner, chosen] of settings) {
      if (!chosen.briefing) continue;
      const zone = zones.get(owner);
      const local = localClock(now, zone);
      const start = minutesOf(chosen.briefingAt ?? "07:30");
      if (quiet(local.minutes) || local.minutes < start || local.minutes >= start + CHECKIN_WINDOW_MINUTES) continue;
      const key = `briefing:${local.day}`;
      if (await this.alreadySent(owner, key)) continue;
      const brief = await this.deps.briefing(owner, now);
      // The notification's title is the greeting with the name the person chose. The lines
      // stay in the in-app update; a push carries only the title.
      await this.send(owner, brief.greeting.replace(/\.$/, ""), brief.lines.join(" "), key);
    }
  }

  private async reminders(now: Date, zones: Map<string, string>) {
    const store = new ReminderStore(this.deps.db);
    for (const { owner, reminder } of await store.due(now)) {
      if (quiet(localClock(now, zones.get(owner)).minutes)) continue;
      // Marked first, so two servers never both send it.
      if (!(await store.markSent(owner, reminder.id, now))) continue;
      const from = reminder.evidence[0]?.title;
      await this.send(owner, reminder.title, from ? `A reminder you asked for, from ${from}.` : "A reminder you asked for.", `reminder:${reminder.id}`);
      await this.deps.call?.(owner, reminder.title).catch((error) => backgroundFailure("reminder call", error));
    }
  }

  /** Notifications are stored under the sha256 of their key (see AgentService.notify). */
  private async alreadySent(owner: string, key: string) {
    const id = createHash("sha256").update(key).digest("hex");
    return Boolean(await this.deps.db.get(owner, "notifications", id));
  }
}
