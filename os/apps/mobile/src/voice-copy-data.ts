// Voice notes and call recordings of a custom person: the server's answers, read
// with zod, and the words the screen shows. No React in here, so tests can run it.
// The server side is os/apps/server/src/voice-clone/.
import { z } from "zod";
import type { FuseApi } from "./api";
import type { UploadStarted } from "./debo-api";
import type { UploadApi } from "./debo-upload";

export type Label = "me" | "them" | "other";

const Speaker = z.object({
  speaker: z.string(),
  seconds: z.number(),
  lineCount: z.number(),
  sampleLines: z.array(z.string()),
  samples: z.array(z.object({ start: z.number(), end: z.number() })),
});
export type Speaker = z.infer<typeof Speaker>;

export const RecordingView = z.object({
  id: z.string(),
  status: z.enum(["uploading", "waiting", "working", "ready", "failed"]),
  mimeType: z.string(),
  source: z.enum(["voice-note", "call"]),
  createdAt: z.string(),
  language: z.string().nullable(),
  canCopyVoice: z.boolean(),
  speakers: z.array(Speaker),
  message: z.string().optional(),
  sampleUrl: z.string().nullable().optional(),
});
export type RecordingView = z.infer<typeof RecordingView>;

export const VoiceState = z.object({
  copied: z.boolean(),
  createdAt: z.string().optional(),
  language: z.string().optional(),
  key: z.enum(["own", "debo", "none"]),
  message: z.string().optional(),
  consentText: z.string(),
  audioConsentText: z.string(),
});
export type VoiceState = z.infer<typeof VoiceState>;

const CopyResult = z.union([
  z.object({ status: z.literal("copied"), createdAt: z.string() }),
  z.object({ status: z.enum(["needs-key", "cant-cut", "too-short", "failed"]), message: z.string() }),
]);
export const LabelResult = z.object({
  keptLines: z.number(),
  discardedVoices: z.number(),
  voiceCopy: CopyResult.optional(),
});
export type LabelResult = z.infer<typeof LabelResult>;

const Started = z.object({ uploadId: z.string(), upload: z.unknown() });

/** Calls for one custom person. Every path is under that person, and the server checks the owner. */
export function voiceCopyApi(api: FuseApi, personId: string) {
  const base = `/api/custom-people/${encodeURIComponent(personId)}`;
  return {
    async list() {
      return z
        .object({ available: z.boolean(), uploads: z.array(RecordingView) })
        .parse(await api.request(`${base}/audio`));
    },
    async status(id: string) {
      return RecordingView.parse(await api.request(`${base}/audio/${encodeURIComponent(id)}`));
    },
    async label(id: string, labels: Record<string, Label>, copyVoice?: { consent: true }) {
      return LabelResult.parse(
        await api.request(`${base}/audio/${encodeURIComponent(id)}/labels`, { labels, ...(copyVoice ? { copyVoice } : {}) }),
      );
    },
    async discard(id: string) {
      await api.request(`${base}/audio/${encodeURIComponent(id)}`, undefined, "DELETE");
    },
    async voice() {
      return VoiceState.parse(await api.request(`${base}/voice`));
    },
    async removeVoice() {
      return z.object({ removed: z.boolean(), message: z.string().optional() }).parse(await api.request(`${base}/voice`, undefined, "DELETE"));
    },
    /** The shape uploadRecording (debo-upload.ts) needs, so the same sending code is used. */
    uploader(kind: "voice-note" | "call"): UploadApi<RecordingView> {
      return {
        async startUpload(body) {
          const started = Started.parse(
            await api.request(`${base}/audio`, { consent: true, mimeType: body.mimeType, sizeBytes: body.sizeBytes, kind }),
          );
          return { mediaId: started.uploadId, upload: started.upload as UploadStarted["upload"] };
        },
        async completeUpload(id, body) {
          return RecordingView.parse(
            await api.request(`${base}/audio/${encodeURIComponent(id)}/complete`, body.parts ? { parts: body.parts } : {}),
          );
        },
      };
    },
  };
}

/** The labels can be sent once at least one voice is the custom person. */
export function labelsReady(labels: Record<string, Label | undefined>): boolean {
  return Object.values(labels).includes("them");
}

/** "0:12" for a sample's start. */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** What to tell the person after labelling. */
export function resultText(result: LabelResult, name: string): string {
  const kept =
    result.keptLines === 0
      ? `I didn't find any of ${name}'s words worth keeping in this one.`
      : `I kept ${result.keptLines} ${result.keptLines === 1 ? "line" : "lines"} ${name} said.`;
  const others = result.discardedVoices > 0 ? " The other voices were thrown away." : "";
  const copy = !result.voiceCopy
    ? ""
    : result.voiceCopy.status === "copied"
      ? ` Your calls with ${name} now use the copied voice. Each call starts by saying it's an AI version.`
      : ` ${result.voiceCopy.message}`;
  return `${kept}${others} The recording is deleted.${copy}`;
}
