// Custom people: the records, the upload sessions, and reading the files in the background.
//
// Reading runs in steps the app shows (see STEP_LABELS):
//   1. the chat is unzipped (fflate) and read (whatsapp.ts), and the app shows who wrote;
//   2. the person picks which sender is "them"; only the last 5,000 messages are read;
//   3. private details are scrubbed out before any model sees the text (scrub.ts);
//   4. each photo gets one short description (no face recognition);
//   5. each video's sound is written out by Whisper;
//   6. one model call builds the profile; only the chosen sender's own lines become examples;
//   7. the raw files are deleted from the bucket, on success and on failure.
// Model calls use the person's own Anthropic key if they set one, otherwise Daksha's.
// Never log names, messages, transcripts or photo descriptions. Ids and counts only.
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import type { Store } from "../db.ts";
import type { AudioTools } from "../debo/audio.ts";
import { PART_BYTES, SINGLE_UPLOAD_MAX_BYTES, UPLOAD_LINK_SECONDS } from "../debo/media-limits.ts";
import type { ObjectStore } from "../debo/object-store.ts";
import { mergePieces, planChunks, type Transcriber, type TranscriptPiece } from "../debo/transcriber.ts";
import { AppError } from "../errors.ts";
import { PersonaStore } from "../persona.ts";
import { buildProfile, type PersonModel } from "./profile.ts";
import { type CustomPerson, CustomPeopleStore, MAX_EXAMPLES, MAX_FACTS, MAX_SPOKEN_LINES, PEOPLE_KIND } from "./store.ts";
import {
  deleteSessionFiles,
  ownerPrefix,
  SourcesDone,
  type StepId,
  type StepState,
  startSession,
  sessionView,
  sweepUploads,
  UPLOADS_KIND,
  type UploadSession,
} from "./uploads.ts";
import { chatTextFrom, lastMessages, parseWhatsApp } from "./whatsapp.ts";

/** Only this much of each video is listened to. */
export const VIDEO_MAX_SECONDS = 15 * 60;
/** Only the last this-many messages of a chat are read. */
export const CHAT_MESSAGES_READ = 5000;

export interface CustomPeopleDeps {
  db: Store;
  /** The private media bucket. A function: it is known only once the journal is set up. */
  store: () => ObjectStore | undefined;
  /** The model for one person (their own key, or Daksha's). Undefined when none is set up. */
  model: (owner: string) => Promise<PersonModel | undefined>;
  transcriber?: () => Transcriber | undefined;
  audio?: () => AudioTools | undefined;
  /** Runs background work (tests wait for it). */
  later?: (work: Promise<void>) => void;
  /** Smaller sizes let tests try multipart with small files. */
  singleMaxBytes?: number;
  partBytes?: number;
  now?: () => Date;
  /**
   * Called before one person is deleted, for anything kept elsewhere about them: their voice
   * recordings and a copied voice at the voice provider (VoiceCopyService.deleteForPerson).
   * A failure stops the delete, so nothing is left unseen. Account deletion does not call
   * this: the account route asks the voice copy service to remove everything at once.
   */
  beforeRemove?: (owner: string, person: CustomPerson) => Promise<void>;
  /** Other raw uploads under `persona-uploads/` (voice recordings), swept in the same upkeep run. */
  sweepAlso?: () => Promise<number>;
}

/** One line a person really said, from a voice note or call recording. */
export interface SpokenLine {
  text: string;
  /** "from a voice note" or "from a call recording". */
  source: string;
}

const Sender = z.object({ sender: z.string().trim().min(1).max(80) });
const NOT_SET_UP = "Building people from your files is not set up on this Daksha yet. You can still describe them in words.";
const GONE = "I couldn't find that person. They may have been deleted.";

const fail = (message: string) => Object.assign(new Error(message), { name: "ReadError" });

export class CustomPeopleService {
  readonly people: CustomPeopleStore;
  readonly db: Store;
  private readonly running = new Set<string>();

  constructor(private readonly deps: CustomPeopleDeps) {
    this.db = deps.db;
    this.people = new CustomPeopleStore(deps.db);
  }

