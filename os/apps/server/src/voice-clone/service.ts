// Voice notes and call recordings of a custom person: who said what, keeping
// only the chosen person's words, and an optional voice copy for calls.
//
// The flow, and the rules that go with it:
//   1. Upload. Only after the person ticks the consent box; the server records
//      the tick with its exact words. The file goes to the private bucket under
//      a temporary folder, persona-uploads/<owner>/. Nothing a person sends can
//      name an object key.
//   2. Speaker separation, in the background (Workers AI, Deepgram Nova-3).
//   3. The person labels each voice: "Me", the custom person, or "Someone else".
//   4. Only the custom person's lines are kept, with private details taken out.
//      Every other voice's words are thrown away.
//   5. Optional voice copy, after a second, stronger consent tick: their
//      stretches are cut into one 10 to 30 second clip and sent to Cartesia.
//   6. The recording is deleted from the bucket at the end, whether it worked
//      or not. A sweep deletes anything older than 24 hours.
//
// Never log words, file names, keys or audio. Ids and counts only.
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import type { Store } from "../db.ts";
import type { AudioTools } from "../debo/audio.ts";
import { cleanMimeType, extensionFor, PART_BYTES, SINGLE_UPLOAD_MAX_BYTES, UPLOAD_LINK_SECONDS } from "../debo/media-limits.ts";
import type { ObjectStore } from "../debo/object-store.ts";
import { AppError } from "../errors.ts";
import { CartesiaError, CLONE_LANGUAGES, cloneVoice, deleteVoice } from "./cartesia.ts";
import { CANT_CUT, cutClip, cutFormat } from "./decode.ts";
import { type Diarizer, summariseSpeakers, type Utterance } from "./diarize.ts";
import type { CustomPeopleGlue, SpokenLine } from "./glue.ts";
import { isEmptyAfterScrub, scrubLine } from "./scrub.ts";
import { pickClipRanges, writeWav } from "./wav.ts";

// ---- Words the person agrees to. Saved with each tick, so the record shows exactly what was said. ----

export const AUDIO_CONSENT =
  "I'm allowed to use these recordings, and it's for my own private use. I understand Debo will separate the voices, keep only this person's words, and delete the recordings.";
export const VOICE_COPY_CONSENT =
  "I have this person's permission to copy their voice, or I'm close family and they have died. They are not a public figure, actor or character. The copied voice is only for my own calls in Debo.";

// ---- Limits ----

export const AUDIO_MAX_BYTES = 100 * 1024 * 1024;
export const AUDIO_MAX_MINUTES = 60;
/** Uploads waiting to be labelled at once, per person. */
export const OPEN_UPLOADS_MAX = 5;
export const UPLOADS_PER_DAY = 20;
/** Raw recordings left over are deleted after this long. */
export const RAW_AUDIO_TTL_MS = 24 * 3_600_000;
const SAMPLE_LINK_SECONDS = 15 * 60;
const LINE_MAX_CHARS = 300;
const LINES_PER_UPLOAD = 300;

const UPLOADS = "voice-uploads";
const CLONES = "voice-clones";
const CONSENTS = "voice-consents";

export const NOT_SET_UP =
  "Adding voice notes and calls is not set up yet. Whoever runs this Debo needs to turn on recordings and speaker separation.";
export const NEEDS_KEY =
  "A voice copy needs a Cartesia key. Add your own in Settings, under Advanced: use your own keys. Their words from these recordings are still used.";
const GONE = "I couldn't find that recording. It may have been finished or deleted already.";
const NO_PERSON = "I couldn't find that person. They may have been deleted.";

const FAILURES: Record<string, string> = {
  engine: "The speaker service did not answer. Add the recording again in a moment.",
  unreadable: "I couldn't hear any sound in this recording. Try another file.",
  "too-long": `This recording is longer than ${AUDIO_MAX_MINUTES} minutes. Try a shorter one.`,
  "no-speech": "I couldn't hear anyone talking in this recording. Try another file.",
};

// ---- Records ----

export type UploadStatus = "uploading" | "waiting" | "working" | "ready" | "failed";

