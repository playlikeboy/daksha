// What the entry page's player (web and phone versions) takes and offers.
// debo-player.web.tsx and debo-player.native.tsx export the same names.
import type { MutableRefObject } from "react";
import type { TranscriptSegment } from "./debo-data";

/** What the page can ask of the player: jump to a point (for tap-to-seek in the transcript). */
export type PlayerControl = { seek(seconds: number, play?: boolean): void };

export type EntryPlayerProps = {
  kind: "voice" | "video";
  /** A short-lived link to the recording. Asked for when the page opens. */
  load: () => Promise<string>;
  label: string;
  /** Timed pieces of the transcript, when there are any. */
  segments: TranscriptSegment[];
  /** Known length, so the bar has a scale before the file says. */
  durationMs: number | null;
  /** The file name to save it as. */
  fileName: string;
  mimeType: string;
  control: MutableRefObject<PlayerControl | null>;
  /** Where it is now, in seconds, a few times a second while it plays. */
  onTime: (seconds: number) => void;
};

/** Playback speeds offered. */
export const SPEEDS = [0.75, 1, 1.25, 1.5, 2] as const;
export const speedLabel = (rate: number) => `${rate}×`;

/** "voice-note-14-march.webm" from the entry and its type. */
export function downloadName(base: string, mimeType: string): string {
  const ext =
    {
      "audio/webm": "webm",
      "video/webm": "webm",
      "audio/mp4": "m4a",
      "video/mp4": "mp4",
      "video/quicktime": "mov",
      "audio/mpeg": "mp3",
      "audio/wav": "wav",
      "audio/ogg": "ogg",
      "audio/aac": "aac",
      "audio/flac": "flac",
      "video/3gpp": "3gp",
    }[mimeType.split(";")[0]?.trim().toLowerCase() ?? ""] ?? "bin";
  const slug = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${slug || "recording"}.${ext}`;
}