  private now() {
    return this.deps.now?.() ?? new Date();
  }

  private later(work: Promise<void>) {
    const safe = work.catch((error) =>
      console.error("custom person reading failed", { reason: error instanceof Error ? error.name : "unknown" }),
    );
    if (this.deps.later) this.deps.later(safe);
  }

  /** Whether files can be uploaded for this person at all. */
  async canRead(owner: string) {
    return Boolean(this.deps.store() && (await this.deps.model(owner).catch(() => undefined)));
  }

  private async person(owner: string, id: string) {
    const person = await this.people.get(owner, id);
    if (!person) throw new AppError(GONE, 404);
    return person;
  }

  // ---- Records ----

  /** Delete a person: their uploads and raw files first, then anything kept elsewhere, then the row. */
  async remove(owner: string, id: string) {
    const person = await this.person(owner, id);
    const store = this.deps.store();
    for (const session of await this.sessionsFor(owner, id)) {
      if (store && !session.filesDeleted) await deleteSessionFiles(store, owner, session);
      await this.deps.db.remove(owner, UPLOADS_KIND, session.id);
    }
    await this.deps.beforeRemove?.(owner, person);
    // If they were the one Daksha was talking as, Daksha goes back to being herself.
    const personas = new PersonaStore(this.deps.db);
    if ((await personas.get(owner))?.customPersonId === id) await personas.clear(owner);
    await this.people.remove(owner, id);
  }

  /**
   * Account deletion: every raw file under the person's upload folder. Copied voices are not
   * deleted here: the account route has the voice copy service remove them all first, once.
   * The profiles are records and go with the rest of the account's records.
   */
  async removeAll(owner: string): Promise<number> {
    const store = this.deps.store();
    return store ? store.deletePrefix(ownerPrefix(owner)) : 0;
  }

  // ---- Voice notes and call recordings (voice-clone/) ----

