// Phone (iOS and Android): record a voice note (expo-audio) or a video
// (expo-camera), pick a file you already have, and send it to the upload links.
// The microphone and camera are only opened by a call here that a button press
// made, and every path closes them again (stop, cancel, or an error).
//
// A video is recorded by the camera picture itself: startRecording("video")
// hands back a recording that waits for LivePreview (debo-player.native.tsx) to
// show the camera, and recording starts when the camera says it is ready.
//
// Dictation is not built here: the microphone on the keyboard speaks into the
// text instead.
//
// Not run on a device yet: typechecked, and the Android build is made by CI.
import { AudioModule, RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync } from "expo-audio";
import { Camera } from "expo-camera";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import * as LegacyFileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";
import {
  type Capture,
  type CaptureSupport,
  type Dictation,
  type LiveRecording,
  type SentRange,
} from "./debo-capture-types";

export type { Capture, CaptureSupport, Dictation, LiveRecording, SentRange };

export function recordingSupport(): CaptureSupport {
  return { voice: true, video: true, dictation: false };
}

/** The most a video may be, so a long one stops itself instead of growing past what can be saved. */
const VIDEO_MAX_BYTES = 200 * 1024 * 1024;

const MIC_DENIED =
  "I can't use your microphone. Allow it for Debo in your phone's settings, then try again. You can still add a recording you already have.";
const CAMERA_DENIED =
  "I can't use your camera and microphone. Allow them for Debo in your phone's settings, then try again. You can still add a recording you already have.";

/** Mono AAC in an m4a file: clear for speech, and about 30 MB for an hour. */
function voiceOptions() {
  const preset = RecordingPresets.HIGH_QUALITY;
  const common = { extension: preset.extension, sampleRate: preset.sampleRate, numberOfChannels: 1, bitRate: 64000 };
  return Platform.OS === "ios" ? { ...common, ...preset.ios } : { ...common, ...preset.android };
}

const fileSize = (uri: string) => {
  try {
    return new File(uri).size ?? 0;
  } catch {
    return 0;
  }
};

const deleteFile = (uri: string | null | undefined) => {
  if (!uri) return;
  try {
    new File(uri).delete();
  } catch {
    // Already gone, or never written.
  }
};

const videoType = (uri: string) => (uri.toLowerCase().endsWith(".mov") ? "video/quicktime" : "video/mp4");

export async function startRecording(kind: "voice" | "video", onTick?: (ms: number) => void): Promise<LiveRecording> {
  return kind === "video" ? startVideo(onTick) : startVoice(onTick);
}

async function startVoice(onTick?: (ms: number) => void): Promise<LiveRecording> {
  const permission = await requestRecordingPermissionsAsync();
  if (!permission.granted) throw new Error(MIC_DENIED);
  await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
  const recorder = new AudioModule.AudioRecorder(voiceOptions());
  let timer: ReturnType<typeof setInterval> | undefined;
  const close = async () => {
    if (timer) clearInterval(timer);
    timer = undefined;
    await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
  };
  try {
    await recorder.prepareToRecordAsync();
    recorder.record();
  } catch {
    await close();
    recorder.release();
    throw new Error("I couldn't start the microphone. Try again, or add a recording you already have.");
  }
  timer = setInterval(() => onTick?.(recorder.getStatus().durationMillis), 250);
  return {
    async stop() {
      const durationMs = recorder.getStatus().durationMillis;
      try {
        await recorder.stop();
      } finally {
        await close();
      }
      const uri = recorder.uri;
      recorder.release();
      if (!uri) throw new Error("The recording didn't save. Try again.");
      return {
        name: "Your voice note",
        mimeType: "audio/mp4",
        sizeBytes: fileSize(uri),
        durationMs,
        origin: "recorded",
        kind: "voice",
        previewUri: uri,
        data: uri,
      };
    },
    cancel() {
      void recorder
        .stop()
        .catch(() => {})
        .finally(() => {
          deleteFile(recorder.uri);
          recorder.release();
          void close();
        });
    },
  };
}

/** What LivePreview needs to show the camera and run the recording. */
export type CameraRecorder = {
  kind: "camera";
  /** LivePreview calls this when the camera picture is showing. */
  ready(camera: CameraHandle): void;
};

/** The two CameraView methods used here. */
export type CameraHandle = {
  recordAsync(options?: { maxFileSize?: number }): Promise<{ uri: string } | undefined>;
  stopRecording(): void;
};

