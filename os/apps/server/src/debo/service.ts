// What the routes, the agent tools and the review flow call. It adds the rules
// that belong to Daksha, on top of a DeboBackend:
// - everything is scoped to one owner, and only a Daksha account (a UUID) has a journal;
// - input is checked with Zod, in plain words;
// - without a Daksha database the features say "not set up" instead of failing;
// - every change leaves a line in the activity record (ids only).
import { type AskOutcome, UNKNOWN_MESSAGE } from "@debo/brain";
import { speakToPerson } from "@debo/memory";
import { callMinutes } from "@debo/db";
import { z } from "zod";
import { AppError } from "../errors.ts";
import type { ActivityAction, ActivityItem, AskEvent, DeboBackend, Item, SourceKind } from "./backend.ts";
import { MEDIA_LIMITS, type MediaLimits } from "./media-limits.ts";
import { type MediaDeps, MediaService, type MediaView } from "./media-service.ts";

export const NOT_SET_UP =
  "Your journal is not set up yet. Whoever runs this Daksha needs to turn it on. Until then, nothing can be saved here.";
export const NOT_A_DEBO_ACCOUNT =
  "You are using a test sign-in. Sign in with your Daksha account to use your journal.";
export const MEMORY_OFF =
  "Daksha is not keeping memories right now. Your entries are safe, and you can still ask about them.";
const MEMORY_GONE = "I couldn't find that memory. It may already be forgotten.";
const ENTRY_GONE = "I couldn't find that entry. It may have been deleted.";
export const ASK_OFF = "Answers are not set up yet. Whoever runs this Daksha needs to turn them on. Your entries are still safe.";

const Uuid = z.string().uuid();
export const EntryText = z
  .string()
  .trim()
  .min(1, "Write something first.")
  .max(20_000, "That entry is too long. Keep it under 20,000 characters.");
export const Question = z
  .string()
  .trim()
  .min(1, "Write something first.")
  .max(500, "Keep your question under 500 characters.");
/** The day the person says it happened. Not more than a day ahead (time zones). */
const HappenedAt = z.coerce.date().refine((d) => d.getTime() < Date.now() + 86_400_000, "Pick a day that is not in the future.");
export const FindText = z.string().trim().max(200, "Keep what you search for under 200 characters.");
export const MemoryText = z
  .string()
  .trim()
  .min(1, "Write what Daksha should remember.")
  .max(1000, "Keep it under 1,000 characters.");

export type EntryView = {
  id: string;
  /** What it is: something written, a voice note or a video. */
  kind: "journal" | "voice" | "video" | "call";
  title: string;
  /** For a voice call: how many minutes it lasted. */
  minutes?: number;
  text: string;
  happenedAt: string;
  /** The recording, for a voice note or video. */
  media: MediaView | null;
};
export type SourceChipView = { id: string; label: string };
/** An entry close in meaning to another one: enough to show a short card that opens it. */
export type SimilarView = {
  id: string;
  kind: EntryView["kind"];
  title: string;
  happenedAt: string;
  /** A short piece of its words. */
  snippet: string;
  label: string;
};

/** How many similar entries an entry page shows. */
export const SIMILAR_LIMIT = 5;

/** A short, flat preview. Call lines lose their "[00:07] You:" marks. */
export function snippetOf(text: string, max = 180): string {
  const flat = text
    .replace(/^\[\d+:\d{2}\] (?:You|Daksha|Debo): /gm, "") // old calls say "Debo:". brand-check: keep
    .replace(/\s+/g, " ")
    .trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}
export type MemoryView = {
  id: string;
  text: string;
  editedByUser: boolean;
  createdAt: string | null;
  source: SourceChipView;
};
export type ActivityView = {
  id: string;
  actor: "you" | "debo";
  action: ActivityAction;
  sourceIds: string[];
  createdAt: string;
};
export type AskAnswer =
  | { status: "answered"; answer: string; sources: SourceChipView[] }
  | { status: "unknown"; message: string }
  | { status: "limit"; message: string }
  | { status: "stopped"; answer: string; sources: SourceChipView[] };

