// What the recording code (web and phone versions) hands to the screens.
// The two platform files, debo-capture.web.ts and debo-capture.native.ts, must
// export the same names. No React in here.

/** A recording or file the person has not saved yet. */
export type Capture = {
  name: string;
  mimeType: string;
  sizeBytes: number;
  durationMs?: number;
  /** When the file was last changed, for a picked file. */
  lastModified?: number;
  origin: "recorded" | "picked";
  kind: "voice" | "video";
  /** Something a player can play before it is saved. */
  previewUri: string;
  /** Web: a Blob. Phone: a file address. Only the platform file reads it. */
  data: unknown;
};

/** A recording in progress. */
export type LiveRecording = {
  /** Stop and get what was recorded. */
  stop(): Promise<Capture>;
  /** Stop and throw the recording away. */
  cancel(): void;
  /** A video only. Web: the camera picture, to show while recording. Phone: the camera recorder LivePreview shows. */
  stream?: unknown;
  /** Hold the recording and its timer. Missing where it cannot pause (a video on the phone). */
  pause?(): void;
  resume?(): void;
  /** How loud the microphone is right now, 0 to 1. Missing where it cannot be read. */
  level?(): number;
};

/** Which microphone or camera to use, and which way the camera faces. */
export type RecordOptions = {
  micId?: string;
  cameraId?: string;
  facing?: "user" | "environment";
  /**
   * Web: a preview already open from openPreview. Its microphone and camera are used for the
   * recording, so the person is not asked twice and the picture does not blink.
   */
  preview?: Preview;
};

/** The microphone (and camera) on, but not recording: a level meter and a picture before you start. */
export type Preview = {
  /** Web: the camera picture. Phone: the camera LivePreview shows, which the recording then uses. */
  stream?: unknown;
  /** Missing where the level cannot be read before recording (the phone). */
  level?(): number;
  close(): void;
};

/** A microphone or camera the person can pick. Labels come from the device. */
export type InputDevice = { id: string; label: string; kind: "mic" | "camera" };

/** Speaking into the text: clips go out while the mic is on. */
export type Dictation = {
  /** Turn the mic off and send the last clip. */
  stop(): Promise<void>;
};

export type CaptureSupport = {
  voice: boolean;
  video: boolean;
  dictation: boolean;
  /** A recording of this kind can be paused and carried on. */
  pause?: { voice: boolean; video: boolean };
  /** The person can pick which microphone and camera (the web, once allowed). */
  chooseInputs?: boolean;
};

/** One piece of an upload went up. `etag` is what R2 sent back for a part. */
export type SentRange = { etag?: string };

/** Plain words for why the mic or camera could not be used. */
export function micProblemText(error: unknown, camera = false): string {
  const name = error instanceof Error ? error.name : "";
  const what = camera ? "camera and microphone" : "microphone";
  if (name === "NotAllowedError" || name === "SecurityError")
    return `I can't use your ${what}. Allow it in your browser's address bar, then try again.`;
  if (name === "NotFoundError" || name === "OverconstrainedError")
    return `I can't find a ${what} on this device. You can still add a recording you already have.`;
  if (name === "NotReadableError") return `Something else is using your ${what}. Close it, then try again.`;
  return `I couldn't start the ${what}. Try again, or add a recording you already have.`;
}