export interface VoiceUpload {
  id: string;
  personId: string;
  objectKey: string;
  mimeType: string;
  sizeBytes: number;
  uploadId: string | null;
  /** "voice-note" or "call", from the file the person picked. Only for the line's source. */
  source: "voice-note" | "call";
  status: UploadStatus;
  error?: string;
  createdAt: string;
  consentId: string;
  language?: string | null;
  /** Every voice's words, held only until the person labels them. */
  utterances?: Utterance[];
  speakers?: ReturnType<typeof summariseSpeakers>;
}

export interface VoiceClone {
  /** The custom person's id: one copy per person. */
  id: string;
  personId: string;
  cartesiaVoiceId: string;
  /** Whose Cartesia account holds it: the person's own key, or Debo's. */
  keySource: "own" | "debo";
  language: (typeof CLONE_LANGUAGES)[number];
  consentId: string;
  createdAt: string;
}

interface ConsentRow {
  id: string;
  personId: string;
  kind: "audio" | "voice-copy";
  wording: string;
  at: string;
}

export type VoiceCopyResult =
  | { status: "copied"; createdAt: string }
  | { status: "needs-key" | "cant-cut" | "too-short" | "failed"; message: string };

export interface CallVoice {
  voiceId: string;
  apiKey: string;
  personName: string;
  language: string;
}

export interface VoiceCopyDeps {
  db: Store;
  /** The private bucket recordings use. Undefined: not set up. */
  store: () => ObjectStore | undefined;
  /** ffmpeg, to make the small mp3 the speaker service takes. */
  audio: AudioTools;
  diarizer?: Diarizer;
  glue: CustomPeopleGlue;
  /** The person's own Cartesia key (own-keys), if set. Server only. */
  ownCartesiaKey: (owner: string) => Promise<string | undefined>;
  /** CARTESIA_API_KEY, if the owner of this Debo set one. */
  deboCartesiaKey?: string;
  fetchImpl?: typeof fetch;
  /** Run work after the answer is sent. */
  later?: (work: Promise<void>) => void;
  log?: (entry: Record<string, unknown>) => void;
  now?: () => number;
}

const StartInput = z.object({
  consent: z.literal(true, "Tick the box to say you're allowed to use these recordings first."),
  mimeType: z.string().min(1).max(100),
  sizeBytes: z.number().int().min(1, "That file is empty.").max(AUDIO_MAX_BYTES, "That recording is too big. Keep it under 100 MB."),
  kind: z.enum(["voice-note", "call"]).default("voice-note"),
});
const DoneInput = z.object({
  parts: z.array(z.object({ number: z.number().int().min(1), etag: z.string().min(1).max(200) })).max(10_000).optional(),
});
const LabelInput = z.object({
  labels: z.record(z.string().regex(/^\d{1,3}$/), z.enum(["me", "them", "other"])),
  copyVoice: z
    .object({
      consent: z.literal(true, "Tick the box about their permission first."),
      language: z.enum(CLONE_LANGUAGES).optional(),
    })
    .optional(),
});
const Uuid = z.string().uuid();

/** Read a request body, or say plainly what is wrong with it (422). */
function valid<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new AppError(parsed.error.issues.map((i) => i.message).join("; "), 422);
  return parsed.data;
}

/** Counts hits in a window per owner. Resets when the server restarts. */
function counter(windowMs: number, max: number) {
  const hits = new Map<string, { n: number; until: number }>();
  return (owner: string, now: number) => {
    const entry = hits.get(owner);
    if (!entry || entry.until <= now) {
      hits.set(owner, { n: 1, until: now + windowMs });
      return true;
    }
    entry.n += 1;
    return entry.n <= max;
  };
}

export class VoiceCopyService {
  private readonly perDay = counter(24 * 3_600_000, UPLOADS_PER_DAY);
  private readonly now: () => number;

  constructor(private readonly deps: VoiceCopyDeps) {
    this.now = deps.now ?? Date.now;
  }

  get available() {
    return Boolean(this.deps.store() && this.deps.diarizer);
  }

  // ---- Upload ----

