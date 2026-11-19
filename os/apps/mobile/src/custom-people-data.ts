// Custom people in the app: the shapes the server sends, and sending files for one person.
// No React in here, so tests can run it with a fake server and a fake sender.
// The server checks everything again (apps/server/src/custom-people).
import { z } from "zod";

export type SourceKind = "chat" | "photo" | "video";

export const CustomPersonSchema = z.object({
  id: z.string(),
  name: z.string(),
  relation: z.string(),
  description: z.string(),
  styleSummary: z.string(),
  examples: z.array(z.string()),
  nicknames: z.array(z.string()),
  languages: z.array(z.string()),
  facts: z.array(z.object({ text: z.string(), source: z.string() })),
  appearance: z.string().optional(),
  voice: z.string().optional(),
  voiceCloneId: z.string().optional(),
  avatarId: z.string().optional(),
  passedAway: z.boolean().optional(),
  builtFrom: z
    .object({ chats: z.number(), messages: z.number(), photos: z.number(), videos: z.number(), voice: z.number(), at: z.string() })
    .optional(),
  updatedAt: z.string(),
});
export type CustomPerson = z.infer<typeof CustomPersonSchema>;

export const StepSchema = z.object({
  id: z.string(),
  label: z.string(),
  state: z.enum(["waiting", "working", "done", "skipped", "failed"]),
  detail: z.string().optional(),
});
export type Step = z.infer<typeof StepSchema>;

export const UploadViewSchema = z.object({
  id: z.string(),
  personId: z.string(),
  status: z.enum(["uploading", "queued", "reading", "needs-sender", "building", "done", "failed"]),
  steps: z.array(StepSchema),
  senders: z.array(z.object({ name: z.string(), count: z.number() })).optional(),
  sender: z.string().optional(),
  error: z.string().optional(),
  filesDeleted: z.boolean(),
});
export type UploadView = z.infer<typeof UploadViewSchema>;

export const PeopleReplySchema = z.object({
  people: z.array(CustomPersonSchema),
  activeId: z.string().nullable(),
  canRead: z.boolean(),
  consentText: z.string(),
  factSources: z.record(z.string(), z.string()),
  voices: z.array(z.object({ id: z.string(), name: z.string(), description: z.string() })),
  limits: z.record(z.string(), z.unknown()),
});
export type PeopleReply = z.infer<typeof PeopleReplySchema>;

type UploadPlan =
  | { mode: "single"; url: string; headers: Record<string, string> }
  | { mode: "multipart"; uploadId: string; partBytes: number; parts: { number: number; url: string; headers: Record<string, string> }[] };

/** A file the person picked. `data` is a Blob on the web, a file address on the phone. */
export type PickedFile = { name: string; mimeType: string; sizeBytes: number; kind: SourceKind; data: unknown };

/** Which kind a picked file is, from its type and name. Null when Debo can't use it. */
export function kindOf(mimeType: string, name: string): { kind: SourceKind; mimeType: string } | null {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const mime = mimeType.toLowerCase();
  if (ext === "zip" || mime.includes("zip")) return { kind: "chat", mimeType: "application/zip" };
  if (ext === "txt" || mime === "text/plain") return { kind: "chat", mimeType: "text/plain" };
  const images: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" };
  if (mime.startsWith("image/")) return { kind: "photo", mimeType: mime };
  if (images[ext]) return { kind: "photo", mimeType: images[ext] };
  const videos: Record<string, string> = { mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm", "3gp": "video/3gpp", m4v: "video/x-m4v" };
  if (mime.startsWith("video/")) return { kind: "video", mimeType: mime };
  if (videos[ext]) return { kind: "video", mimeType: videos[ext] };
  return null;
}

export type PeopleApi = { request<T>(path: string, body?: unknown, method?: string): Promise<T> };
export type RangeSender = (
  file: PickedFile,
  url: string,
  headers: Record<string, string>,
  from: number,
  to: number,
  onProgress: (sent: number) => void,
) => Promise<{ etag?: string }>;

/**
 * Send the files for one person: ask for links (with the consent tick), send each file
 * straight to the private bucket, then say it is done. Reading then runs on the server;
 * follow it with GET /status. `onProgress` gets 0 to 1 over all the files.
 */
export async function sendPersonFiles(
  api: PeopleApi,
  send: RangeSender,
  personId: string,
  files: PickedFile[],
  onProgress: (fraction: number) => void = () => {},
): Promise<UploadView> {
  const started = await api.request<{ upload: { id: string }; files: { fileId: string; upload: UploadPlan }[] }>(
    `/api/custom-people/${encodeURIComponent(personId)}/sources`,
    { consent: true, files: files.map((f) => ({ kind: f.kind, mimeType: f.mimeType, sizeBytes: f.sizeBytes })) },
    "POST",
  );
  const total = files.reduce((n, f) => n + f.sizeBytes, 0) || 1;
  let done = 0;
  const finished: { id: string; parts?: { number: number; etag: string }[] }[] = [];
  for (const [i, plan] of started.files.entries()) {
    const file = files[i];
    if (!file) continue;
    const upload = plan.upload;
    if (upload.mode === "single") {
      await send(file, upload.url, upload.headers, 0, file.sizeBytes, (n) => onProgress(Math.min(0.99, (done + n) / total)));
      finished.push({ id: plan.fileId });
    } else {
      const parts: { number: number; etag: string }[] = [];
      for (const part of upload.parts) {
        const from = (part.number - 1) * upload.partBytes;
        const to = Math.min(file.sizeBytes, from + upload.partBytes);
        const sent = await send(file, part.url, part.headers, from, to, (n) => onProgress(Math.min(0.99, (done + from + n) / total)));
        if (!sent.etag) throw new Error("A file went up but the storage did not confirm it. Try again.");
        parts.push({ number: part.number, etag: sent.etag });
      }
      finished.push({ id: plan.fileId, parts });
    }
    done += file.sizeBytes;
  }
  const reply = await api.request<{ upload: unknown }>(
    `/api/custom-people/${encodeURIComponent(personId)}/sources/${encodeURIComponent(started.upload.id)}/complete`,
    { files: finished },
    "POST",
  );
  onProgress(1);
  return UploadViewSchema.parse(reply.upload);
}

/** Two letters for the fallback face: "Meera Nani" is "MN". */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? "?") + (words[1]?.[0] ?? "")).toUpperCase();
}
