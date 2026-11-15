// Phone: play a voice note with expo-audio (play, pause, back 15 seconds, and
// where you are in it), and a video in a small web view that uses the phone's
// own video controls. Also the camera picture while a video is recorded.
// See os/docs/JOURNAL-MEDIA.md.
//
// Not run on a device yet: typechecked, and the Android build is made by CI.
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { CameraView } from "expo-camera";
import { Pause, Play, RotateCcw } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { Platform, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import { errorText } from "./debo-api";
import type { CameraHandle, CameraRecorder } from "./debo-capture.native";
import type { LiveRecording } from "./debo-capture-types";
import { formatDuration } from "./debo-data";
import { Button, colors, IconButton, radius, s, spacing } from "./ui";

type Props = {
  kind: "voice" | "video";
  /** Something to play right now (a recording not saved yet). */
  src?: string;
  /** Or a way to get a short-lived link when the person presses Play (a saved recording). */
  load?: () => Promise<string>;
  label: string;
};

export function RecordingPlayer({ kind, src, load, label }: Props) {
  const [url, setUrl] = useState(src);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => setUrl(src), [src]);

  if (!url) {
    return (
      <View style={{ gap: spacing[2] }}>
        <Button
          small
          icon={Play}
          busy={busy}
          onPress={() => {
            setBusy(true);
            setError("");
            (load?.() ?? Promise.reject(new Error("No recording.")))
              .then(setUrl)
              .catch((e) => setError(errorText(e)))
              .finally(() => setBusy(false));
          }}
        >
          {kind === "video" ? "Play video" : "Play voice note"}
        </Button>
        {!!error && <Text style={[s.small, { color: colors.danger }]}>{error}</Text>}
      </View>
    );
  }
  return kind === "video" ? (
    <VideoPlayer url={url} label={label} autoPlay={!src} />
  ) : (
    <VoicePlayer url={url} label={label} autoPlay={!src} />
  );
}

function VoicePlayer({ url, label, autoPlay }: { url: string; label: string; autoPlay: boolean }) {
  const player = useAudioPlayer(url);
  const status = useAudioPlayerStatus(player);
  const started = useRef(false);

  const play = () => {
    void setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
    // At the end: start again from the top.
    if (status.duration > 0 && status.currentTime >= status.duration - 0.25) void player.seekTo(0);
    player.play();
  };

  useEffect(() => {
    if (autoPlay && status.isLoaded && !started.current) {
      started.current = true;
      play();
    }
    // biome-ignore lint/correctness/useExhaustiveDependencies: play reads the latest status
  }, [autoPlay, status.isLoaded]);

  const where = `${formatDuration(status.currentTime * 1000)}${status.duration > 0 ? ` of ${formatDuration(status.duration * 1000)}` : ""}`;
  return (
    <View
      accessibilityLabel={label}
      style={[
        s.row,
        { gap: spacing[2], padding: spacing[2], borderRadius: radius.container, backgroundColor: colors.card },
      ]}
    >
      <IconButton
        icon={status.playing ? Pause : Play}
        label={status.playing ? "Pause" : "Play"}
        onPress={() => (status.playing ? player.pause() : play())}
      />
      <IconButton
        icon={RotateCcw}
        label="Back 15 seconds"
        onPress={() => void player.seekTo(Math.max(0, status.currentTime - 15))}
      />
      <Text style={s.small} accessibilityLiveRegion="none">
        {status.isLoaded ? where : "Loading…"}
      </Text>
    </View>
  );
}

const attr = (value: string) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/** The phone's own video player inside a small web view. No scripts run in it. */
function VideoPlayer({ url, label, autoPlay }: { url: string; label: string; autoPlay: boolean }) {
  const local = url.startsWith("file:");
  const folder = url.slice(0, url.lastIndexOf("/") + 1);
  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:${colors.ink}"><video src="${attr(url)}" controls playsinline ${autoPlay ? "autoplay" : ""} preload="metadata" aria-label="${attr(label)}" style="width:100%;height:100vh;object-fit:contain"></video></body></html>`;
  // iPhone: a file the app recorded is opened straight, with read access to its folder only.
  const source = local && Platform.OS === "ios" ? { uri: url } : { html, baseUrl: local ? folder : undefined };
  return (
    <View
      accessibilityLabel={label}
      style={{ height: 260, borderRadius: radius.container, overflow: "hidden", backgroundColor: colors.ink }}
    >
      <WebView
        source={source}
        originWhitelist={["*"]}
        javaScriptEnabled={false}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={!autoPlay}
        allowFileAccess={local}
        allowingReadAccessToURL={local ? folder : undefined}
        style={{ backgroundColor: colors.ink }}
      />
    </View>
  );
}

/** The camera picture while a video is being recorded. Recording starts when it is showing. */
export function LivePreview({ recording }: { recording: LiveRecording }) {
  const camera = useRef<CameraView>(null);
  const recorder = recording.stream as CameraRecorder | undefined;
  const [problem, setProblem] = useState("");
  if (recorder?.kind !== "camera") return null;
  return (
    <View style={{ gap: spacing[2] }}>
      <View style={{ height: 280, borderRadius: radius.container, overflow: "hidden", backgroundColor: colors.ink }}>
        <CameraView
          ref={camera}
          style={{ flex: 1 }}
          facing="front"
          mode="video"
          mute={false}
          videoQuality="720p"
          accessibilityLabel="What the camera sees"
          onCameraReady={() => {
            if (camera.current) recorder.ready(camera.current as CameraHandle);
          }}
          onMountError={() => setProblem("The camera didn't start. Cancel, then try again.")}
        />
      </View>
      {!!problem && <Text style={[s.small, { color: colors.danger }]}>{problem}</Text>}
    </View>
  );
}