export type DeboStatus = {
  configured: boolean;
  /** Plain-English reason when something is off. */
  message?: string;
  journal: boolean;
  ask: boolean;
  memories: boolean;
  /** Voice notes and videos can be added (the bucket is set up). */
  recordings: boolean;
  /** Speaking into the text works (the speech service is set up). */
  speaking: boolean;
  limits: MediaLimits;
};

const dayFormat = (date: Date) =>
  date.toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
/** "Journal, 11 November", "Voice note, 11 November", "Video, 11 November" or "Voice call, 14 November". */
export const chipLabel = (date: Date, kind: SourceKind = "journal") =>
  `${kind === "voice" ? "Voice note" : kind === "video" ? "Video" : kind === "voice_call" ? "Voice call" : "Journal"}, ${dayFormat(date)}`;

/** A call that got no turn for this long is over, whether or not the app said so. */
export const CALL_IDLE_MS = 10 * 60_000;
/** The app says a call ended. Wait this long for Daksha's last words to be saved first. */
const CALL_END_GRACE_MS = 2_000;

/** What the server hears about a typed entry: saved (with its words) or deleted. */
export type EntryChange =
  | { entryId: string; change: "saved"; text: string; happenedAt?: string }
  | { entryId: string; change: "deleted" };

export class DeboService {
  private readonly pending = new Set<Promise<unknown>>();
  private readonly recordings: MediaService | null;
  private sweeper?: ReturnType<typeof setInterval>;
  /** Calls being read right now ("owner:id"), so two requests never read the same call twice at once. */
  private readonly reading = new Set<string>();
  /** When each person's idle calls were last looked for, so a busy screen does not ask every time. */
  private readonly lastCallSweep = new Map<string, number>();
  /** Set by the server: deleting a call also deletes its copy in Chat. */
  onCallDeleted?: (owner: string, callId: string) => Promise<void>;
  /**
   * Set by the server: a typed entry was saved, edited or deleted, so promises found in it
   * can be suggested (or taken away). Runs after the entry is safe; must not throw.
   */
  onEntryChange?: (owner: string, change: EntryChange) => Promise<void>;
  /** How long to wait after "call ended" for the last words to be saved. Tests set 0. */
  callEndGraceMs = CALL_END_GRACE_MS;
  /** Sample mode only: the in-memory bucket, to be served at /api/dev-r2. Never set in a live workspace. */
  devStore?: import("hono").Hono;
  /** Binding mode only: uploads to and playback from the private bucket, through this server. Served at /api/media-blob. */
  blobRoutes?: import("hono").Hono;
  /** The private bucket recordings use. Pictures Daksha makes are kept here too, under the owner's folder. */
  readonly mediaStore?: import("./object-store.ts").ObjectStore;
  /** The speech engine and audio tools recordings use. Custom people read their videos with them too. */
  readonly mediaTools?: Pick<MediaDeps, "transcriber" | "audio">;

  /**
   * `backend` is null when there is no Daksha database. `localOwners` are extra
   * owner names allowed without being a Daksha account; only the dev-only
   * in-memory journal passes any.
   */
  constructor(
    private readonly backend: DeboBackend | null,
    private readonly localOwners: readonly string[] = [],
    mediaDeps?: MediaDeps,
  ) {
    const media = backend?.media;
    this.mediaStore = mediaDeps?.store;
    this.mediaTools = mediaDeps ? { transcriber: mediaDeps.transcriber, audio: mediaDeps.audio } : undefined;
    this.recordings =
      backend && media && mediaDeps
        ? new MediaService(media, mediaDeps, {
            afterTranscript: (owner, sourceId) => backend.afterChange(owner, sourceId, "saved"),
            later: (work) => this.later(work),
          })
        : null;
  }

