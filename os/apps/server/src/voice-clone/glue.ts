// The small seam between voice copies and custom people.
//
// MERGE NOTE (for whoever merges Workstream A, branch `custom-people`):
// Workstream A owns custom people: the `custom-people` records, the profile
// builder, and the active person on the `persona` row (`customPersonId`).
// This file reads those records directly so the voice-copy code works and can
// be tested before A is merged. On merge, replace `recordsGlue` with one that
// calls A's code:
//   person          -> A's custom-people store `get(owner, id)` (name only)
//   addSpokenLines  -> A's profile builder, passing these as `spokenLines`
//                      (then this file's `custom-people-spoken` kind can go)
//   activePersonId  -> the persona row's `customPersonId`
// and call `VoiceCopyService.deleteForPerson(owner, id)` from A's delete path.
import type { Store } from "../db.ts";

export type SpokenLine = {
  text: string;
  /** Where the line came from, for the profile's sources: "from a voice note" / "from a call recording". */
  source: string;
};

export interface CustomPeopleGlue {
  /** One of this owner's custom people, or null. Never another owner's. */
  person(owner: string, personId: string): Promise<{ id: string; name: string } | null>;
  /** Lines the chosen person really said, for their profile. */
  addSpokenLines(owner: string, personId: string, lines: SpokenLine[]): Promise<void>;
  /** The custom person Debo is talking as right now, or null. */
  activePersonId(owner: string): Promise<string | null>;
  /** Their spoken lines are no longer wanted (the person was deleted). */
  forgetSpokenLines(owner: string, personId: string): Promise<void>;
}

const SPOKEN = "custom-people-spoken";
/** The most spoken lines kept for one person, newest first. */
export const SPOKEN_LINES_MAX = 400;

type SpokenRow = { id: string; personId: string; lines: SpokenLine[]; updatedAt: string };

/** Until Workstream A is merged: read its records by their planned shape, and keep lines in our own kind. */
export function recordsGlue(db: Store): CustomPeopleGlue {
  return {
    async person(owner, personId) {
      const row = await db.get<{ id?: string; name?: unknown }>(owner, "custom-people", personId);
      return row && typeof row.name === "string" ? { id: personId, name: row.name } : null;
    },
    async addSpokenLines(owner, personId, lines) {
      const existing = await db.get<SpokenRow>(owner, SPOKEN, personId);
      const seen = new Set<string>();
      const merged = [...lines, ...(existing?.lines ?? [])].filter((l) => {
        const key = l.text.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      await db.put<SpokenRow>(owner, SPOKEN, {
        id: personId,
        personId,
        lines: merged.slice(0, SPOKEN_LINES_MAX),
        updatedAt: new Date().toISOString(),
      });
    },
    async activePersonId(owner) {
      const persona = await db.get<{ customPersonId?: unknown }>(owner, "persona", "current");
      return typeof persona?.customPersonId === "string" ? persona.customPersonId : null;
    },
    async forgetSpokenLines(owner, personId) {
      await db.remove(owner, SPOKEN, personId);
    },
  };
}