async function startVideo(onTick?: (ms: number) => void): Promise<LiveRecording> {
  const [camera, mic] = await Promise.all([
    Camera.requestCameraPermissionsAsync(),
    Camera.requestMicrophonePermissionsAsync(),
  ]);
  if (!camera.granted || !mic.granted) throw new Error(CAMERA_DENIED);

  let handle: CameraHandle | undefined;
  let started = 0;
  let cancelled = false;
  let result: Promise<{ uri: string } | undefined> | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  const clearTimer = () => {
    if (timer) clearInterval(timer);
    timer = undefined;
  };

  const controller: CameraRecorder = {
    kind: "camera",
    ready(next) {
      if (handle || cancelled) return;
      handle = next;
      started = Date.now();
      result = next.recordAsync({ maxFileSize: VIDEO_MAX_BYTES });
      // The recording can end by itself at the size limit: the timer stops with it.
      void result.catch(() => undefined).finally(clearTimer);
      timer = setInterval(() => onTick?.(Date.now() - started), 250);
    },
  };

  return {
    stream: controller,
    async stop() {
      clearTimer();
      if (!handle || !result) throw new Error("The camera didn't start. Try again, or add a video you already have.");
      const durationMs = Date.now() - started;
      handle.stopRecording();
      const video = await result.catch(() => undefined);
      if (!video?.uri) throw new Error("The video didn't save. Try again.");
      return {
        name: "Your video",
        mimeType: videoType(video.uri),
        sizeBytes: fileSize(video.uri),
        durationMs,
        origin: "recorded",
        kind: "video",
        previewUri: video.uri,
        data: video.uri,
      };
    },
    cancel() {
      cancelled = true;
      clearTimer();
      if (!handle || !result) return;
      handle.stopRecording();
      void result.then((video) => deleteFile(video?.uri)).catch(() => {});
    },
  };
}

export async function startDictation(_onClip: (clip: Blob) => Promise<void>): Promise<Dictation> {
  throw new Error("Use the microphone on your keyboard to speak into the text.");
}

export async function pickRecording(): Promise<Capture | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ["audio/*", "video/*"],
    copyToCacheDirectory: true,
    multiple: false,
  });
  const asset = result.canceled ? undefined : result.assets[0];
  if (!asset) return null;
  const mimeType = asset.mimeType ?? "";
  return {
    name: asset.name,
    mimeType,
    sizeBytes: asset.size ?? new File(asset.uri).size ?? 0,
    lastModified: asset.lastModified,
    origin: "picked",
    kind: mimeType.startsWith("video/") ? "video" : "voice",
    previewUri: asset.uri,
    data: asset.uri,
  };
}

/**
 * Nothing to release on the phone. A recording made here stays in the app's own
 * cache folder (only this app can read it) until the phone clears it: deleting
 * it here could cut off an upload that is still running after the screen closed.
 * A recording that was cancelled is deleted straight away.
 */
export function releaseCapture(_capture: Capture) {}

/** Send bytes [from, to) of the file to an upload link. */
export async function sendRange(
  capture: Capture,
  url: string,
  headers: Record<string, string>,
  from: number,
  to: number,
  onProgress: (sent: number) => void,
): Promise<SentRange> {
  const uri = capture.data as string;
  if (from === 0 && to >= capture.sizeBytes) {
    const task = LegacyFileSystem.createUploadTask(
      url,
      uri,
      { httpMethod: "PUT", uploadType: LegacyFileSystem.FileSystemUploadType.BINARY_CONTENT, headers },
      (p) => onProgress(p.totalBytesSent),
    );
    const response = await task.uploadAsync();
    if (!response || response.status < 200 || response.status >= 300) throw new Error("The upload was refused. Try again.");
    return { etag: response.headers.ETag ?? response.headers.Etag ?? response.headers.etag };
  }
  // One part of a big file: read just that piece.
  const handle = new File(uri).open();
  try {
    handle.offset = from;
    const bytes = handle.readBytes(to - from);
    const response = await fetch(url, { method: "PUT", headers, body: bytes as unknown as BodyInit });
    if (!response.ok) throw new Error("The upload was refused. Try again.");
    onProgress(to - from);
    return { etag: response.headers.get("ETag") ?? undefined };
  } finally {
    handle.close();
  }
}