  /** Start the background upkeep: finish transcripts a stopped server left, clear unfinished uploads. */
  startBackground(everyMs = 5 * 60_000) {
    const calls = this.backend?.calls;
    if ((!this.recordings && !calls) || this.sweeper) return;
    const work = () => {
      void this.recordings?.sweep();
      void this.sweepAllCalls();
    };
    work();
    this.sweeper = setInterval(work, everyMs);
    this.sweeper.unref?.();
  }

  stopBackground() {
    if (this.sweeper) clearInterval(this.sweeper);
    this.sweeper = undefined;
  }

  /** The recordings part, or the plain "not set up" error. */
  private recordingsFor(owner: string): MediaService {
    this.ready(owner);
    if (!this.recordings)
      throw new AppError("Voice notes and videos are not set up yet. Whoever runs this Daksha needs to turn them on. You can still write entries.", 503);
    return this.recordings;
  }

  get configured() {
    return this.backend !== null;
  }

  status(): DeboStatus {
    if (!this.backend)
      return { configured: false, message: NOT_SET_UP, journal: false, ask: false, memories: false, recordings: false, speaking: false, limits: MEDIA_LIMITS };
    return {
      configured: true,
      journal: true,
      ask: this.backend.askConfigured,
      memories: this.backend.memories !== null,
      recordings: this.recordings !== null,
      speaking: this.recordings?.engineName !== undefined,
      limits: MEDIA_LIMITS,
      ...(this.backend.askConfigured ? {} : { message: ASK_OFF }),
    };
  }

  /** Resolves when background work (indexing, memories) has finished. For tests and shutdown. */
  async idle() {
    while (this.pending.size) await Promise.allSettled([...this.pending]);
  }

  /** Throws the plain "not set up" or "sign in" error, so a tool can stop before it proposes anything. */
  assertReady(owner: string): void {
    this.ready(owner);
  }

  /** Runs a journal proposal the person approved. The entry is saved as Daksha's doing, with their OK. */
  async executeProposal(owner: string, text: string): Promise<string> {
    const entry = await this.createEntry(owner, { text }, "debo");
    return `Saved to your journal · ${entry.id}`;
  }

  private ready(owner: string): DeboBackend {
    if (!this.backend) throw new AppError(NOT_SET_UP, 503);
    if (!Uuid.safeParse(owner).success && !this.localOwners.includes(owner))
      throw new AppError(NOT_A_DEBO_ACCOUNT, 403);
    return this.backend;
  }

  /** The activity record must never block or undo what the person did. */
  private async record(backend: DeboBackend, owner: string, actor: "you" | "debo", action: ActivityAction, ids: string[]) {
    try {
      await backend.activity.record(owner, { actor, action, sourceIds: ids });
    } catch (error) {
      console.error("activity record failed", { owner, action, reason: error instanceof Error ? error.name : "unknown" });
    }
  }

  private later(work: Promise<void>) {
    const tracked = work.catch(() => {}).finally(() => this.pending.delete(tracked));
    this.pending.add(tracked);
  }

  private entryView(e: Item): EntryView {
    return {
      id: e.id,
      kind: e.kind === "voice_call" ? "call" : (e.kind ?? "journal"),
      title: e.title,
      ...(e.kind === "voice_call" ? { minutes: callMinutes(e.text) } : {}),
      text: e.text,
      happenedAt: e.happenedAt.toISOString(),
      media: e.media && this.recordings ? this.recordings.view(e.media) : null,
    };
  }

  // ---- The person's whole journal: download it, delete it ----

  /** The backend, only when this owner has a journal here. Never throws. */
  private journalOf(owner: string): DeboBackend | null {
    if (!this.backend) return null;
    return Uuid.safeParse(owner).success || this.localOwners.includes(owner) ? this.backend : null;
  }

  /** Every entry and memory this person has, for "Download my data". Null when there is no journal. */
  async exportMine(
    owner: string,
  ): Promise<{ entries: EntryView[]; memories: MemoryView[]; recordings: unknown[] } | null> {
    const backend = this.journalOf(owner);
    if (!backend) return null;
    const entries = (await backend.entries.list(owner, { limit: 100_000 })).map((e) => this.entryView(e));
    const memories = backend.memories ? await this.listMemories(owner) : [];
    // Each recording: its details and transcript, and a link that downloads the file for 24 hours.
    const recordings = this.recordings ? await this.recordings.exportFor(owner, entries) : [];
    return { entries, memories, recordings };
  }

