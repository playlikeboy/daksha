// Upload sessions for custom people: the consent tick, the limits, where files go in the bucket,
// and how they are deleted. Exported on their own so other sources (voice notes and call
// recordings, Workstream D) use the same rules.
//
// - Files go to the private media bucket under `persona-uploads/<owner>/<session>/`, a
//   temporary folder apart from journal recordings. Nothing a person sends names a key.
// - The person must tick the consent box first; the server keeps when they agreed and the
//   exact words they agreed to, on the session.
// - Raw files are deleted when reading ends, on success and on failure, and a sweep removes
//   anything older than 24 hours.
// - Never log file names or contents. Ids and counts only.
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Store } from "../db.ts";
import type { ObjectStore, UploadPlan } from "../debo/object-store.ts";
import { AppError } from "../errors.ts";

export const UPLOADS_KIND = "custom-person-uploads";
export const UPLOAD_PREFIX = "persona-uploads";

/** The words on the tick box. The server records these exact words with the time. */
export const CONSENT_TEXT = "I'm allowed to use these files, and this is for my own private use.";
export const CONSENT_VERSION = 1;

/** Raw files never stay longer than this, whatever happens. */
export const RAW_FILE_MAX_AGE_MS = 24 * 3_600_000;
/** A session that stopped moving this long ago was cut off by a restart. */
export const STUCK_MS = 30 * 60_000;
/** Finished sessions (counts and sender names only) are forgotten after this. */
export const SESSION_KEEP_MS = 7 * 24 * 3_600_000;

const MB = 1024 * 1024;

/** What each kind of file may be. Another source adds its own entry. */
export const SOURCE_LIMITS = {
  chat: {
    maxFiles: 1,
    maxBytes: 50 * MB,
    types: ["application/zip", "application/x-zip-compressed", "application/octet-stream", "text/plain"],
    ext: (mime: string) => (mime === "text/plain" ? "txt" : "zip"),
    tooBig: "That chat file is too big. Keep it under 50 MB: export it from WhatsApp without media.",
  },
  photo: {
    maxFiles: 20,
    maxBytes: 5 * MB,
    types: ["image/jpeg", "image/png", "image/webp", "image/gif"],
    ext: (mime: string) => mime.split("/")[1] ?? "img",
    tooBig: "That photo is too big. Keep each photo under 5 MB.",
  },
  video: {
    maxFiles: 5,
    maxBytes: 200 * MB,
    types: ["video/mp4", "video/quicktime", "video/webm", "video/3gpp", "video/x-m4v"],
    ext: (mime: string) => ({ "video/quicktime": "mov", "video/3gpp": "3gp", "video/x-m4v": "m4v" })[mime] ?? mime.split("/")[1] ?? "video",
    tooBig: "That video is too big. Keep each video under 200 MB.",
  },
} as const;
export type SourceKind = keyof typeof SOURCE_LIMITS;
const KINDS = Object.keys(SOURCE_LIMITS) as [SourceKind, ...SourceKind[]];

export const STEP_LABELS = {
  upload: "Sending your files",
  chat: "Reading the chat",
  sender: "Picking who they are in the chat",
  photos: "Looking at the photos",
  videos: "Listening to the videos",
  profile: "Building their profile",
  cleanup: "Deleting your files",
} as const;
export type StepId = keyof typeof STEP_LABELS;
export type StepState = "waiting" | "working" | "done" | "skipped" | "failed";
export interface Step {
  id: StepId;
  label: string;
  state: StepState;
  /** "3 of 12", when it helps. */
  detail?: string;
}

export interface UploadFile {
  id: string;
  kind: SourceKind;
  objectKey: string;
  mimeType: string;
  sizeBytes: number;
  /** Multipart upload id, while the file is going up in parts. */
  uploadId: string | null;
}

export type SessionStatus = "uploading" | "queued" | "reading" | "needs-sender" | "building" | "done" | "failed";

