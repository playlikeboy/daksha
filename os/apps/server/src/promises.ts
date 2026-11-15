// Promises from the journal: "I told Mum I'd call on Sunday" becomes a suggestion, an Idea of
// kind "promise" with the entry as its evidence. Nothing happens until the person taps:
// "Remind me" makes a reminder (see reminders.ts), "Dismiss" puts it away for good.
//
// The words of a saved entry go to the same model that already answers questions about it
// (one small call, see @debo/llm findPromises). Editing the entry looks again; deleting the
// entry deletes its suggestions and the reminders made from them.
import { createHash } from "node:crypto";
import type { Idea } from "../../../packages/domain/src/agent.ts";
import type { Store } from "./db.ts";
import type { DeboService, EntryChange } from "./debo/service.ts";
import { chipLabel } from "./debo/service.ts";
import { localClock, ReminderStore, reminderTime } from "./reminders.ts";
import { TimeZoneStore } from "./time-zone.ts";

const IDEAS = "ideas";
/** Entries this long or longer are cut before the model reads them. */
const TEXT_MAX = 6000;

const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const normal = (text: string) => text.trim().toLocaleLowerCase().replace(/\s+/g, " ");

export const promiseIdeaId = (entryId: string, text: string) => hash(`promise:${entryId}:${normal(text)}`);

export interface PromiseInput {
  entryId: string;
  quote: string;
  due: string | null;
  [key: string]: unknown;
}

export class PromiseFinder {
  constructor(
    private readonly db: Store,
    private readonly debo: Pick<DeboService, "findPromises">,
  ) {}

  /** Ideas of kind "promise" that came from one entry. */
  async forEntry(owner: string, entryId: string): Promise<Idea[]> {
    return (await this.db.list<Idea>(owner, IDEAS)).filter((i) => i.kind === "promise" && i.input.entryId === entryId);
  }

  /** Called after an entry is saved, edited or deleted. Must not throw on a model failure. */
  async onEntryChange(owner: string, change: EntryChange, now = new Date()): Promise<void> {
    if (change.change === "deleted") {
      for (const idea of await this.forEntry(owner, change.entryId)) await this.db.remove(owner, IDEAS, idea.id);
      await new ReminderStore(this.db).removeForEntry(owner, change.entryId);
      return;
    }
    const zone = await new TimeZoneStore(this.db).current(owner);
    const today = localClock(now, zone).day;
    const found = await this.debo.findPromises(owner, change.text.slice(0, TEXT_MAX), today);
    const keep = new Set(found.map((p) => promiseIdeaId(change.entryId, p.text)));
    const before = await this.forEntry(owner, change.entryId);
    // Suggestions the edit took away go; ones the person already decided stay as decided.
    for (const idea of before)
      if (idea.status === "new" && !keep.has(idea.id)) await this.db.remove(owner, IDEAS, idea.id);
    // An edit does not say the entry's day, so an earlier suggestion's label is kept.
    const label = change.happenedAt
      ? chipLabel(new Date(change.happenedAt))
      : (before[0]?.evidence[0]?.title ?? "Journal entry");
    for (const p of found) {
      const input: PromiseInput = { entryId: change.entryId, quote: p.quote, due: p.due };
      const idea: Idea = {
        id: promiseIdeaId(change.entryId, p.text),
        title: p.text,
        reason: p.due
          ? `You wrote this in your journal. Want a reminder on ${dayText(p.due)}?`
          : "You wrote this in your journal. Want a reminder tomorrow morning?",
        evidence: [{ id: change.entryId, kind: "journal", title: label, excerpt: p.quote }],
        prompt: p.text,
        kind: "promise",
        input,
        status: "new",
        createdAt: now.toISOString(),
      };
      // A dismissed or accepted promise has the same id, so it never comes back.
      await this.db.insertIfAbsent(owner, IDEAS, idea);
    }
  }

  /**
   * The person tapped "Remind me": make the reminder (once) and mark the suggestion accepted.
   * Returns the idea as it is now.
   */
  async accept(owner: string, idea: Idea, now = new Date()): Promise<Idea | null> {
    if (idea.kind !== "promise" || idea.status === "dismissed") return idea;
    const input = idea.input as Partial<PromiseInput>;
    const zone = await new TimeZoneStore(this.db).current(owner);
    const reminder = await new ReminderStore(this.db).add(
      owner,
      {
        title: idea.title,
        at: reminderTime(typeof input.due === "string" ? input.due : null, now, zone),
        ...(typeof input.entryId === "string" ? { entryId: input.entryId } : {}),
        ideaId: idea.id,
        evidence: idea.evidence,
      },
      `idea:${idea.id}`,
    );
    return (
      (await this.db.compareAndSwap<Idea>(owner, IDEAS, idea.id, { status: "new" }, { status: "accepted", reminderId: reminder.id })) ??
      this.db.get<Idea>(owner, IDEAS, idea.id)
    );
  }
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** "2026-11-22" as "22 November". */
function dayText(day: string): string {
  const [, month, date] = day.split("-").map(Number) as [number, number, number];
  return `${date} ${MONTHS[month - 1] ?? ""}`.trim();
}