  /** Deletes every entry this person wrote, and what Daksha learned from each. Returns how many entries went. */
  async deleteMine(owner: string): Promise<number> {
    const backend = this.journalOf(owner);
    if (!backend) return 0;
    const entries = await backend.entries.list(owner, { limit: 100_000 });
    for (const entry of entries) {
      // The file goes first: if it cannot be deleted, the entry stays and the person can try again.
      if (entry.media) await this.recordings?.deleteFor(owner, entry.id);
      if (await backend.entries.remove(owner, entry.id)) {
        await backend.afterChange(owner, entry.id, "deleted");
        if (entry.kind === "voice_call") await this.dropCallChat(owner, entry.id);
      }
    }
    // Unfinished uploads and anything else under this person's folder.
    await this.recordings?.deleteAllFor(owner);
    // Anything Daksha still remembers that no longer has an entry goes too.
    if (backend.memories)
      for (const memory of await backend.memories.list(owner)) await backend.memories.forget(owner, memory.id);
    return entries.length;
  }

  // ---- Journal ----

  async listEntries(owner: string, query: { find?: unknown; limit?: unknown } = {}): Promise<EntryView[]> {
    const backend = this.ready(owner);
    this.sweepCalls(owner);
    const contains = FindText.parse(query.find ?? "") || undefined;
    const limit = z.coerce.number().int().min(1).max(500).catch(100).parse(query.limit ?? 100);
    return (await backend.entries.list(owner, { limit, contains })).map((e) => this.entryView(e));
  }

  /** One entry, for its own page. Someone else's id gets the same answer as a deleted one. */
  async getEntry(owner: string, id: string): Promise<EntryView> {
    const backend = this.ready(owner);
    if (!Uuid.safeParse(id).success) throw new AppError(ENTRY_GONE, 404);
    const entry = await backend.entries.get(owner, id);
    if (!entry) throw new AppError(ENTRY_GONE, 404);
    return this.entryView(entry);
  }

  /**
   * Up to five of this person's other entries closest in meaning to one entry,
   * closest first. Uses the embeddings already kept for search: no model call.
   */
  async similarEntries(owner: string, id: string): Promise<SimilarView[]> {
    const backend = this.ready(owner);
    if (!Uuid.safeParse(id).success) throw new AppError(ENTRY_GONE, 404);
    if (!(await backend.entries.get(owner, id))) throw new AppError(ENTRY_GONE, 404);
    const found = await backend.similar(owner, id, SIMILAR_LIMIT + 1);
    // Never the entry itself, and each other entry once, even if a backend slips.
    const others = [...new Map(found.filter((s) => s.id !== id).map((s) => [s.id, s])).values()];
    return others
      .sort((a, b) => a.distance - b.distance)
      .slice(0, SIMILAR_LIMIT)
      .map((s) => ({
        id: s.id,
        kind: s.kind === "voice_call" ? "call" : s.kind,
        title: s.title,
        happenedAt: s.happenedAt.toISOString(),
        snippet: snippetOf(s.text),
        label: chipLabel(s.happenedAt, s.kind),
      }));
  }

  async createEntry(owner: string, input: unknown, actor: "you" | "debo" = "you"): Promise<EntryView> {
    const backend = this.ready(owner);
    this.sweepCalls(owner);
    const { text, happenedAt } = z.object({ text: EntryText, happenedAt: HappenedAt.optional() }).parse(input);
    const entry = await backend.entries.create(owner, text, happenedAt);
    await this.record(backend, owner, actor, "saved", [entry.id]);
    this.later(backend.afterChange(owner, entry.id, "saved"));
    this.entryChanged(owner, { entryId: entry.id, change: "saved", text, happenedAt: entry.happenedAt.toISOString() });
    return this.entryView(entry);
  }