  async startUpload(owner: string, personId: string, input: unknown) {
    const store = this.ready();
    await this.personOf(owner, personId);
    const body = valid(StartInput, input);
    const mimeType = cleanMimeType(body.mimeType);
    if (!mimeType)
      throw new AppError("I can't use that kind of file. Pick a voice note or call recording, such as .opus, .mp3, .wav or .m4a.", 422);
    const open = (await this.deps.db.list<VoiceUpload>(owner, UPLOADS)).filter((u) => u.status !== "failed");
    if (open.length >= OPEN_UPLOADS_MAX)
      throw new AppError("You have recordings waiting for you to say who is talking. Finish or remove those first.", 429);
    if (!this.perDay(owner, this.now()))
      throw new AppError("You have added a lot of recordings today. You can add more tomorrow.", 429);

    const consentId = await this.consent(owner, personId, "audio", AUDIO_CONSENT);
    const id = randomUUID();
    const objectKey = `persona-uploads/${owner}/${id}.${extensionFor(mimeType)}`;
    const plan = await store.beginUpload({
      key: objectKey,
      mimeType,
      size: body.sizeBytes,
      singleMaxBytes: SINGLE_UPLOAD_MAX_BYTES,
      partBytes: PART_BYTES,
      expiresSeconds: UPLOAD_LINK_SECONDS,
    });
    await this.deps.db.put<VoiceUpload>(owner, UPLOADS, {
      id,
      personId,
      objectKey,
      mimeType,
      sizeBytes: body.sizeBytes,
      uploadId: plan.mode === "multipart" ? plan.uploadId : null,
      source: body.kind,
      status: "uploading",
      createdAt: new Date(this.now()).toISOString(),
      consentId,
    });
    this.log("voice-upload.started", { owner, personId, uploadId: id });
    return { uploadId: id, upload: plan };
  }

  async completeUpload(owner: string, personId: string, uploadId: string, input: unknown) {
    const store = this.ready();
    const record = await this.uploadOf(owner, personId, uploadId);
    if (record.status !== "uploading") return this.view(record);
    const body = valid(DoneInput, input ?? {});
    try {
      if (record.uploadId) {
        const expected = Math.ceil(record.sizeBytes / PART_BYTES);
        const parts = body.parts ?? [];
        if (parts.length !== expected || new Set(parts.map((p) => p.number)).size !== expected)
          throw new AppError("The upload is not complete yet. Try again.", 409);
        await store.finishUpload(record.objectKey, record.uploadId, parts);
      }
      const head = await store.head(record.objectKey);
      if (!head) throw new AppError("The recording did not arrive. Try adding it again.", 409);
      if (head.size !== record.sizeBytes) {
        await this.discardRecord(owner, record);
        throw new AppError("The recording did not arrive whole. Try adding it again.", 422);
      }
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError("I couldn't finish saving that recording. Try again in a moment.", 502);
    }
    const waiting = await this.deps.db.compareAndSwap<VoiceUpload>(owner, UPLOADS, uploadId, { status: "uploading" }, { status: "waiting" });
    if (waiting) this.background(this.analyse(owner, uploadId));
    return this.view(waiting ?? record);
  }

  // ---- Speaker separation ----

