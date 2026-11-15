import { AsyncLocalStorage } from "node:async_hooks";
import { z } from "zod";
import type { Store } from "./db.ts";
import { backgroundFailure } from "./log.ts";

/**
 * The person's time zone, so "today" is their today and not the server's.
 *
 * The app sends its zone (an IANA name such as "Asia/Kolkata") on every request in the
 * X-Time-Zone header. The server keeps the last one it saw on the person's own records,
 * so work that runs with no request (reminders, a voice call) still knows their day.
 * It is the person's data like any other record: exported and deleted with the account.
 */
export const TIME_ZONE_HEADER = "X-Time-Zone";

/** Records kind and id of the saved zone: one record per person. */
export const TIME_ZONE_KIND = "time-zone";
export const TIME_ZONE_ID = "current";

export interface SavedTimeZone {
  id: typeof TIME_ZONE_ID;
  /** IANA zone name, checked to be one this server knows. */
  timeZone: string;
  /** When the app last sent a different zone. */
  updatedAt: string;
}

/** A zone name the runtime knows, or undefined. Never throws. */
export function readTimeZone(value: unknown): string | undefined {
  const parsed = z.string().trim().min(1).max(64).safeParse(value);
  if (!parsed.success) return undefined;
  try {
    // Kept as sent: resolvedOptions() would turn "Asia/Kolkata" into the old "Asia/Calcutta".
    new Intl.DateTimeFormat("en-CA", { timeZone: parsed.data });
    return parsed.data;
  } catch {
    return undefined;
  }
}

/** The zone of the request being served, set by the app around each signed-in request. */
export const requestTimeZone = new AsyncLocalStorage<string | undefined>();

/** The last zone seen per person, per store, so an unchanged zone is not written again. */
const lastSeen = new WeakMap<Store, Map<string, string>>();

export class TimeZoneStore {
  constructor(private readonly db: Store) {}

  /** The person's saved zone, if the app ever sent one. */
  async get(owner: string): Promise<string | undefined> {
    const saved = await this.db.get<SavedTimeZone>(owner, TIME_ZONE_KIND, TIME_ZONE_ID);
    return readTimeZone(saved?.timeZone);
  }

  /** Keep this zone as the person's own. Writes only when it changed. */
  async remember(owner: string, timeZone: string): Promise<void> {
    const zone = readTimeZone(timeZone);
    if (!zone) return;
    let seen = lastSeen.get(this.db);
    if (!seen) lastSeen.set(this.db, (seen = new Map()));
    if (seen.get(owner) === zone) return;
    if ((await this.get(owner)) !== zone)
      await this.db.put<SavedTimeZone>(owner, TIME_ZONE_KIND, {
        id: TIME_ZONE_ID,
        timeZone: zone,
        updatedAt: new Date().toISOString(),
      });
    seen.set(owner, zone);
  }

  /**
   * The zone to use for this person now: one passed in, then the request's, then the
   * saved one. Undefined means none is known, and callers use UTC.
   */
  async current(owner: string, given?: string): Promise<string | undefined> {
    const now = readTimeZone(given) ?? requestTimeZone.getStore();
    if (now) return now;
    return this.get(owner).catch((error) => {
      backgroundFailure("read time zone", error);
      return undefined;
    });
  }
}

/** One line for the prompt: "Today is Sunday, 15 November 2026 in Asia/Kolkata (it is 09:00 there)." */
export function todayPrompt(now: Date, timeZone?: string): string {
  const zone = readTimeZone(timeZone);
  const format = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-GB", { timeZone: zone ?? "UTC", ...options }).format(now);
  const date = format({ weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const time = format({ hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  return zone
    ? ` Today is ${date} in ${zone} (it is ${time} there), the person's own time zone.`
    : ` Today is ${date} in UTC (it is ${time} there). The person's time zone is not known; ask before relying on it.`;
}