  async updateEntry(owner: string, id: string, input: unknown): Promise<void> {
    const backend = this.ready(owner);
    if (!Uuid.safeParse(id).success) throw new AppError(ENTRY_GONE, 404);
    const { text } = z.object({ text: EntryText }).parse(input);
    if (!(await backend.entries.update(owner, id, text))) throw new AppError(ENTRY_GONE, 404);
    await this.record(backend, owner, "you", "edited", [id]);
    this.later(backend.afterChange(owner, id, "saved"));
    this.entryChanged(owner, { entryId: id, change: "saved", text });
  }

  async deleteEntry(owner: string, id: string): Promise<void> {
    const backend = this.ready(owner);
    if (!Uuid.safeParse(id).success) throw new AppError(ENTRY_GONE, 404);
    // The recording's file first: if that fails, nothing is half deleted.
    await this.recordings?.deleteFor(owner, id);
    if (!(await backend.entries.remove(owner, id))) throw new AppError(ENTRY_GONE, 404);
    await this.record(backend, owner, "you", "deleted", [id]);
    this.later(backend.afterChange(owner, id, "deleted"));
    this.entryChanged(owner, { entryId: id, change: "deleted" });
    await this.dropCallChat(owner, id);
  }

  // ---- Voice calls ----
  // Each turn is a plain database write. The costly part (search pieces and
  // memories) runs once per call: when the app says the call ended, or, if it
  // never does (closed tab), when the call has been quiet for CALL_IDLE_MS and
  // the person next uses voice or the journal, or the background sweep runs.

  /** Promises the person made in an entry, or none when no model is set up. Never throws. */
  async findPromises(owner: string, text: string, today: string) {
    const backend = this.journalOf(owner);
    if (!backend?.findPromises) return [];
    try {
      return await backend.findPromises(text, today);
    } catch (error) {
      console.error("find promises failed", { owner, reason: error instanceof Error ? error.name : "unknown" });
      return [];
    }
  }

  private entryChanged(owner: string, change: EntryChange) {
    const listener = this.onEntryChange;
    if (!listener) return;
    this.later(
      listener(owner, change).catch((error) =>
        console.error("entry follow-up failed", { owner, reason: error instanceof Error ? error.name : "unknown" }),
      ),
    );
  }

  /** A call's copy in Chat has the same words, so deleting the call deletes it too. */
  private async dropCallChat(owner: string, callId: string) {
    try {
      await this.onCallDeleted?.(owner, callId);
    } catch {
      // The call itself is already gone; the chat copy can be deleted by hand.
    }
  }

  get keepsCalls(): boolean {
    return Boolean(this.backend?.calls);
  }

  /**
   * Save one turn of a call. Never throws: a call must not break because saving
   * failed. Returns the call's id, or null when nothing was saved.
   */
  async recordCallTurn(owner: string, sessionId: string, who: "person" | "debo", text: string): Promise<string | null> {
    const calls = this.journalOf(owner)?.calls;
    if (!calls) return null;
    try {
      return await calls.append(owner, sessionId, { who, text });
    } catch (error) {
      console.error("call turn not saved", { owner, reason: error instanceof Error ? error.name : "unknown" });
      return null;
    }
  }

  /** The app says the call ended: read this person's open calls once the last words are in. */
  callEnded(owner: string): void {
    const backend = this.journalOf(owner);
    if (!backend?.calls) return;
    const run = async () => {
      if (this.callEndGraceMs > 0) await new Promise((r) => setTimeout(r, this.callEndGraceMs));
      await this.ingestDue(owner, 0);
    };
    this.later(run());
  }

  /** Read this person's calls that have been quiet for a while. Cheap to call often. */
  sweepCalls(owner: string): void {
    if (!this.journalOf(owner)?.calls) return;
    const now = Date.now();
    if (now - (this.lastCallSweep.get(owner) ?? 0) < 60_000) return;
    this.lastCallSweep.set(owner, now);
    this.later(this.ingestDue(owner, CALL_IDLE_MS));
  }

