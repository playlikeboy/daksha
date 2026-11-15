// DEV ONLY. An in-memory Debo journal for trying the screens on a laptop with
// no database and no AI key. Everything is forgotten when the server stops.
//
// It is switched on by DEBO_DEV_MEMORY=1 and only in a sample workspace
// (see createDebo). A live workspace refuses to start with the switch set, so
// this can never hold a real person's words.
//
// Tests for recordings use it too, together with the in-memory bucket
// (dev-store.ts) and the fake speech engine (transcriber.ts).
import { randomUUID } from "node:crypto";
import { callSourceId, callTitle, formatTurn, MIN_PERSON_WORDS, parseCall, personWords } from "@debo/db";
import type { ActivityItem, AskEvent, DeboBackend, DeboCallsDb, DeboMediaDb, Item, MediaRecord, Memory } from "./backend.ts";
import { chipLabel } from "./service.ts";

const words = (text: string) => text.toLowerCase().match(/[a-z]{4,}/g) ?? [];
const titleOf = (text: string, fallback: string) => (text.split("\n")[0]?.slice(0, 60) || fallback).trim();

/** How alike two texts are by the words they share, 0 to 1. */
function wordCosine(a: string, b: string): number {
  const count = (text: string) => {
    const bag = new Map<string, number>();
    for (const w of words(text)) bag.set(w, (bag.get(w) ?? 0) + 1);
    return bag;
  };
  const x = count(a);
  const y = count(b);
  let dot = 0;
  for (const [w, n] of x) dot += n * (y.get(w) ?? 0);
  const norm = (bag: Map<string, number>) => Math.sqrt([...bag.values()].reduce((sum, n) => sum + n * n, 0));
  return dot === 0 ? 0 : dot / (norm(x) * norm(y));
}

