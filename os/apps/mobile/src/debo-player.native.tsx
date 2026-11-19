// Phone: play a voice note with expo-audio (play, pause, back 15 seconds, and
// where you are in it), and a video in a small web view that uses the phone's
// own video controls. Also the camera picture while a video is recorded.
// See os/docs/JOURNAL-MEDIA.md.
//
// Not run on a device yet: typechecked, and the Android build is made by CI.
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { CameraView } from "expo-camera";
import * as LegacyFileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Download, Pause, Play, RotateCcw, RotateCw } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, Pressable, View } from "react-native";
import { Text } from "./text";
import { WebView } from "react-native-webview";
import { errorText } from "./debo-api";
import type { CameraHandle, CameraRecorder } from "./debo-capture.native";
import { formatDuration, timeMark } from "./debo-data";
import { type EntryPlayerProps, SPEEDS, speedLabel } from "./debo-player-types";
import { Waveform } from "./debo-waveform";
import { peaksFromSegments } from "./debo-waveform-data";
import { Button, colors, ErrorNotice, IconButton, radius, s, Segmented, spacing } from "./ui";

export type { EntryPlayerProps, PlayerControl } from "./debo-player-types";

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

/** The camera picture before and while a video is recorded. Recording starts when it is showing. */
export function LivePreview({
  recording,
  fill,
}: {
  recording: { stream?: unknown };
  /** Fill the space it is given (the full-screen recorder). */
  fill?: boolean;
  /** The web mirrors the front camera; the phone's camera view already does. */
  mirrored?: boolean;
}) {
  const camera = useRef<CameraView>(null);
  const recorder = recording.stream as CameraRecorder | undefined;
  const [problem, setProblem] = useState("");
  if (recorder?.kind !== "camera") return null;
  return (
    <View style={{ gap: spacing[2], ...(fill ? { flex: 1 } : {}) }}>
      <View
        style={{
          ...(fill ? { flex: 1 } : { height: 280, borderRadius: radius.container }),
          overflow: "hidden",
          backgroundColor: colors.ink,
        }}
      >
        <CameraView
          // A new camera when it flips, so the recording uses the side the person picked.
          key={recorder.facing}
          ref={camera}
          style={{ flex: 1 }}
          facing={recorder.facing === "environment" ? "back" : "front"}
          mode="video"
          mute={false}
          videoQuality="720p"
          accessibilityLabel="What the camera sees"
          onCameraReady={() => {
            if (camera.current) recorder.ready(camera.current as CameraHandle);
          }}
          onMountError={() => setProblem("The camera didn't start. Close this, then try again.")}
        />
      </View>
      {!!problem && <Text style={[s.small, { color: colors.danger }]}>{problem}</Text>}
    </View>
  );
}

/** Save the recording: it is downloaded to the app's cache, then the phone's share sheet saves or sends it. */
export async function downloadRecording(url: string, fileName: string, mimeType?: string): Promise<void> {
  const target = `${LegacyFileSystem.cacheDirectory ?? ""}${fileName}`;
  const result = await LegacyFileSystem.downloadAsync(url, target);
  if (result.status < 200 || result.status >= 300) throw new Error("I couldn't download that recording. Try again in a moment.");
  if (!(await Sharing.isAvailableAsync())) throw new Error("This phone can't save files from here.");
  await Sharing.shareAsync(result.uri, { mimeType, dialogTitle: "Save your recording" });
}

/**
 * The entry page's player on the phone. A voice note plays with expo-audio and its own
 * controls (play, the bar, 15 seconds back and forward, speed). A video plays in a web view
 * with a few lines of script of our own, so the transcript can jump in it.
 */
