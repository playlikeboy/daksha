// Web: the browser's own audio and video players, which already have play,
// pause, a scrub bar, volume and keyboard control. The entry page's player
// (EntryPlayer) draws its own controls for a voice note, around a hidden audio element.
import { Download, Pause, Play, RotateCcw, RotateCw } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { Text } from "./text";
import { errorText } from "./debo-api";
import { timeMark } from "./debo-data";
import { type EntryPlayerProps, SPEEDS, speedLabel } from "./debo-player-types";
import { Waveform } from "./debo-waveform";
import { peaksFromSamples, peaksFromSegments } from "./debo-waveform-data";
import { Button, colors, ErrorNotice, radius, s, Segmented, spacing } from "./ui";

export type { EntryPlayerProps, PlayerControl } from "./debo-player-types";

type Props = {
  kind: "voice" | "video";
  /** Something to play right now (a recording not saved yet). */
  src?: string;
  /** Or a way to get a short-lived link when the person presses Play (a saved recording). */
  load?: () => Promise<string>;
  label: string;
};

const mediaStyle = {
  width: "100%",
  borderRadius: radius.container,
  backgroundColor: colors.subtle,
  outlineColor: colors.blueDark,
} as const;

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
            load?.()
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
  const common = {
    src: url,
    controls: true,
    autoPlay: !src,
    preload: "metadata",
    "aria-label": label,
    style: mediaStyle,
    // A link that has run out: ask for a new one the next time Play is pressed.
    onError: () => {
      if (!src) {
        setUrl(undefined);
        setError("The link ran out. Press Play again.");
      }
    },
  };
  return kind === "video" ? (
    <video {...common} playsInline style={{ ...mediaStyle, maxHeight: 360 }} />
  ) : (
    <audio {...common} style={{ ...mediaStyle, height: spacing[11] }} />
  );
}