export function devMemoryBackend(): DeboBackend {
  const entries = new Map<string, Item[]>();
  const memories = new Map<string, Memory[]>();
  const activity = new Map<string, ActivityItem[]>();
  /** Recordings by id, with who owns each. */
  const records = new Map<string, MediaRecord>();
  const mine = (owner: string) => entries.get(owner) ?? [];
  const mineRecords = (owner: string) => [...records.values()].filter((r) => r.userId === owner);
  const recordOf = (owner: string, id: string) => {
    const r = records.get(id);
    return r && r.userId === owner ? r : undefined;
  };
  /** When each call last got a turn, and when it was last read. */
  const callTimes = new Map<string, { updatedAt: number; ingestedAt: number | null }>();
  const matching = (owner: string, question: string) => {
    const wanted = new Set(words(question));
    return mine(owner).filter((e) => words(e.text).some((w) => wanted.has(w)));
  };

  const media: DeboMediaDb = {
    async start(owner, input) {
      const record: MediaRecord = {
        id: input.id,
        userId: owner,
        sourceId: null,
        kind: input.kind,
        objectKey: input.objectKey,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        durationMs: input.durationMs ?? null,
        recordedAt: input.recordedAt ?? null,
        device: input.device ?? null,
        uploadState: "uploading",
        uploadId: input.uploadId ?? null,
        transcriptStatus: "waiting",
        transcriptError: null,
        transcriptAttempts: 0,
        transcriptStartedAt: null,
        language: null,
        segments: null,
        contentHash: null,
        createdAt: new Date(),
      };
      records.set(record.id, record);
      return record;
    },
    async get(owner, id) {
      return recordOf(owner, id) ?? null;
    },
    async forSource(owner, sourceId) {
      return mineRecords(owner).find((r) => r.sourceId === sourceId) ?? null;
    },
    async text(owner, sourceId) {
      return mine(owner).find((e) => e.id === sourceId)?.text ?? "";
    },
    async finish(owner, id, input) {
      const r = recordOf(owner, id);
      if (!r) return null;
      if (r.sourceId) return { record: r, created: false };
      const sourceId = randomUUID();
      entries.set(owner, [
        ...mine(owner),
        { id: sourceId, kind: r.kind, title: input.title, text: "", happenedAt: input.happenedAt },
      ]);
      Object.assign(r, { sourceId, uploadState: "stored", uploadId: null, sizeBytes: input.sizeBytes, transcriptStatus: "waiting" });
      return { record: r, created: true };
    },
    async claim(owner, id) {
      const r = recordOf(owner, id);
      if (!r || r.uploadState !== "stored" || r.transcriptStatus !== "waiting") return null;
      Object.assign(r, {
        transcriptStatus: "working",
        transcriptError: null,
        transcriptStartedAt: new Date(),
        transcriptAttempts: r.transcriptAttempts + 1,
      });
      return r;
    },
    async pending() {
      return [...records.values()]
        .filter((r) => r.uploadState === "stored" && r.transcriptStatus === "waiting")
        .map((r) => ({ id: r.id, userId: r.userId }));
    },
    async requeue(owner, id) {
      const r = recordOf(owner, id);
      if (!r || r.transcriptStatus !== "failed") return false;
      Object.assign(r, { transcriptStatus: "waiting", transcriptError: null, transcriptAttempts: 0 });
      return true;
    },
    async fail(owner, id, reason) {
      const r = recordOf(owner, id);
      if (r) Object.assign(r, { transcriptStatus: "failed", transcriptError: reason });
    },
    async save(owner, id, t) {
      const r = recordOf(owner, id);
      const entry = r?.sourceId ? mine(owner).find((e) => e.id === r.sourceId) : undefined;
      if (!r || !entry) return false;
      Object.assign(r, {
        transcriptStatus: "ready",
        transcriptError: null,
        language: t.language,
        segments: t.segments,
        contentHash: t.contentHash,
      });
      if (t.durationMs) r.durationMs = t.durationMs;
      entry.text = t.text.trim();
      // A title the person gave when saving stays, as in the real database.
      const fallback = r.kind === "video" ? "Video" : "Voice note";
      if (!entry.title || entry.title === fallback) entry.title = titleOf(entry.text, fallback);
      return true;
    },
    async findByHash(owner, hash, exceptId) {
      const other = mineRecords(owner).find(
        (r) => r.contentHash === hash && r.id !== exceptId && r.transcriptStatus === "ready",
      );
      const entry = other?.sourceId ? mine(owner).find((e) => e.id === other.sourceId) : undefined;
      return other && entry ? { text: entry.text, language: other.language, segments: other.segments ?? [] } : null;
    },
    async keys(owner) {
      return mineRecords(owner).map((r) => ({ id: r.id, objectKey: r.objectKey, uploadId: r.uploadId }));
    },
    async remove(owner, id) {
      return recordOf(owner, id) ? records.delete(id) : false;
    },
    async stale() {
      const cutoff = Date.now() - 24 * 3_600_000;
      return [...records.values()]
        .filter((r) => !r.sourceId && r.createdAt.getTime() < cutoff)
        .map((r) => ({ id: r.id, userId: r.userId, objectKey: r.objectKey, uploadId: r.uploadId }));
    },
    async today(owner) {
      const midnight = new Date().setUTCHours(0, 0, 0, 0);
      const todays = mineRecords(owner).filter((r) => r.createdAt.getTime() >= midnight);
      return { count: todays.length, ms: todays.reduce((sum, r) => sum + (r.durationMs ?? 0), 0) };
    },
    async export(owner) {
      return mineRecords(owner).filter((r) => r.uploadState === "stored");
    },
  };

  const calls: DeboCallsDb = {
    async append(owner, sessionId, turn) {
      const text = turn.text.replace(/\s+/g, " ").trim();
      if (!text) return null;
      const id = callSourceId(owner, sessionId);
      const at = turn.at ?? new Date();
      const existing = mine(owner).find((e) => e.id === id);
      if (existing) {
        const seconds = (at.getTime() - existing.happenedAt.getTime()) / 1000;
        existing.text += `\n${formatTurn(turn.who, text, seconds)}`;
      } else {
        entries.set(owner, [
          ...mine(owner),
          { id, kind: "voice_call", title: "Voice call", text: formatTurn(turn.who, text, 0), happenedAt: at },
        ]);
      }
      callTimes.set(id, { updatedAt: at.getTime(), ingestedAt: callTimes.get(id)?.ingestedAt ?? null });
      return id;
    },
    async due({ owner, idleMs, limit = 50 }) {
      const cutoff = Date.now() - idleMs;
      const found: { id: string; userId: string }[] = [];
      for (const [userId, list] of entries) {
        if (owner && userId !== owner) continue;
        for (const e of list) {
          const t = callTimes.get(e.id);
          if (e.kind !== "voice_call" || !t) continue;
          if ((t.ingestedAt === null || t.ingestedAt < t.updatedAt) && t.updatedAt <= cutoff) found.push({ id: e.id, userId });
        }
      }
      return found.slice(0, limit);
    },
    async ingest(owner, id) {
      const entry = mine(owner).find((e) => e.id === id && e.kind === "voice_call");
      const t = callTimes.get(id);
      if (!entry || !t) return "gone";
      if (personWords(entry.text) < MIN_PERSON_WORDS) {
        entries.set(owner, mine(owner).filter((e) => e !== entry));
        return "too-short";
      }
      entry.title = callTitle(entry.text);
      t.ingestedAt = t.updatedAt;
      // Stands in for memory: only the person's own turns become memories, never Debo's.
      const kept = (memories.get(owner) ?? []).filter((m) => m.sourceId !== id);
      for (const turn of parseCall(entry.text))
        if (turn.who === "person")
          kept.push({ id: randomUUID(), text: turn.text.slice(0, 200), sourceId: id, editedByUser: false, createdAt: new Date().toISOString(), updatedAt: null });
      memories.set(owner, kept);
      return "ingested";
    },
  };

  return {
    calls,
    entries: {
      async list(owner, { limit, contains }) {
        const needle = contains?.toLowerCase();
        return mine(owner)
          .filter((e) => !needle || e.text.toLowerCase().includes(needle))
          .sort((a, b) => b.happenedAt.getTime() - a.happenedAt.getTime())
          .slice(0, limit)
          .map((e) => ({ ...e, media: mineRecords(owner).find((r) => r.sourceId === e.id) ?? null }));
      },
      async get(owner, id) {
        const entry = mine(owner).find((e) => e.id === id);
        return entry ? { ...entry, media: mineRecords(owner).find((r) => r.sourceId === entry.id) ?? null } : null;
      },
      async create(owner, text, happenedAt) {
        const entry: Item = { id: randomUUID(), title: titleOf(text, ""), text, happenedAt: happenedAt ?? new Date() };
        entries.set(owner, [...mine(owner), entry]);
        return entry;
      },
      async update(owner, id, text) {
        const entry = mine(owner).find((e) => e.id === id);
        if (!entry) return false;
        entry.text = text;
        return true;
      },
      async remove(owner, id) {
        const before = mine(owner).length;
        for (const r of mineRecords(owner)) if (r.sourceId === id) records.delete(r.id);
        entries.set(
          owner,
          mine(owner).filter((e) => e.id !== id),
        );
        memories.set(
          owner,
          (memories.get(owner) ?? []).filter((m) => m.sourceId !== id),
        );
        return mine(owner).length < before;
      },
    },
    async search(owner, query, limit) {
      return matching(owner, query)
        .slice(0, limit)
        .map((e) => ({
          chunkId: e.id,
          sourceId: e.id,
          kind: e.kind ?? "journal",
          title: e.title,
          happenedAt: e.happenedAt,
          text: e.text,
        }));
    },
    // Stands in for meaning search: shared words instead of embeddings, same shape and order.
    async similar(owner, id, limit) {
      const self = mine(owner).find((e) => e.id === id);
      if (!self) return [];
      return mine(owner)
        .filter((e) => e.id !== id && e.text.trim())
        .map((e) => ({ e, distance: 1 - wordCosine(self.text, e.text) }))
        .filter((x) => x.distance < 0.95)
        .sort((a, b) => a.distance - b.distance || b.e.happenedAt.getTime() - a.e.happenedAt.getTime())
        .slice(0, limit)
        .map(({ e, distance }) => ({
          id: e.id,
          kind: e.kind ?? "journal",
          title: e.title,
          happenedAt: e.happenedAt,
          text: e.text.slice(0, 1200),
          distance,
        }));
    },
    async *ask(owner, question): AsyncGenerator<AskEvent, void> {
      const found = matching(owner, question);
      if (found.length === 0) {
        yield { type: "done", outcome: { status: "unknown" } };
        return;
      }
      const sources = found.map((e) => ({ id: e.id, label: chipLabel(e.happenedAt, e.kind) }));
      const answer = `From your journal: ${found[0]?.text ?? ""}`;
      yield { type: "sources", sources };
      yield { type: "text", delta: answer };
      yield { type: "done", outcome: { status: "answered", answer, sources } };
    },
    async sources(owner, ids) {
      return mine(owner)
        .filter((e) => ids.includes(e.id))
        .map((e) => ({ id: e.id, kind: e.kind, title: e.title, happenedAt: e.happenedAt }));
    },
    memories: {
      async list(owner) {
        return memories.get(owner) ?? [];
      },
      async update(owner, id, text) {
        const m = (memories.get(owner) ?? []).find((x) => x.id === id);
        if (!m) return null;
        m.text = text;
        m.editedByUser = true;
        m.updatedAt = new Date().toISOString();
        return m;
      },
      async forget(owner, id) {
        const m = (memories.get(owner) ?? []).find((x) => x.id === id);
        if (!m) return null;
        memories.set(
          owner,
          (memories.get(owner) ?? []).filter((x) => x.id !== id),
        );
        return m;
      },
    },
    media,
    activity: {
      async list(owner) {
        return [...(activity.get(owner) ?? [])].reverse();
      },
      async record(owner, item) {
        activity.set(owner, [
          ...(activity.get(owner) ?? []),
          {
            id: randomUUID(),
            actor: item.actor,
            action: item.action,
            sourceIds: item.sourceIds ?? [],
            createdAt: new Date(),
          },
        ]);
      },
    },
    // Stands in for "Debo remembers what is in it": the first line becomes a memory.
    async afterChange(owner, entryId, change) {
      if (change !== "saved") return;
      const entry = mine(owner).find((e) => e.id === entryId);
      if (!entry || !entry.text.trim()) return;
      const kept = (memories.get(owner) ?? []).filter((m) => m.sourceId !== entryId);
      kept.push({
        id: randomUUID(),
        text: entry.text.split("\n")[0]?.slice(0, 200) ?? "",
        sourceId: entryId,
        editedByUser: false,
        // Dated by the day the entry is about, as Mem0 is (see rememberFromSource).
        createdAt: new Date(entry.happenedAt).toISOString(),
        updatedAt: null,
      });
      memories.set(owner, kept);
    },
    askConfigured: true,
  };
}