export interface UploadSession {
  id: string;
  personId: string;
  status: SessionStatus;
  steps: Step[];
  files: UploadFile[];
  consent: { agreedAt: string; text: string; version: number };
  /** Who wrote in the chat, with counts, so the person can pick "them". Names and counts only. */
  senders?: { name: string; count: number }[];
  sender?: string;
  error?: string;
  /** True once every raw file is gone from the bucket. */
  filesDeleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export const SourcesStart = z.object({
  consent: z.literal(true, { error: "Tick the box to say you're allowed to use these files, and it's for your own private use." }),
  files: z
    .array(
      z.object({
        kind: z.enum(KINDS),
        mimeType: z.string().min(1).max(100),
        sizeBytes: z.number().int().min(1, "One of the files is empty."),
      }),
    )
    .min(1, "Pick at least one file.")
    .max(30),
});

export const SourcesDone = z.object({
  files: z
    .array(
      z.object({
        id: z.string().uuid(),
        parts: z.array(z.object({ number: z.number().int().min(1), etag: z.string().min(1).max(200) })).max(10_000).optional(),
      }),
    )
    .max(30)
    .default([]),
});

/** The consent record kept on a session. Throws a plain error unless the box was ticked. */
export function consentRecord(input: { consent?: unknown }, now = new Date()) {
  if (input.consent !== true)
    throw new AppError("Tick the box to say you're allowed to use these files, and it's for your own private use.", 422);
  return { agreedAt: now.toISOString(), text: CONSENT_TEXT, version: CONSENT_VERSION };
}

const SAFE_OWNER = /^[A-Za-z0-9_-]{1,64}$/;
/** Owner ids become part of a bucket key, so only plain ones are allowed. */
export function safeOwner(owner: string): boolean {
  return SAFE_OWNER.test(owner);
}

export const sessionPrefix = (owner: string, sessionId: string) => `${UPLOAD_PREFIX}/${owner}/${sessionId}/`;
export const ownerPrefix = (owner: string) => `${UPLOAD_PREFIX}/${owner}/`;
export const uploadKey = (owner: string, sessionId: string, fileId: string, ext: string) =>
  `${sessionPrefix(owner, sessionId)}${fileId}.${ext}`;

/** Check the files against the limits. Returns them with a clean type. */
export function checkFiles(files: z.infer<typeof SourcesStart>["files"]) {
  const counts = new Map<SourceKind, number>();
  return files.map((f) => {
    const limit = SOURCE_LIMITS[f.kind];
    const mimeType = f.mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
    if (!(limit.types as readonly string[]).includes(mimeType))
      throw new AppError(
        f.kind === "photo"
          ? "I can use JPEG, PNG, WebP or GIF photos. Change other photos (like HEIC) to JPEG first."
          : f.kind === "video"
            ? "I can use MP4, MOV, WebM or 3GP videos."
            : "Pick the chat as a .zip or .txt file, exported from WhatsApp.",
        422,
      );
    if (f.sizeBytes > limit.maxBytes) throw new AppError(limit.tooBig, 413);
    const n = (counts.get(f.kind) ?? 0) + 1;
    counts.set(f.kind, n);
    if (n > limit.maxFiles)
      throw new AppError(
        f.kind === "chat" ? "Add one chat at a time." : `You can add up to ${limit.maxFiles} ${f.kind}s at a time.`,
        422,
      );
    return { ...f, mimeType };
  });
}

/** Fresh steps for a session with these kinds of files. Steps that do not apply are skipped. */
export function freshSteps(kinds: Set<SourceKind>): Step[] {
  const has = (k: SourceKind) => kinds.has(k);
  const state = (on: boolean): StepState => (on ? "waiting" : "skipped");
  return (Object.keys(STEP_LABELS) as StepId[]).map((id) => ({
    id,
    label: STEP_LABELS[id],
    state:
      id === "upload"
        ? "working"
        : id === "chat" || id === "sender"
          ? state(has("chat"))
          : id === "photos"
            ? state(has("photo"))
            : id === "videos"
              ? state(has("video"))
              : "waiting",
  }));
}

/** Make the session and the upload links. The session is saved before any link is handed out. */
export async function startSession(
  db: Store,
  store: ObjectStore,
  owner: string,
  personId: string,
  input: unknown,
  options: { singleMaxBytes: number; partBytes: number; expiresSeconds: number; now?: Date },
) {
  if (!safeOwner(owner)) throw new AppError("Uploads are not possible for this account.", 403);
  const body = SourcesStart.parse(input);
  const consent = consentRecord(body, options.now);
  const files = checkFiles(body.files);
  const id = randomUUID();
  const now = (options.now ?? new Date()).toISOString();
  const planned: { file: UploadFile; upload: UploadPlan }[] = [];
  const session: UploadSession = {
    id,
    personId,
    status: "uploading",
    steps: freshSteps(new Set(files.map((f) => f.kind))),
    files: [],
    consent,
    filesDeleted: false,
    createdAt: now,
    updatedAt: now,
  };
  // Saved first, so a sweep can always find (and delete) whatever goes up.
  await db.put(owner, UPLOADS_KIND, session);
  try {
    for (const f of files) {
      const fileId = randomUUID();
      const objectKey = uploadKey(owner, id, fileId, SOURCE_LIMITS[f.kind].ext(f.mimeType));
      const upload = await store.beginUpload({
        key: objectKey,
        mimeType: f.mimeType,
        size: f.sizeBytes,
        singleMaxBytes: options.singleMaxBytes,
        partBytes: options.partBytes,
        expiresSeconds: options.expiresSeconds,
      });
      planned.push({
        file: { id: fileId, kind: f.kind, objectKey, mimeType: f.mimeType, sizeBytes: f.sizeBytes, uploadId: upload.mode === "multipart" ? upload.uploadId : null },
        upload,
      });
    }
  } catch {
    // Nothing usable went out: forget the session and anything already started.
    for (const p of planned) if (p.file.uploadId) await store.abortUpload(p.file.objectKey, p.file.uploadId);
    await db.remove(owner, UPLOADS_KIND, id);
    throw new AppError("I couldn't get the upload ready. Try again in a moment.", 502);
  }
  session.files = planned.map((p) => p.file);
  await db.put(owner, UPLOADS_KIND, session);
  return { session, uploads: planned.map((p) => ({ fileId: p.file.id, kind: p.file.kind, upload: p.upload })) };
}

/** Delete every raw file of a session. Throws if the bucket would not delete, so it can be tried again. */
export async function deleteSessionFiles(store: ObjectStore, owner: string, session: Pick<UploadSession, "id" | "files">) {
  for (const f of session.files) {
    if (f.uploadId) await store.abortUpload(f.objectKey, f.uploadId);
    await store.delete(f.objectKey);
  }
  // Anything else under the session's folder goes too.
  await store.deletePrefix(sessionPrefix(owner, session.id));
}

/** The session as the app sees it. No bucket keys. */
export function sessionView(session: UploadSession) {
  return {
    id: session.id,
    personId: session.personId,
    status: session.status,
    steps: session.steps,
    files: session.files.map((f) => ({ id: f.id, kind: f.kind, sizeBytes: f.sizeBytes })),
    ...(session.senders ? { senders: session.senders } : {}),
    ...(session.sender ? { sender: session.sender } : {}),
    ...(session.error ? { error: session.error } : {}),
    filesDeleted: session.filesDeleted,
    consentedAt: session.consent.agreedAt,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}

/**
 * Keeping house, run by the server's upkeep loop:
 *  - sessions cut off by a restart are marked failed;
 *  - raw files older than 24 hours are deleted, whatever state their session is in;
 *  - a deletion that failed earlier is tried again;
 *  - finished sessions are forgotten after a week.
 * Never throws; failures are logged by id and tried again next time.
 */
export async function sweepUploads(db: Store, store: ObjectStore | undefined, now = new Date()) {
  let deleted = 0;
  for (const { owner, value } of await db.scan<UploadSession>(UPLOADS_KIND)) {
    try {
      const age = now.getTime() - Date.parse(value.createdAt);
      const idle = now.getTime() - Date.parse(value.updatedAt);
      const finished = value.status === "done" || value.status === "failed";
      let next = value;
      if (!finished && (age > RAW_FILE_MAX_AGE_MS || (value.status !== "needs-sender" && value.status !== "uploading" && idle > STUCK_MS)))
        next = {
          ...next,
          status: "failed",
          error:
            age > RAW_FILE_MAX_AGE_MS
              ? "These files waited too long, so I deleted them. Add them again when you're ready."
              : "Debo stopped while reading these files, so I deleted them. Try adding them again.",
          steps: next.steps.map((s) => (s.state === "working" || s.state === "waiting" ? { ...s, state: "failed" as const } : s)),
        };
      const mustDelete = !next.filesDeleted && (next.status === "failed" || next.status === "done" || age > RAW_FILE_MAX_AGE_MS);
      if (mustDelete && store) {
        await deleteSessionFiles(store, owner, next);
        next = { ...next, filesDeleted: true };
        deleted += 1;
      }
      if (next !== value) await db.put(owner, UPLOADS_KIND, { ...next, updatedAt: now.toISOString() });
      if (next.filesDeleted && (next.status === "done" || next.status === "failed") && idle > SESSION_KEEP_MS)
        await db.remove(owner, UPLOADS_KIND, value.id);
    } catch (error) {
      console.error("custom person upload sweep failed", { owner, session: value.id, reason: error instanceof Error ? error.name : "unknown" });
    }
  }
  return deleted;
}