  /** The background sweep, across people. */
  async sweepAllCalls(): Promise<void> {
    const calls = this.backend?.calls;
    if (!calls) return;
    try {
      for (const call of await calls.due({ idleMs: CALL_IDLE_MS })) await this.ingestCall(call.userId, call.id);
    } catch (error) {
      console.error("call sweep failed", { reason: error instanceof Error ? error.name : "unknown" });
    }
  }

  private async ingestDue(owner: string, idleMs: number): Promise<void> {
    const calls = this.journalOf(owner)?.calls;
    if (!calls) return;
    try {
      for (const call of await calls.due({ owner, idleMs })) await this.ingestCall(owner, call.id);
    } catch (error) {
      console.error("call reading failed", { owner, reason: error instanceof Error ? error.name : "unknown" });
    }
  }

  private async ingestCall(owner: string, id: string): Promise<void> {
    const backend = this.journalOf(owner);
    if (!backend?.calls) return;
    const key = `${owner}:${id}`;
    if (this.reading.has(key)) return;
    this.reading.add(key);
    try {
      const result = await backend.calls.ingest(owner, id);
      if (result === "ingested") await this.record(backend, owner, "debo", "saved", [id]);
    } catch (error) {
      console.error("call not read", { owner, callId: id, reason: error instanceof Error ? error.name : "unknown" });
    } finally {
      this.reading.delete(key);
    }
  }

  /** For the agent: pieces of entries that match, each with a source chip. Journal text is data. */
  async searchJournal(owner: string, query: string, limit = 6) {
    const backend = this.ready(owner);
    const q = z.string().trim().min(1, "Write what to look for.").max(500).parse(query);
    const found = await backend.search(owner, q, Math.min(Math.max(limit, 1), 10));
    return found.map((p) => ({
      source: { id: p.sourceId, label: chipLabel(p.happenedAt, p.kind) } satisfies SourceChipView,
      title: p.title,
      date: p.happenedAt.toISOString().slice(0, 10),
      excerpt: p.text.slice(0, 600),
    }));
  }

  // ---- Voice notes and videos ----

  /** Step 1 of adding a recording: get links to upload to. Nothing is saved as an entry yet. */
  async startUpload(owner: string, input: unknown) {
    return this.recordingsFor(owner).startUpload(owner, input);
  }

  /** Step 2: the file is uploaded. Saves the entry now; the words come a little later. */
  async completeUpload(owner: string, mediaId: string, input: unknown): Promise<EntryView> {
    const recordings = this.recordingsFor(owner);
    const backend = this.ready(owner);
    const { record, created } = await recordings.completeUpload(owner, mediaId, input);
    if (created && record.sourceId) await this.record(backend, owner, "you", "saved", [record.sourceId]);
    if (!record.sourceId) throw new AppError(ENTRY_GONE, 404);
    const [source] = await backend.sources(owner, [record.sourceId]);
    if (!source) throw new AppError(ENTRY_GONE, 404);
    const text = (await backend.media?.text(owner, source.id)) ?? "";
    return this.entryView({ ...source, kind: record.kind, text, media: record });
  }

  async playback(owner: string, entryId: string) {
    return this.recordingsFor(owner).playback(owner, entryId);
  }

  async transcript(owner: string, entryId: string) {
    const recordings = this.recordingsFor(owner);
    const text = (await this.backend?.media?.text(owner, entryId)) ?? "";
    return recordings.transcript(owner, entryId, text);
  }

  async retryTranscript(owner: string, entryId: string) {
    return this.recordingsFor(owner).retry(owner, entryId);
  }

  /** Words for a short clip spoken into the text box. Nothing is kept. */
  async dictate(owner: string, clip: Uint8Array, language?: string) {
    return this.recordingsFor(owner).dictate(owner, clip, language);
  }

  // ---- Ask ----