  /**
   * Keep lines this person really said (the voice copy service has thrown away every other
   * voice and scrubbed them). They are saved on the person at once, then the profile is built
   * again in the background with them as the person's own lines.
   */
  async addSpokenLines(owner: string, id: string, lines: SpokenLine[]): Promise<void> {
    const person = await this.person(owner, id);
    const seen = new Set<string>();
    const merged = [...lines, ...(person.spokenLines ?? [])].filter((l) => {
      const key = l.text.toLocaleLowerCase();
      if (!l.text.trim() || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    await this.people.saveProfile(owner, id, { spokenLines: merged.slice(0, MAX_SPOKEN_LINES) });
    this.later(this.rebuildWithSpoken(owner, id));
  }

  /** Their spoken lines are no longer wanted. The profile keeps what it already learned. */
  async forgetSpokenLines(owner: string, id: string): Promise<void> {
    const person = await this.people.get(owner, id).catch(() => null);
    if (person?.spokenLines) await this.people.saveProfile(owner, id, { spokenLines: [] });
  }

  /** A voice copy was made (true) or removed (false). Only whether one exists is kept here. */
  async markVoiceCopy(owner: string, id: string, copied: boolean): Promise<void> {
    const person = await this.people.get(owner, id).catch(() => null);
    if (!person) return;
    if (copied) await this.people.saveProfile(owner, id, { voiceCloneId: id });
    else if (person.voiceCloneId) {
      const next: CustomPerson = { ...person, updatedAt: this.now().toISOString() };
      delete next.voiceCloneId;
      await this.db.put<CustomPerson>(owner, PEOPLE_KIND, next);
    }
  }

  /**
   * Build the profile again from the lines already known to be theirs: the example lines kept
   * from earlier uploads and every spoken line. Facts from earlier uploads stay; facts from voice
   * are replaced. With no model set up, the newest spoken lines become example lines as they are.
   */
  async rebuildWithSpoken(owner: string, id: string): Promise<void> {
    const person = await this.people.get(owner, id);
    if (!person?.spokenLines?.length) return;
    const spoken = person.spokenLines.map((l) => l.text);
    const model = await this.deps.model(owner).catch(() => undefined);
    if (!model) {
      const examples = [...new Set([...person.examples, ...spoken.filter((l) => l.length <= 240)])].slice(0, MAX_EXAMPLES);
      await this.people.saveProfile(owner, id, { examples, builtFrom: builtFromWithVoice(person, this.now()) });
      return;
    }
    const { profile } = await buildProfile(model, { person, spokenLines: [...person.examples, ...spoken] });
    const kept = person.facts.filter((f) => f.source !== "voice");
    const known = new Set(kept.map((f) => f.text.toLocaleLowerCase()));
    const fromVoice = profile.facts
      .filter((f) => !known.has(f.text.toLocaleLowerCase()))
      .map((f) => ({ ...f, source: "voice" as const }));
    await this.people.saveProfile(owner, id, {
      styleSummary: profile.styleSummary || person.styleSummary,
      examples: profile.examples.length ? profile.examples : person.examples,
      nicknames: profile.nicknames.length ? profile.nicknames : person.nicknames,
      languages: profile.languages.length ? profile.languages : person.languages,
      facts: [...kept, ...fromVoice].slice(0, MAX_FACTS),
      builtFrom: builtFromWithVoice(person, this.now()),
    });
  }

  /** Make this custom person the one Daksha talks as, in chat and on calls. */
  async talkAs(owner: string, id: string) {
    const person = await this.person(owner, id);
    await new PersonaStore(this.deps.db).setCustom(owner, person);
    return person;
  }

  // ---- Uploads ----

  private async sessionsFor(owner: string, personId: string) {
    return (await this.deps.db.list<UploadSession>(owner, UPLOADS_KIND)).filter((s) => s.personId === personId);
  }

  private async session(owner: string, personId: string, uploadId: string) {
    const session = await this.deps.db.get<UploadSession>(owner, UPLOADS_KIND, uploadId).catch(() => null);
    if (!session || session.personId !== personId) throw new AppError("I couldn't find that upload. Try adding the files again.", 404);
    return session;
  }

  /** Step 0: the consent tick and the upload links. */
  async startSources(owner: string, personId: string, input: unknown) {
    await this.person(owner, personId);
    const store = this.deps.store();
    if (!store || !(await this.deps.model(owner).catch(() => undefined))) throw new AppError(NOT_SET_UP, 503);
    const running = (await this.sessionsFor(owner, personId)).find((s) => !["done", "failed"].includes(s.status));
    if (running) throw new AppError("I'm still working on the last files for this person. Wait for that to finish first.", 409);
    const { session, uploads } = await startSession(this.deps.db, store, owner, personId, input, {
      singleMaxBytes: this.deps.singleMaxBytes ?? SINGLE_UPLOAD_MAX_BYTES,
      partBytes: this.deps.partBytes ?? PART_BYTES,
      expiresSeconds: UPLOAD_LINK_SECONDS,
      now: this.now(),
    });
    return { upload: sessionView(session), files: uploads };
  }

  /** The files are up: check each arrived whole, then start reading in the background. */
  async completeSources(owner: string, personId: string, uploadId: string, input: unknown) {
    const session = await this.session(owner, personId, uploadId);
    if (session.status !== "uploading") return { upload: sessionView(session) };
    const store = this.deps.store();
    if (!store) throw new AppError(NOT_SET_UP, 503);
    const body = SourcesDone.parse(input ?? {});
    const parts = new Map(body.files.map((f) => [f.id, f.parts]));
    const partBytes = this.deps.partBytes ?? PART_BYTES;
    try {
      for (const file of session.files) {
        if (file.uploadId) {
          const sent = parts.get(file.id) ?? [];
          const expected = Math.ceil(file.sizeBytes / partBytes);
          if (sent.length !== expected || new Set(sent.map((p) => p.number)).size !== expected)
            throw new AppError("Some files have not finished sending yet. Try again.", 409);
          await store.finishUpload(file.objectKey, file.uploadId, sent);
          file.uploadId = null;
        }
        const head = await store.head(file.objectKey);
        if (!head) throw new AppError("A file did not arrive. Try adding the files again.", 409);
        if (head.size !== file.sizeBytes) throw new AppError("A file did not arrive whole. Try adding the files again.", 422);
      }
    } catch (error) {
      // A broken upload is not kept: the files go now, and the session says why.
      await this.finish(owner, { ...session }, "failed", error instanceof AppError ? error.message : "I couldn't finish saving those files. Try again.");
      throw error instanceof AppError ? error : new AppError("I couldn't finish saving those files. Try again in a moment.", 502);
    }
    const queued = await this.save(owner, { ...session, status: "queued" }, { upload: "done" });
    this.later(this.read(owner, queued.id));
    return { upload: sessionView(queued) };
  }

  /** The person picked which sender in the chat is "them". Reading carries on. */
  async chooseSender(owner: string, personId: string, uploadId: string, input: unknown) {
    const { sender } = Sender.parse(input);
    const session = await this.session(owner, personId, uploadId);
    if (session.status !== "needs-sender") throw new AppError("This upload is not waiting for a pick any more.", 409);
    if (!session.senders?.some((s) => s.name === sender)) throw new AppError("Pick one of the names from the chat.", 422);
    const claimed = await this.deps.db.compareAndSwap<UploadSession>(owner, UPLOADS_KIND, uploadId, { status: "needs-sender" }, { status: "building", sender });
    if (!claimed) throw new AppError("This upload is not waiting for a pick any more.", 409);
    const saved = await this.save(owner, claimed, { sender: "done" });
    this.later(this.build(owner, uploadId));
    return { upload: sessionView(saved) };
  }

  /** The newest upload for this person, for the progress steps. */
  async status(owner: string, personId: string) {
    await this.person(owner, personId);
    const sessions = (await this.sessionsFor(owner, personId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return { upload: sessions[0] ? sessionView(sessions[0]) : null };
  }

  // ---- Reading, in the background ----

  private async save(owner: string, session: UploadSession, steps: Partial<Record<StepId, StepState>> = {}, detail?: { id: StepId; text: string }) {
    const next: UploadSession = {
      ...session,
      steps: session.steps.map((s) => {
        const state = steps[s.id];
        const withState = state ? { ...s, state } : s;
        return detail?.id === s.id ? { ...withState, detail: detail.text } : withState;
      }),
      updatedAt: this.now().toISOString(),
    };
    return this.deps.db.put(owner, UPLOADS_KIND, next);
  }

  /** End a session: the raw files are deleted either way. */
  private async finish(owner: string, session: UploadSession, status: "done" | "failed", error?: string) {
    // A step that was running ends with the session; steps that never ran are skipped.
    const ended: Partial<Record<StepId, StepState>> = {};
    for (const s of session.steps) {
      if (s.id === "cleanup") continue;
      if (s.state === "working") ended[s.id] = status === "failed" ? "failed" : "done";
      else if (s.state === "waiting") ended[s.id] = "skipped";
    }
    // The session says done or failed only once the files are gone (or deleting them failed).
    let current = await this.save(owner, { ...session, ...(error ? { error } : {}) }, { ...ended, cleanup: "working" });
    let cleanup: StepState = "done";
    const store = this.deps.store();
    try {
      if (!store) throw new Error("no bucket");
      await deleteSessionFiles(store, owner, current);
      current = { ...current, filesDeleted: true };
    } catch (e) {
      // The sweep tries again; the files never stay past 24 hours.
      console.error("custom person upload cleanup failed", { owner, session: session.id, reason: e instanceof Error ? e.name : "unknown" });
      cleanup = "failed";
    }
    return this.save(owner, { ...current, status }, { cleanup });
  }

  private async download(store: ObjectStore, key: string, dir: string, name: string) {
    const path = join(dir, name);
    await store.download(key, path);
    return path;
  }

  /** The chat text from a .txt or a WhatsApp .zip. */
  private async chatText(store: ObjectStore, session: UploadSession, dir: string): Promise<string | null> {
    const file = session.files.find((f) => f.kind === "chat");
    if (!file) return null;
    const bytes = new Uint8Array(await readFile(await this.download(store, file.objectKey, dir, "chat")));
    return chatTextFrom(bytes);
  }

  /** Step 1: read the chat and list who wrote. Stops to let the person pick, or goes on to build. */
  async read(owner: string, uploadId: string): Promise<void> {
    const claimed = await this.deps.db.compareAndSwap<UploadSession>(owner, UPLOADS_KIND, uploadId, { status: "queued" }, { status: "reading" });
    if (!claimed) return;
    if (!claimed.files.some((f) => f.kind === "chat")) {
      const building = await this.save(owner, { ...claimed, status: "building" });
      return this.build(owner, building.id);
    }
    const store = this.deps.store();
    const dir = await mkdtemp(join(tmpdir(), "debo-persona-"));
    let session = await this.save(owner, claimed, { chat: "working" });
    try {
      if (!store) throw fail(NOT_SET_UP);
      const text = await this.chatText(store, session, dir);
      const chat = parseWhatsApp(text ?? "");
      if (chat.senders.length === 0)
        throw fail("I couldn't find any messages in that chat file. Export it again from WhatsApp (\"Without media\" is fine) and add the .zip or .txt.");
      session = await this.save(
        owner,
        { ...session, status: "needs-sender", senders: chat.senders.slice(0, 20) },
        { chat: "done", sender: "working" },
        { id: "chat", text: `${chat.messages.length} messages` },
      );
    } catch (error) {
      await this.finish(owner, session, "failed", readError(error));
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }

  /** Steps 2 to 7: photos, videos, the profile, and deleting the files. */
  async build(owner: string, uploadId: string): Promise<void> {
    if (this.running.has(uploadId)) return;
    this.running.add(uploadId);
    const found = await this.deps.db.get<UploadSession>(owner, UPLOADS_KIND, uploadId).catch(() => null);
    if (!found || found.status !== "building") {
      this.running.delete(uploadId);
      return;
    }
    let session: UploadSession = found;
    const dir = await mkdtemp(join(tmpdir(), "debo-persona-"));
    try {
      const store = this.deps.store();
      const model = await this.deps.model(owner).catch(() => undefined);
      if (!store || !model) throw fail(NOT_SET_UP);
      const person = await this.people.get(owner, session.personId);
      if (!person) throw fail(GONE);

      const text = await this.chatText(store, session, dir);
      const messages = text ? lastMessages(parseWhatsApp(text), CHAT_MESSAGES_READ) : [];

      const photoNotes: string[] = [];
      const photos = session.files.filter((f) => f.kind === "photo");
      if (photos.length) {
        session = await this.save(owner, session, { photos: "working" });
        for (const [i, photo] of photos.entries()) {
          session = await this.save(owner, session, {}, { id: "photos", text: `${i + 1} of ${photos.length}` });
          const bytes = new Uint8Array(await readFile(await this.download(store, photo.objectKey, dir, `photo-${i}`)));
          const type = imageType(bytes);
          if (!type) continue; // not really a photo: skipped, never sent
          const note = await model.describePhoto(bytes, type).catch(() => "");
          if (note && !/can't describe/i.test(note)) photoNotes.push(note);
        }
        session = await this.save(owner, session, { photos: "done" }, { id: "photos", text: `${photoNotes.length} of ${photos.length} described` });
      }

      const transcripts: string[] = [];
      const videos = session.files.filter((f) => f.kind === "video");
      if (videos.length) {
        session = await this.save(owner, session, { videos: "working" });
        const transcriber = this.deps.transcriber?.();
        const audio = this.deps.audio?.();
        if (transcriber && audio) {
          for (const [i, video] of videos.entries()) {
            session = await this.save(owner, session, {}, { id: "videos", text: `${i + 1} of ${videos.length}` });
            const path = await this.download(store, video.objectKey, dir, `video-${i}`);
            const words = await listen(transcriber, audio, path, join(dir, `v${i}`)).catch(() => "");
            if (words.trim()) transcripts.push(words.trim());
          }
          session = await this.save(owner, session, { videos: "done" });
        } else {
          session = await this.save(owner, session, { videos: "skipped" }, { id: "videos", text: "Writing out speech is not set up on this Daksha" });
        }
      }

      session = await this.save(owner, session, { profile: "working" });
      const { profile, request } = await buildProfile(model, {
        person,
        messages,
        sender: session.sender,
        photoNotes,
        transcripts,
        // Lines kept from their voice notes and calls are theirs too.
        spokenLines: (person.spokenLines ?? []).map((l) => l.text),
      });
      if (request.personLines.length === 0 && photoNotes.length === 0 && transcripts.length === 0)
        throw fail("I couldn't find anything this person wrote or said in those files. Try another chat or pick a different name.");
      await this.people.saveProfile(owner, person.id, {
        styleSummary: profile.styleSummary,
        examples: profile.examples,
        nicknames: profile.nicknames.length ? profile.nicknames : person.nicknames,
        languages: profile.languages.length ? profile.languages : person.languages,
        // Facts the person wrote stay; facts from earlier uploads are replaced by the new ones.
        facts: [...person.facts.filter((f) => f.source === "description"), ...profile.facts].slice(0, 40),
        ...(profile.appearance ? { appearance: profile.appearance } : {}),
        builtFrom: {
          chats: session.files.filter((f) => f.kind === "chat").length,
          messages: request.personLines.length,
          photos: photoNotes.length,
          videos: transcripts.length,
          voice: person.spokenLines?.length ?? 0,
          at: this.now().toISOString(),
        },
      });
      session = await this.save(owner, session, { profile: "done" });
      await this.finish(owner, session, "done");
    } catch (error) {
      console.error("custom person build failed", { owner, session: uploadId, reason: error instanceof Error ? error.name : "unknown" });
      await this.finish(owner, session, "failed", readError(error));
    } finally {
      this.running.delete(uploadId);
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }

  /**
   * The upkeep loop: stuck sessions, raw files past 24 hours, old sessions, and the voice
   * recordings under the same `persona-uploads/` folder. Never throws.
   */
  async sweep(now = this.now()) {
    let removed = 0;
    try {
      removed += await sweepUploads(this.deps.db, this.deps.store(), now);
    } catch (error) {
      console.error("custom person sweep failed", { reason: error instanceof Error ? error.name : "unknown" });
    }
    removed += (await this.deps.sweepAlso?.().catch(() => 0)) ?? 0;
    return removed;
  }
}

/** The counts of what the profile was built from, with the spoken lines counted. */
function builtFromWithVoice(person: CustomPerson, now: Date): NonNullable<CustomPerson["builtFrom"]> {
  const before = person.builtFrom ?? { chats: 0, messages: 0, photos: 0, videos: 0, voice: 0, at: now.toISOString() };
  return { ...before, voice: person.spokenLines?.length ?? 0, at: now.toISOString() };
}

function readError(error: unknown): string {
  if (error instanceof Error && (error.name === "ReadError" || error instanceof AppError)) return error.message;
  return "Something went wrong while reading the files. I deleted them; try again in a moment.";
}

/** JPEG, PNG, GIF or WebP from the first bytes, or null. The name and the app's word are not trusted. */
export function imageType(b: Uint8Array): string | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "image/gif";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50)
    return "image/webp";
  return null;
}

/** The words in a video's sound, through the same Whisper engine journal recordings use. */
export async function listen(transcriber: Transcriber, audio: AudioTools, input: string, outputDir: string): Promise<string> {
  const { mkdir } = await import("node:fs/promises");
  await mkdir(outputDir, { recursive: true });
  const { path, durationSeconds } = await audio.prepare(input, outputDir);
  const plan = planChunks(Math.min(durationSeconds, VIDEO_MAX_SECONDS));
  const pieces: TranscriptPiece[] = [];
  for (const chunk of plan) pieces[chunk.index] = await transcriber.transcribe(await audio.slice(path, chunk.start, chunk.length));
  return mergePieces(plan, pieces).text;
}
