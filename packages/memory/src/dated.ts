// The day an entry is about, for Mem0. Without it, Mem0 dates every memory by
// when it was sent, so an entry written today about last March reads as today.

export type Dated = {
  /** Mem0's `timestamp`: when it happened, in whole seconds since 1970. */
  timestamp: number;
  /** A first line for the text, so the facts Mem0 writes carry the right day. */
  lead: string;
};

/** The calendar day of `when` in `timeZone` (YYYY-MM-DD). Falls back to UTC for an unknown zone. */
function dayIn(when: Date, timeZone?: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timeZone || "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(when);
  } catch {
    return when.toISOString().slice(0, 10);
  }
}

/**
 * The date to send with an entry, or null when there is none worth sending.
 * @param happenedAt When the entry says it happened (the source's `happenedAt`).
 * @param timeZone The person's time zone, so the day is their day.
 */
export function datedFor(happenedAt?: Date | string | null, timeZone?: string): Dated | null {
  if (!happenedAt) return null;
  const when = happenedAt instanceof Date ? happenedAt : new Date(happenedAt);
  if (Number.isNaN(when.getTime())) return null;
  return { timestamp: Math.floor(when.getTime() / 1000), lead: `Written about ${dayIn(when, timeZone)}` };
}