  /**
   * The one brain, streamed. Yields the same events as @debo/brain. A question
   * the entries cannot answer ends as `unknown`, never as a guess.
   */
  ask(owner: string, question: unknown, signal?: AbortSignal): AsyncGenerator<AskEvent, void> {
    const backend = this.ready(owner);
    if (!backend.askConfigured) throw new AppError(ASK_OFF, 503);
    const q = Question.parse(question);
    const ownKey = this.ownAnthropicKey;
    if (!ownKey) return backend.ask(owner, q, signal);
    // With their own Anthropic key, the answer is made on it, and Daksha's daily limit does not apply.
    return (async function* () {
      const anthropicKey = await ownKey(owner).catch(() => undefined);
      yield* backend.ask(owner, q, signal, anthropicKey ? { anthropicKey } : undefined);
    })();
  }

  /** Set by the server: the person's own Anthropic key, when they saved one. Never logged. */
  ownAnthropicKey?: (owner: string) => Promise<string | undefined>;

  /** Ask and wait for the whole answer. */
  async askAll(owner: string, question: unknown, signal?: AbortSignal): Promise<AskAnswer> {
    for await (const event of this.ask(owner, question, signal)) {
      if (event.type === "done") return outcomeView(event.outcome);
    }
    throw new Error("The answer stream ended without a result.");
  }

  // ---- What Daksha knows ----

  async listMemories(owner: string): Promise<MemoryView[]> {
    const backend = this.ready(owner);
    if (!backend.memories) throw new AppError(MEMORY_OFF, 503);
    const memories = await backend.memories.list(owner);
    // Show a memory only while its entry is still this person's.
    const ids = [...new Set(memories.map((m) => m.sourceId))].filter((id) => Uuid.safeParse(id).success);
    const sources = await backend.sources(owner, ids);
    const labels = new Map(sources.map((s) => [s.id, chipLabel(s.happenedAt, s.kind)]));
    return memories.flatMap((m) => {
      const label = labels.get(m.sourceId);
      if (!label) return [];
      return [
        {
          id: m.id,
          // Older memories say "User went…". Shown as "You went…"; a fixed memory is shown as written.
          text: m.editedByUser ? m.text : speakToPerson(m.text),
          editedByUser: m.editedByUser,
          createdAt: m.createdAt,
          source: { id: m.sourceId, label },
        },
      ];
    });
  }

  async fixMemory(owner: string, id: string, input: unknown): Promise<void> {
    const backend = this.ready(owner);
    if (!backend.memories) throw new AppError(MEMORY_OFF, 503);
    if (!Uuid.safeParse(id).success) throw new AppError(MEMORY_GONE, 404);
    const { text } = z.object({ text: MemoryText }).parse(input);
    const fixed = await backend.memories.update(owner, id, text);
    if (!fixed) throw new AppError(MEMORY_GONE, 404);
    await this.record(backend, owner, "you", "fixed-memory", [fixed.sourceId]);
  }

  async forgetMemory(owner: string, id: string): Promise<void> {
    const backend = this.ready(owner);
    if (!backend.memories) throw new AppError(MEMORY_OFF, 503);
    if (!Uuid.safeParse(id).success) throw new AppError(MEMORY_GONE, 404);
    const forgotten = await backend.memories.forget(owner, id);
    if (!forgotten) throw new AppError(MEMORY_GONE, 404);
    await this.record(backend, owner, "you", "forgot-memory", [forgotten.sourceId]);
  }

  // ---- Activity ----

  async listActivity(owner: string): Promise<ActivityView[]> {
    const backend = this.ready(owner);
    const items: ActivityItem[] = await backend.activity.list(owner, 200);
    return items.map((i) => ({
      id: i.id,
      actor: i.actor,
      action: i.action,
      sourceIds: i.sourceIds,
      createdAt: i.createdAt.toISOString(),
    }));
  }
}

export function outcomeView(outcome: AskOutcome): AskAnswer {
  if (outcome.status === "unknown") return { status: "unknown", message: UNKNOWN_MESSAGE };
  return outcome;
}