export function EntryPlayer(props: EntryPlayerProps) {
  const [url, setUrl] = useState<string>();
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new link only when asked again
  useEffect(() => {
    let live = true;
    setError("");
    props
      .load()
      .then((next) => live && setUrl(next))
      .catch((e) => live && setError(errorText(e)));
    return () => {
      live = false;
    };
  }, [attempt]);
  if (error && !url) return <ErrorNotice error={error} onRetry={() => setAttempt((n) => n + 1)} />;
  if (!url)
    return (
      <View style={{ height: spacing[12] * 2, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.blueDark} />
      </View>
    );
  return props.kind === "video" ? <EntryVideo {...props} url={url} /> : <EntryVoice {...props} url={url} />;
}

function PlayerTools({ url, rate, setRate, fileName, mimeType }: { url: string; rate: number; setRate: (r: number) => void; fileName: string; mimeType: string }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  return (
    <View style={{ gap: spacing[2] }}>
      <View style={[s.row, { gap: spacing[2], flexWrap: "wrap", justifyContent: "space-between" }]}>
        <Segmented
          label="Playback speed"
          options={SPEEDS.map((r) => ({ id: String(r), label: speedLabel(r) }))}
          value={String(rate)}
          onChange={(id) => setRate(Number(id))}
        />
        <Button
          small
          icon={Download}
          busy={saving}
          onPress={() => {
            setSaving(true);
            setError("");
            downloadRecording(url, fileName, mimeType)
              .catch((e) => setError(errorText(e)))
              .finally(() => setSaving(false));
          }}
        >
          Download
        </Button>
      </View>
      <ErrorNotice error={error} />
    </View>
  );
}

function EntryVoice({ url, label, segments, durationMs, fileName, mimeType, control, onTime }: EntryPlayerProps & { url: string }) {
  const player = useAudioPlayer(url);
  const status = useAudioPlayerStatus(player);
  const [rate, setRate] = useState(1);
  const length = status.duration > 0 ? status.duration : (durationMs ?? 0) / 1000;

  useEffect(() => {
    control.current = {
      seek(seconds, play = true) {
        void player.seekTo(Math.max(0, seconds));
        onTime(seconds);
        if (play) {
          void setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
          player.play();
        }
      },
    };
    return () => {
      control.current = null;
    };
  }, [control, player, onTime]);
  useEffect(() => onTime(status.currentTime), [status.currentTime, onTime]);
  useEffect(() => player.setPlaybackRate(rate), [player, rate]);

  const play = () => {
    void setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
    if (length > 0 && status.currentTime >= length - 0.25) void player.seekTo(0);
    player.play();
  };
  const jump = (by: number) => void player.seekTo(Math.max(0, Math.min(length || Infinity, status.currentTime + by)));

  return (
    <View style={{ gap: spacing[4] }} accessibilityLabel={label}>
      <View style={[s.row, { gap: spacing[4] }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={status.playing ? "Pause" : "Play"}
          onPress={() => (status.playing ? player.pause() : play())}
          style={({ pressed }) => ({
            width: spacing[12] + spacing[4],
            height: spacing[12] + spacing[4],
            borderRadius: radius.full,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: colors.accent,
            transform: [{ scale: pressed ? 0.96 : 1 }],
          })}
        >
          {status.playing ? (
            <Pause size={26} color={colors.onAccent} fill={colors.onAccent} />
          ) : (
            <Play size={26} color={colors.onAccent} fill={colors.onAccent} style={{ marginLeft: spacing[1] }} />
          )}
        </Pressable>
        <View style={{ flex: 1, gap: spacing[1] }}>
          <Waveform
            peaks={peaksFromSegments(segments, length)}
            progress={length > 0 ? status.currentTime / length : 0}
            durationSeconds={length}
            label={`Where you are in the ${label.toLowerCase()}`}
            onSeek={(f) => void player.seekTo(f * length)}
          />
          <View style={s.between}>
            <Text style={[s.small, { fontVariant: ["tabular-nums"] }]}>{timeMark(status.currentTime)}</Text>
            <Text style={[s.small, { fontVariant: ["tabular-nums"] }]}>{length > 0 ? timeMark(length) : ""}</Text>
          </View>
        </View>
      </View>
      <View style={[s.row, { gap: spacing[2], flexWrap: "wrap" }]}>
        <Button small icon={RotateCcw} onPress={() => jump(-15)}>
          Back 15 seconds
        </Button>
        <Button small icon={RotateCw} onPress={() => jump(15)}>
          Forward 15 seconds
        </Button>
      </View>
      <PlayerTools url={url} rate={rate} setRate={setRate} fileName={fileName} mimeType={mimeType} />
      {segments.length > 0 && <Text style={s.small}>The bars show where words were said.</Text>}
    </View>
  );
}

/** Our own page in the web view: the video, and a small bridge for its time, seeking and speed. */
function videoPage(url: string, label: string) {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:${colors.ink}"><video id="v" src="${attr(url)}" controls playsinline preload="metadata" aria-label="${attr(label)}" style="width:100%;height:100vh;object-fit:contain"></video><script>
var v=document.getElementById("v");function send(){window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(String(v.currentTime))}
v.addEventListener("timeupdate",send);v.addEventListener("seeked",send);
window.deboSeek=function(t,p){v.currentTime=t;if(p)v.play()};window.deboRate=function(r){v.playbackRate=r};
</script></body></html>`;
}

function EntryVideo({ url, label, fileName, mimeType, control, onTime }: EntryPlayerProps & { url: string }) {
  const view = useRef<WebView>(null);
  const [rate, setRate] = useState(1);
  useEffect(() => {
    control.current = {
      seek(seconds, play = true) {
        view.current?.injectJavaScript(`window.deboSeek(${Number(seconds) || 0}, ${play ? "true" : "false"}); true;`);
      },
    };
    return () => {
      control.current = null;
    };
  }, [control]);
  useEffect(() => {
    view.current?.injectJavaScript(`window.deboRate && window.deboRate(${rate}); true;`);
  }, [rate]);
  return (
    <View style={{ gap: spacing[3] }}>
      <View
        accessibilityLabel={label}
        style={{ aspectRatio: 16 / 9, borderRadius: radius.page, overflow: "hidden", backgroundColor: colors.ink }}
      >
        <WebView
          ref={view}
          source={{ html: videoPage(url, label) }}
          originWhitelist={["*"]}
          javaScriptEnabled
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction
          onMessage={(e) => {
            const t = Number(e.nativeEvent.data);
            if (Number.isFinite(t)) onTime(t);
          }}
          style={{ backgroundColor: colors.ink }}
        />
      </View>
      <PlayerTools url={url} rate={rate} setRate={setRate} fileName={fileName} mimeType={mimeType} />
    </View>
  );
}

