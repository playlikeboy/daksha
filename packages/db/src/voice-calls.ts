// Voice calls in the database. One source (kind voice_call) per call.
//
// Saving a turn is a plain write: no AI. The costly work (search pieces,
// memories) is done once per call by the server, see prepareCallIngest.
// Every function filters by userId. Never log the call's text.
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { withDb } from "./client";
import { chunks, sources } from "./schema";
import {
  type CallSpeaker,
  callSourceId,
  callTitle,
  cleanTurn,
  formatTurn,
  MAX_CALL_CHARS,
  MIN_PERSON_WORDS,
  personWords,
  speakerLabel,
  splitCallIntoChunks,
} from "./voice-call";

/**
 * Add one turn to a call, creating the call on its first turn. Safe to run
 * from two requests at once. Returns the call's source id, or null when the
 * turn had no words. A call that grew past MAX_CALL_CHARS ignores more turns.
 */
export async function appendCallTurn(
  connectionString: string,
  userId: string,
  sessionId: string,
  turn: { who: CallSpeaker; text: string; at?: Date },
): Promise<string | null> {
  const clean = cleanTurn(turn.text);
  if (!clean) return null;
  const id = callSourceId(userId, sessionId);
  const at = turn.at ?? new Date();
  const atIso = at.toISOString();
  const seconds = sql`greatest(0, floor(extract(epoch from (${atIso}::timestamptz - ${sources.happenedAt}))))::int`;
  const line = sql`'[' || lpad((${seconds} / 60)::text, 2, '0') || ':' || lpad((${seconds} % 60)::text, 2, '0') || '] ' || ${speakerLabel(turn.who)} || ': ' || ${clean}`;
  await withDb(connectionString, (db) =>
    db
      .insert(sources)
      .values({
        id,
        userId,
        kind: "voice_call",
        title: "Voice call",
        text: formatTurn(turn.who, clean, 0),
        happenedAt: at,
        createdAt: at,
        updatedAt: at,
      })
      .onConflictDoUpdate({
        target: sources.id,
        set: { text: sql`${sources.text} || E'\n' || ${line}`, updatedAt: at },
        // Never touch a row that is not this person's call.
        setWhere: and(
          eq(sources.userId, userId),
          eq(sources.kind, "voice_call"),
          sql`length(${sources.text}) < ${MAX_CALL_CHARS}`,
        ),
      }),
  );
  return id;
}

/**
 * Calls that still need their search pieces and memories: never done, or
 * changed since. `idleMs` skips calls that got a turn more recently than that
 * (they may still be going). Without `userId` it looks across people, for the
 * background sweep only.
 */
export async function callsToIngest(
  connectionString: string,
  options: { userId?: string; idleMs: number; limit?: number },
): Promise<{ id: string; userId: string }[]> {
  const cutoff = new Date(Date.now() - options.idleMs);
  return withDb(connectionString, (db) =>
    db
      .select({ id: sources.id, userId: sources.userId })
      .from(sources)
      .where(
        and(
          eq(sources.kind, "voice_call"),
          options.userId ? eq(sources.userId, options.userId) : undefined,
          or(isNull(sources.ingestedAt), lt(sources.ingestedAt, sources.updatedAt)),
          lt(sources.updatedAt, cutoff),
        ),
      )
      .limit(options.limit ?? 50),
  );
}

export type PreparedCall =
  | { status: "ready"; text: string; title: string }
  | { status: "too-short" | "gone" };

/**
 * Step one of reading a call: replace its search pieces with the current
 * words and mark it done up to its last turn. A call where the person said
 * (almost) nothing is deleted instead. Running it twice gives the same pieces:
 * it never adds duplicates. The caller then embeds the pieces and sends the
 * person's words to memory.
 */
export async function prepareCallIngest(
  connectionString: string,
  userId: string,
  sourceId: string,
): Promise<PreparedCall> {
  return withDb(connectionString, (db) =>
    db.transaction(async (tx) => {
      const [row] = await tx
        .select({ text: sources.text, updatedAt: sources.updatedAt })
        .from(sources)
        .where(and(eq(sources.id, sourceId), eq(sources.userId, userId), eq(sources.kind, "voice_call")));
      if (!row) return { status: "gone" } as const;
      if (personWords(row.text) < MIN_PERSON_WORDS) {
        await tx.delete(sources).where(and(eq(sources.id, sourceId), eq(sources.userId, userId)));
        return { status: "too-short" } as const;
      }
      const title = callTitle(row.text);
      await tx.delete(chunks).where(and(eq(chunks.sourceId, sourceId), eq(chunks.userId, userId)));
      const pieces = splitCallIntoChunks(row.text);
      await tx.insert(chunks).values(pieces.map((text, position) => ({ userId, sourceId, position, text })));
      // Marked up to the last turn we read. A turn that lands later makes the call due again.
      await tx
        .update(sources)
        .set({ title, ingestedAt: row.updatedAt })
        .where(and(eq(sources.id, sourceId), eq(sources.userId, userId)));
      return { status: "ready", text: row.text, title } as const;
    }),
  );
}