  /** Separate the voices. Never throws: a failure is saved, and the recording is deleted at once. */
  async analyse(owner: string, uploadId: string): Promise<void> {
    const claimed = await this.deps.db
      .compareAndSwap<VoiceUpload>(owner, UPLOADS, uploadId, { status: "waiting" }, { status: "working" })
      .catch(() => null);
    if (!claimed) return;
    const store = this.deps.store();
    const dir = await mkdtemp(join(tmpdir(), "debo-voice-"));
    try {
      if (!store || !this.deps.diarizer) throw new Error("not set up");
      const original = join(dir, "original");
      await store.download(claimed.objectKey, original);
      const { path, durationSeconds } = await this.deps.audio.prepare(original, dir);
      if (durationSeconds > AUDIO_MAX_MINUTES * 60 + 30) return await this.fail(owner, claimed, "too-long");
      const result = await this.deps.diarizer.diarize(new Uint8Array(await readFile(path)), "audio/mpeg");
      if (result.utterances.length === 0) return await this.fail(owner, claimed, "no-speech");
      const speakers = summariseSpeakers(result.utterances).map((s) => ({
        ...s,
        sampleLines: s.sampleLines.map(scrubLine).filter((line) => !isEmptyAfterScrub(line)),
      }));
      await this.deps.db.compareAndSwap(owner, UPLOADS, uploadId, { status: "working" }, {
        status: "ready",
        language: result.language,
        utterances: result.utterances,
        speakers,
      });
      this.log("voice-upload.separated", { owner, uploadId, speakers: speakers.length, lines: result.utterances.length });
    } catch (error) {
      const code = error instanceof Error && error.name === "AudioError" ? "unreadable" : "engine";
      this.log("voice-upload.failed", { owner, uploadId, reason: error instanceof Error ? error.name : "unknown" });
      await this.fail(owner, claimed, code).catch(() => {});
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }

  /** Save the failure for the screen, and delete the recording now: it will not be used. */
  private async fail(owner: string, record: VoiceUpload, code: string) {
    await this.deleteObject(record);
    await this.deps.db.put<VoiceUpload>(owner, UPLOADS, {
      ...record,
      status: "failed",
      error: code,
      utterances: undefined,
      speakers: undefined,
    });
  }

  // ---- What the app sees ----

  async status(owner: string, personId: string, uploadId: string) {
    const record = await this.uploadOf(owner, personId, uploadId);
    const view = this.view(record);
    // A short link to the recording, so each voice's sample can be played. Owner only.
    const store = this.deps.store();
    const sampleUrl =
      record.status === "ready" && store
        ? await store.signedGet(record.objectKey, record.mimeType, SAMPLE_LINK_SECONDS).catch(() => null)
        : null;
    return { ...view, sampleUrl };
  }

  async list(owner: string, personId: string) {
    await this.personOf(owner, personId);
    const rows = (await this.deps.db.list<VoiceUpload>(owner, UPLOADS)).filter((u) => u.personId === personId);
    return rows.map((r) => this.view(r));
  }

  view(record: VoiceUpload) {
    return {
      id: record.id,
      status: record.status,
      mimeType: record.mimeType,
      source: record.source,
      createdAt: record.createdAt,
      language: record.language ?? null,
      /** False for m4a, aac, webm and video: words only, no voice copy from this file. */
      canCopyVoice: cutFormat(record.mimeType) !== null,
      speakers: record.status === "ready" ? (record.speakers ?? []) : [],
      ...(record.status === "failed" ? { message: FAILURES[record.error ?? "engine"] ?? FAILURES.engine } : {}),
    };
  }

  // ---- Labels, kept lines and the voice copy ----

  /**
   * The person said who each voice is. Keep only the custom person's lines, make
   * the voice copy if asked, then delete the recording and every other voice's
   * words, whatever happened.
   */
  async label(owner: string, personId: string, uploadId: string, input: unknown) {
    const person = await this.personOf(owner, personId);
    const record = await this.uploadOf(owner, personId, uploadId);
    if (record.status !== "ready") throw new AppError("This recording is not ready yet. Wait a moment and try again.", 409);
    const body = valid(LabelInput, input);
    const known = new Set((record.speakers ?? []).map((s) => s.speaker));
    const theirs = new Set(Object.entries(body.labels).filter(([s, who]) => who === "them" && known.has(s)).map(([s]) => s));
    if (theirs.size === 0) throw new AppError(`Pick which voice is ${person.name} first.`, 422);
    // Claim it, so two taps never send the same clip twice.
    const claimed = await this.deps.db.compareAndSwap<VoiceUpload>(owner, UPLOADS, uploadId, { status: "ready" }, { status: "working" });
    if (!claimed) throw new AppError("This recording is already being finished.", 409);

    const mine = (claimed.utterances ?? []).filter((u) => theirs.has(u.speaker));
    let voiceCopy: VoiceCopyResult | undefined;
    let keptLines = 0;
    try {
      const lines = keepLines(mine, claimed.source);
      keptLines = lines.length;
      if (lines.length) await this.deps.glue.addSpokenLines(owner, personId, lines);
      if (body.copyVoice) voiceCopy = await this.copyVoice(owner, personId, claimed, mine, body.copyVoice.language);
    } finally {
      // The recording and every other voice's words go now, on success and on failure.
      await this.discardRecord(owner, claimed);
    }
    this.log("voice-upload.labelled", { owner, personId, uploadId, keptLines, copy: voiceCopy?.status ?? "no" });
    return {
      keptLines,
      discardedVoices: known.size - theirs.size,
      ...(voiceCopy ? { voiceCopy } : {}),
    };
  }

  private async copyVoice(
    owner: string,
    personId: string,
    record: VoiceUpload,
    theirs: Utterance[],
    language?: (typeof CLONE_LANGUAGES)[number],
  ): Promise<VoiceCopyResult> {
    const key = await this.keyToMake(owner);
    if (!key) return { status: "needs-key", message: NEEDS_KEY };
    const format = cutFormat(record.mimeType);
    if (!format) return { status: "cant-cut", message: CANT_CUT };
    const ranges = pickClipRanges(theirs);
    if (!ranges)
      return {
        status: "too-short",
        message: "There isn't enough of them talking in this recording for a voice copy. It needs at least 10 seconds. Try a longer one.",
      };
    const store = this.deps.store();
    if (!store) return { status: "failed", message: NOT_SET_UP };
    const dir = await mkdtemp(join(tmpdir(), "debo-voice-copy-"));
    try {
      const original = join(dir, "original");
      await store.download(record.objectKey, original);
      const clip = writeWav(await cutClip(new Uint8Array(await readFile(original)), format, ranges));
      const consentId = await this.consent(owner, personId, "voice-copy", VOICE_COPY_CONSENT);
      const lang = language ?? (record.language === "hi" ? "hi" : "en");
      const voiceId = await cloneVoice({
        apiKey: key.apiKey,
        clip,
        // A made-up label: the person's name never goes to Cartesia.
        name: `Debo voice ${personId.slice(0, 8)}`,
        language: lang,
        fetchImpl: this.deps.fetchImpl,
      });
      const previous = await this.deps.db.get<VoiceClone>(owner, CLONES, personId);
      const createdAt = new Date(this.now()).toISOString();
      await this.deps.db.put<VoiceClone>(owner, CLONES, {
        id: personId,
        personId,
        cartesiaVoiceId: voiceId,
        keySource: key.source,
        language: lang,
        consentId,
        createdAt,
      });
      // The new copy replaces the old one: delete the old one at Cartesia.
      if (previous && previous.cartesiaVoiceId !== voiceId) await this.deleteAtCartesia(owner, previous).catch(() => false);
      return { status: "copied", createdAt };
    } catch (error) {
      this.log("voice-copy.failed", { owner, personId, reason: error instanceof Error ? error.name : "unknown" });
      if (error instanceof CartesiaError) {
        const message =
          error.kind === "key"
            ? "Cartesia did not accept the key. Check it in Settings and try again. Their words were still saved."
            : error.kind === "busy"
              ? "Cartesia is busy right now. Add the recording again later to try the voice copy. Their words were still saved."
              : "Cartesia couldn't make a voice copy from this recording. Try a clearer one. Their words were still saved.";
        return { status: "failed", message };
      }
      return {
        status: "failed",
        message: "I couldn't cut a clean voice sample from this recording. Try another one. Their words were still saved.",
      };
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }

  /** "Remove this recording" before labelling: the file and every voice's words go. */
  async discard(owner: string, personId: string, uploadId: string) {
    const record = await this.uploadOf(owner, personId, uploadId);
    await this.discardRecord(owner, record);
  }

  // ---- The voice copy itself ----

  /** What the app shows about a person's voice copy. Never a key. */
  async voiceState(owner: string, personId: string) {
    await this.personOf(owner, personId);
    const clone = await this.deps.db.get<VoiceClone>(owner, CLONES, personId);
    const own = Boolean(await this.deps.ownCartesiaKey(owner));
    return {
      copied: Boolean(clone),
      ...(clone ? { createdAt: clone.createdAt, language: clone.language } : {}),
      // Whether a new voice copy could be made now, and on whose account.
      key: own ? ("own" as const) : this.deps.deboCartesiaKey ? ("debo" as const) : ("none" as const),
      ...(own || this.deps.deboCartesiaKey ? {} : { message: NEEDS_KEY }),
      consentText: VOICE_COPY_CONSENT,
      audioConsentText: AUDIO_CONSENT,
    };
  }

  /** "Remove voice copy": delete it at Cartesia, then here. */
  async removeVoice(owner: string, personId: string) {
    await this.personOf(owner, personId);
    const clone = await this.deps.db.get<VoiceClone>(owner, CLONES, personId);
    if (!clone) return { removed: false };
    const deleted = await this.deleteAtCartesia(owner, clone);
    await this.deps.db.remove(owner, CLONES, personId);
    return deleted
      ? { removed: true }
      : {
          removed: true,
          message:
            "I removed the voice copy from Debo, but couldn't reach Cartesia to delete it there, because its key is gone. If you used your own key, delete the voice in your Cartesia account.",
        };
  }

  /**
   * Everything voice-related for one custom person: the voice copy (at Cartesia
   * too), their uploads, their kept lines and the consent ticks. For the custom
   * person's delete path (Workstream A calls this).
   */
  async deleteForPerson(owner: string, personId: string): Promise<void> {
    const clone = await this.deps.db.get<VoiceClone>(owner, CLONES, personId);
    if (clone) {
      await this.deleteAtCartesia(owner, clone);
      await this.deps.db.remove(owner, CLONES, personId);
    }
    for (const u of await this.deps.db.list<VoiceUpload>(owner, UPLOADS))
      if (u.personId === personId) await this.discardRecord(owner, u);
    for (const c of await this.deps.db.list<ConsentRow>(owner, CONSENTS))
      if (c.personId === personId) await this.deps.db.remove(owner, CONSENTS, c.id);
    await this.deps.glue.forgetSpokenLines(owner, personId);
  }

  /**
   * Account deletion: every voice copy at Cartesia, every upload and the whole
   * temporary folder. Runs before own keys are removed, so the person's own
   * Cartesia key can still delete what it made. Returns how many voice copies
   * Cartesia did not confirm (they are still removed here).
   */
  async removeAll(owner: string): Promise<{ voiceCopiesRemoved: number; notConfirmedAtCartesia: number }> {
    let notConfirmed = 0;
    const clones = await this.deps.db.list<VoiceClone>(owner, CLONES);
    for (const clone of clones) {
      if (!(await this.deleteAtCartesia(owner, clone).catch(() => false))) notConfirmed += 1;
      await this.deps.db.remove(owner, CLONES, clone.id);
    }
    for (const u of await this.deps.db.list<VoiceUpload>(owner, UPLOADS)) await this.discardRecord(owner, u);
    await this.deps.store()?.deletePrefix(`persona-uploads/${owner}/`);
    return { voiceCopiesRemoved: clones.length, notConfirmedAtCartesia: notConfirmed };
  }

  /**
   * For the voice agent only (over its secret channel): the copied voice of the
   * custom person Debo is talking as, with the key to speak it. Null otherwise.
   * Never sent to the app.
   */
  async callVoice(owner: string): Promise<CallVoice | null> {
    const personId = await this.deps.glue.activePersonId(owner).catch(() => null);
    if (!personId) return null;
    const clone = await this.deps.db.get<VoiceClone>(owner, CLONES, personId);
    if (!clone) return null;
    const person = await this.deps.glue.person(owner, personId);
    if (!person) return null;
    const apiKey = await this.keyFor(owner, clone.keySource);
    if (!apiKey) return null;
    return { voiceId: clone.cartesiaVoiceId, apiKey, personName: person.name, language: clone.language };
  }

  // ---- Keeping house ----

  private sweeper?: ReturnType<typeof setInterval>;

  /** Run the sweep now and every 15 minutes. */
  startBackground(everyMs = 15 * 60_000) {
    if (this.sweeper || !this.deps.store()) return;
    void this.sweep();
    this.sweeper = setInterval(() => void this.sweep(), everyMs);
    this.sweeper.unref?.();
  }

  stopBackground() {
    if (this.sweeper) clearInterval(this.sweeper);
    this.sweeper = undefined;
  }

  /** Delete recordings older than 24 hours, and pick up separations a stopped server left. Never throws. */
  async sweep(): Promise<number> {
    let removed = 0;
    try {
      const cutoff = this.now() - RAW_AUDIO_TTL_MS;
      for (const { owner, value } of await this.deps.db.scan<VoiceUpload>(UPLOADS)) {
        if (Date.parse(value.createdAt) < cutoff) {
          await this.discardRecord(owner, value).catch(() => {});
          removed += 1;
        } else if (value.status === "waiting") this.background(this.analyse(owner, value.id));
      }
    } catch (error) {
      this.log("voice-upload.sweep-failed", { reason: error instanceof Error ? error.name : "unknown" });
    }
    return removed;
  }

  // ---- Helpers ----

  private ready(): ObjectStore {
    const store = this.deps.store();
    if (!store || !this.deps.diarizer) throw new AppError(NOT_SET_UP, 503);
    return store;
  }

  private async personOf(owner: string, personId: string) {
    if (!Uuid.safeParse(personId).success) throw new AppError(NO_PERSON, 404);
    const person = await this.deps.glue.person(owner, personId);
    if (!person) throw new AppError(NO_PERSON, 404);
    return person;
  }

  private async uploadOf(owner: string, personId: string, uploadId: string): Promise<VoiceUpload> {
    if (!Uuid.safeParse(uploadId).success) throw new AppError(GONE, 404);
    const record = await this.deps.db.get<VoiceUpload>(owner, UPLOADS, uploadId);
    if (!record || record.personId !== personId) throw new AppError(GONE, 404);
    return record;
  }

  private async consent(owner: string, personId: string, kind: ConsentRow["kind"], wording: string) {
    const id = randomUUID();
    await this.deps.db.put<ConsentRow>(owner, CONSENTS, { id, personId, kind, wording, at: new Date(this.now()).toISOString() });
    return id;
  }

  /** The recording out of the bucket, then its record (with every voice's words) out of the database. */
  private async discardRecord(owner: string, record: VoiceUpload) {
    await this.deleteObject(record);
    await this.deps.db.remove(owner, UPLOADS, record.id);
  }

  private async deleteObject(record: VoiceUpload) {
    const store = this.deps.store();
    if (!store) return;
    if (record.uploadId) await store.abortUpload(record.objectKey, record.uploadId);
    await store.delete(record.objectKey);
  }

  /** Which key makes a new voice copy: the person's own first, else Debo's. */
  private async keyToMake(owner: string): Promise<{ apiKey: string; source: VoiceClone["keySource"] } | undefined> {
    const own = await this.deps.ownCartesiaKey(owner);
    if (own) return { apiKey: own, source: "own" };
    if (this.deps.deboCartesiaKey) return { apiKey: this.deps.deboCartesiaKey, source: "debo" };
    return undefined;
  }

  /** The key for the account that holds a voice copy. */
  private async keyFor(owner: string, source: VoiceClone["keySource"]) {
    return source === "own" ? this.deps.ownCartesiaKey(owner) : this.deps.deboCartesiaKey;
  }

  /** True when Cartesia confirmed the delete. False when no key for that account is left. Throws when Cartesia fails. */
  private async deleteAtCartesia(owner: string, clone: VoiceClone): Promise<boolean> {
    const apiKey = await this.keyFor(owner, clone.keySource);
    if (!apiKey) {
      this.log("voice-copy.delete-no-key", { owner, personId: clone.personId });
      return false;
    }
    try {
      await deleteVoice({ apiKey, voiceId: clone.cartesiaVoiceId, fetchImpl: this.deps.fetchImpl });
      this.log("voice-copy.deleted", { owner, personId: clone.personId });
      return true;
    } catch {
      throw new AppError("I couldn't reach Cartesia to delete the voice copy. Nothing was deleted. Try again in a moment.", 502);
    }
  }

  private background(work: Promise<void>) {
    if (this.deps.later) this.deps.later(work);
    else void work;
  }

  private log(event: string, fields: Record<string, unknown>) {
    (this.deps.log ?? ((entry) => console.info("[Debo]", JSON.stringify(entry))))({ event, ...fields });
  }
}

/** The custom person's own lines: private details out, empty ones and repeats dropped, capped. */
export function keepLines(utterances: Utterance[], source: VoiceUpload["source"]): SpokenLine[] {
  const label = source === "call" ? "from a call recording" : "from a voice note";
  const seen = new Set<string>();
  const out: SpokenLine[] = [];
  for (const u of utterances) {
    const text = scrubLine(u.text).slice(0, LINE_MAX_CHARS);
    if (isEmptyAfterScrub(text)) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ text, source: label });
    if (out.length >= LINES_PER_UPLOAD) break;
  }
  return out;
}