/** The camera picture before and while a video is recorded. Muted, so it does not echo. */
export function LivePreview({
  recording,
  fill,
  mirrored,
}: {
  recording: { stream?: unknown };
  /** Fill the space it is given (the full-screen recorder). */
  fill?: boolean;
  /** Show the front camera like a mirror, as people expect. The saved video is not flipped. */
  mirrored?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const stream = recording.stream as MediaStream | undefined;
  useEffect(() => {
    if (ref.current && stream) ref.current.srcObject = stream;
  }, [stream]);
  if (!stream) return null;
  return (
    <video
      ref={ref}
      autoPlay
      muted
      playsInline
      aria-label="What the camera sees"
      style={{
        ...mediaStyle,
        backgroundColor: colors.ink,
        ...(fill ? { height: "100%", objectFit: "cover", borderRadius: radius.none } : { maxHeight: 280 }),
        ...(mirrored ? { transform: "scaleX(-1)" } : {}),
      }}
    />
  );
}

/** Save the recording to this device. The file is fetched here so it gets a proper name. */
export async function downloadRecording(url: string, fileName: string, _mimeType?: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("I couldn't download that recording. Try again in a moment.");
  const href = URL.createObjectURL(await response.blob());
  const a = document.createElement("a");
  a.href = href;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
}

/** Files bigger than this are not read for their waveform: the bars show where words are instead. */
const WAVE_READ_MAX_BYTES = 30 * 1024 * 1024;

/** The real loudness of the sound, read once in the browser. Null when it cannot be read. */
async function readPeaks(url: string): Promise<number[] | null> {
  try {
    const head = await fetch(url, { headers: { Range: "bytes=0-0" } });
    const total = Number(head.headers.get("content-range")?.split("/")[1] ?? 0);
    if (total > WAVE_READ_MAX_BYTES) return null;
    const bytes = await (await fetch(url)).arrayBuffer();
    if (bytes.byteLength > WAVE_READ_MAX_BYTES) return null;
    const Context =
      globalThis.AudioContext ?? (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Context) return null;
    const context = new Context();
    try {
      const audio = await context.decodeAudioData(bytes);
      return peaksFromSamples(audio.getChannelData(0));
    } finally {
      void context.close().catch(() => {});
    }
  } catch {
    return null;
  }
}

/**
 * The entry page's player. A voice note: a big play button, the waveform as its scrub bar,
 * back and forward 15 seconds, speed and download. A video: the browser's own large player,
 * with speed and download under it. Both report the time so the transcript can follow.
 */
export function EntryPlayer({ kind, load, label, segments, durationMs, fileName, mimeType, control, onTime }: EntryPlayerProps) {
  const [url, setUrl] = useState<string>();
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [length, setLength] = useState((durationMs ?? 0) / 1000);
  const [rate, setRate] = useState(1);
  const [peaks, setPeaks] = useState<number[] | null>(null);
  const [saving, setSaving] = useState(false);
  const element = useRef<HTMLMediaElement | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: a new link only when asked again
  useEffect(() => {
    let live = true;
    setError("");
    load()
      .then((next) => live && setUrl(next))
      .catch((e) => live && setError(errorText(e)));
    return () => {
      live = false;
    };
  }, [attempt]);

  useEffect(() => {
    if (!url || kind !== "voice") return;
    let live = true;
    void readPeaks(url).then((p) => live && setPeaks(p));
    return () => {
      live = false;
    };
  }, [url, kind]);

  useEffect(() => {
    control.current = {
      seek(seconds, play = true) {
        const media = element.current;
        if (!media) return;
        media.currentTime = Math.max(0, seconds);
        setTime(media.currentTime);
        onTime(media.currentTime);
        if (play) void media.play().catch(() => {});
      },
    };
    return () => {
      control.current = null;
    };
  }, [control, onTime]);

  useEffect(() => {
    if (element.current) element.current.playbackRate = rate;
  }, [rate, url]);

  const bind = (media: HTMLMediaElement | null) => {
    element.current = media;
  };
  const lengthOf = (media: HTMLMediaElement) => {
    const d = media.duration;
    if (Number.isFinite(d) && d > 0) setLength(d);
  };
  const events = {
    onTimeUpdate: (e: { currentTarget: HTMLMediaElement }) => {
      setTime(e.currentTarget.currentTime);
      onTime(e.currentTarget.currentTime);
    },
    onLoadedMetadata: (e: { currentTarget: HTMLMediaElement }) => {
      lengthOf(e.currentTarget);
      e.currentTarget.playbackRate = rate;
    },
    onDurationChange: (e: { currentTarget: HTMLMediaElement }) => lengthOf(e.currentTarget),
    onPlay: () => setPlaying(true),
    onPause: () => setPlaying(false),
    onEnded: () => setPlaying(false),
    // A link that has run out: say so, and get a fresh one on Try again.
    onError: () => {
      setUrl(undefined);
      setError("The link to this recording ran out.");
    },
  };

  const toggle = () => {
    const media = element.current;
    if (!media) return;
    if (media.paused) void media.play().catch(() => {});
    else media.pause();
  };
  const jump = (by: number) => control.current?.seek(Math.min(length || time + by, Math.max(0, time + by)), playing);

  const tools = (
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
        disabled={!url}
        onPress={() => {
          if (!url) return;
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
  );

  if (error && !url)
    return <ErrorNotice error={`${error} Try again to get a fresh link.`} onRetry={() => setAttempt((n) => n + 1)} />;

  if (kind === "video")
    return (
      <View style={{ gap: spacing[3] }}>
        <View style={{ borderRadius: radius.page, overflow: "hidden", backgroundColor: colors.ink, aspectRatio: 16 / 9 }}>
          {url ? (
            <video
              ref={bind}
              src={url}
              controls
              playsInline
              preload="metadata"
              aria-label={label}
              style={{ width: "100%", height: "100%", objectFit: "contain", backgroundColor: colors.ink, outlineColor: colors.blueDark }}
              {...events}
            />
          ) : (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              <ActivityIndicator color={colors.onInk} />
            </View>
          )}
        </View>
        {tools}
        <ErrorNotice error={url ? error : ""} />
      </View>
    );

  const bars = peaks ?? peaksFromSegments(segments, length);
  return (
    <View style={{ gap: spacing[4] }}>
      {url && <audio ref={bind} src={url} preload="metadata" aria-label={label} style={{ display: "none" }} {...events} />}
      <View style={[s.row, { gap: spacing[4] }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={playing ? "Pause" : "Play"}
          disabled={!url}
          onPress={toggle}
          style={({ pressed }) => ({
            width: spacing[12] + spacing[4],
            height: spacing[12] + spacing[4],
            borderRadius: radius.full,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: colors.accent,
            opacity: url ? 1 : 0.5,
            transform: [{ scale: pressed ? 0.96 : 1 }],
          })}
        >
          {!url ? (
            <ActivityIndicator color={colors.onAccent} />
          ) : playing ? (
            <Pause size={26} color={colors.onAccent} fill={colors.onAccent} />
          ) : (
            <Play size={26} color={colors.onAccent} fill={colors.onAccent} style={{ marginLeft: spacing[1] }} />
          )}
        </Pressable>
        <View style={{ flex: 1, gap: spacing[1] }}>
          <Waveform
            peaks={bars}
            progress={length > 0 ? time / length : 0}
            durationSeconds={length}
            label={`Where you are in the ${label.toLowerCase()}`}
            onSeek={(f) => control.current?.seek(f * length, playing)}
          />
          <View style={s.between}>
            <Text style={[s.small, { fontVariant: ["tabular-nums"] }]}>{timeMark(time)}</Text>
            <Text style={[s.small, { fontVariant: ["tabular-nums"] }]}>{length > 0 ? timeMark(length) : ""}</Text>
          </View>
        </View>
      </View>
      <View style={[s.row, { gap: spacing[2], flexWrap: "wrap" }]}>
        <Button small icon={RotateCcw} disabled={!url} onPress={() => jump(-15)}>
          Back 15 seconds
        </Button>
        <Button small icon={RotateCw} disabled={!url} onPress={() => jump(15)}>
          Forward 15 seconds
        </Button>
      </View>
      {tools}
      {!peaks && segments.length > 0 && <Text style={s.small}>The bars show where words were said.</Text>}
      <ErrorNotice error={url ? error : ""} />
    </View>
  );
}
