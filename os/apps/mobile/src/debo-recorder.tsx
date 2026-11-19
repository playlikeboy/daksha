// The full-screen recorder for a voice note or a video.
//
// Get ready (see the level or the camera, pick a microphone or camera, flip the camera),
// record (big timer, live level, pause, stop, throw away), then review (play it back,
// give it a title and a day, record again) and save with upload progress.
// The screen stays on while recording. Leaving mid-way asks first.
// Nothing leaves the device until "Save recording".
import { Circle, Pause, Play, RefreshCw, Square, SwitchCamera, Trash2, Upload, X } from "lucide-react-native";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal, Platform, Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import { Text } from "./text";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { deboApi, errorText } from "./debo-api";
import {
  type Capture,
  type InputDevice,
  type LiveRecording,
  listInputs,
  openPreview,
  type Preview,
  recordingSupport,
  releaseCapture,
  sendRange,
  startRecording,
} from "./debo-capture";
import { type DeboStatus, type EntryView, fileProblem, formatDuration, formatSize, happenedAtFor, todayInput } from "./debo-data";
import { DayField } from "./debo-day-field";
import { useReducedMotion } from "./debo-face";
import { useKeepAwake, useWarnBeforeLeaving } from "./debo-keep-awake";
import { LivePreview, RecordingPlayer } from "./debo-player";
import { uploadRecording } from "./debo-upload";
import { LevelBars } from "./debo-waveform";
import { pushLevel } from "./debo-waveform-data";
import { Button, colors, ErrorNotice, Field, fontSize, radius, s, spacing } from "./ui";
import { useWorkspace } from "./workspace";

type Stage = "setup" | "recording" | "paused" | "review" | "saving";

export function Recorder({
  kind,
  status,
  onClose,
  onSaved,
}: {
  kind: "voice" | "video";
  status: DeboStatus;
  onClose: () => void;
  onSaved: (entry: EntryView) => void;
}) {
  const { api, notify } = useWorkspace();
  const debo = useMemo(() => deboApi(api), [api]);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const support = recordingSupport();
  const canPause = kind === "video" ? !!support.pause?.video : !!support.pause?.voice;
  const maxMs = status.limits.maxMinutes * 60_000;
  const video = kind === "video";

  const [stage, setStage] = useState<Stage>("setup");
  const [preview, setPreview] = useState<Preview>();
  const [live, setLive] = useState<LiveRecording>();
  const [elapsed, setElapsed] = useState(0);
  const [levels, setLevels] = useState<number[]>([]);
  const [devices, setDevices] = useState<InputDevice[]>([]);
  const [micId, setMicId] = useState<string>();
  const [cameraId, setCameraId] = useState<string>();
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [capture, setCapture] = useState<Capture>();
  const [title, setTitle] = useState("");
  const [day, setDay] = useState(todayInput());
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState<"discard" | "leave">();
  const previewRef = useRef<Preview | undefined>(undefined);
  const liveRef = useRef<LiveRecording | undefined>(undefined);
  const captureRef = useRef<Capture | undefined>(undefined);
  /** Counts preview openings, so a slow one that is no longer wanted is closed at once. */
  const opening = useRef(0);

  const busy = stage === "recording" || stage === "paused" || stage === "review" || stage === "saving";
  useKeepAwake(stage === "recording" || stage === "paused" || stage === "saving");
  useWarnBeforeLeaving(busy);

  const closePreview = useCallback(() => {
    previewRef.current?.close();
    previewRef.current = undefined;
    setPreview(undefined);
  }, []);

  // Get ready: the microphone (and camera) on, so the level and picture show before recording.
  const ready = useCallback(async () => {
    setError("");
    closePreview();
    const ticket = ++opening.current;
    try {
      const next = await openPreview(kind, { micId, cameraId, facing });
      // A newer choice (or closing the recorder) came first: this one is not wanted.
      if (ticket !== opening.current) {
        next.close();
        return;
      }
      previewRef.current = next;
      setPreview(next);
      if (support.chooseInputs) setDevices(await listInputs());
    } catch (e) {
      setError(errorText(e));
    }
    // biome-ignore lint/correctness/useExhaustiveDependencies: support is read once per render and does not change
  }, [kind, micId, cameraId, facing, closePreview]);

  useEffect(() => {
    if (stage === "setup") void ready();
  }, [stage, ready]);

  // Whatever happens, the mic and camera go off and the preview is released when this closes.
  useEffect(
    () => () => {
      opening.current += 1;
      liveRef.current?.cancel();
      previewRef.current?.close();
      if (captureRef.current) releaseCapture(captureRef.current);
    },
    [],
  );

  // The live level: a few readings a second.
  useEffect(() => {
    const source = live ?? preview;
    if (!source?.level || stage === "paused") return;
    const timer = setInterval(() => setLevels((h) => pushLevel(h, source.level?.() ?? 0)), reduceMotion ? 250 : 90);
    return () => clearInterval(timer);
  }, [live, preview, stage, reduceMotion]);

  const keep = (next: Capture | undefined) => {
    if (captureRef.current && captureRef.current !== next) releaseCapture(captureRef.current);
    captureRef.current = next;
    setCapture(next);
  };

  async function begin() {
    setError("");
    setConfirm(undefined);
    // A preview still opening is not wanted any more.
    opening.current += 1;
    try {
      const recording = await startRecording(kind, setElapsed, { micId, cameraId, facing, preview: previewRef.current });
      // The recording now owns the preview's microphone and camera.
      previewRef.current = undefined;
      liveRef.current = recording;
      setLive(recording);
      setElapsed(0);
      setLevels([]);
      setStage("recording");
    } catch (e) {
      setError(errorText(e));
    }
  }

  async function finish() {
    const recording = liveRef.current;
    if (!recording) return;
    liveRef.current = undefined;
    setConfirm(undefined);
    try {
      const result = await recording.stop();
      setLive(undefined);
      setPreview(undefined);
      const problem = fileProblem(result, status.limits);
      if (problem) {
        releaseCapture(result);
        setError(problem);
        setStage("setup");
        return;
      }
      keep(result);
      setStage("review");
    } catch (e) {
      setLive(undefined);
      setError(errorText(e));
      setStage("setup");
    }
  }

  function throwAway() {
    liveRef.current?.cancel();
    liveRef.current = undefined;
    setLive(undefined);
    keep(undefined);
    setConfirm(undefined);
    setElapsed(0);
    setLevels([]);
    setStage("setup");
  }

  function leave() {
    liveRef.current?.cancel();
    liveRef.current = undefined;
    closePreview();
    keep(undefined);
    onClose();
  }

  // The hour limit: stop on our own, and say so.
  useEffect(() => {
    if (stage === "recording" && elapsed >= maxMs) {
      notify(`That is ${status.limits.maxMinutes} minutes, the longest one recording can be. It stopped by itself.`);
      void finish();
    }
    // biome-ignore lint/correctness/useExhaustiveDependencies: finish reads refs only
  }, [elapsed, stage, maxMs]);

  async function save() {
    if (!capture) return;
    setStage("saving");
    setError("");
    setProgress(0);
    try {
      const entry = await uploadRecording(debo, sendRange, capture, {
        happenedAt: happenedAtFor(day),
        title,
        onProgress: setProgress,
      });
      notify(video ? "Video saved. I am writing out what was said." : "Voice note saved. I am writing out what was said.");
      keep(undefined);
      onSaved(entry);
    } catch (e) {
      // The recording is still here, so the person can try again without recording it twice.
      setError(errorText(e));
      setStage("review");
    }
  }

  const askToClose = () => {
    if (stage === "saving") return;
    if (busy) setConfirm("leave");
    else leave();
  };

  const dark = video && stage !== "review" && stage !== "saving";
  const ink = dark ? colors.onInk : colors.text;
  const subtle = dark ? colors.onInk : colors.muted;
  const recordingNow = stage === "recording" || stage === "paused";
  const mics = devices.filter((d) => d.kind === "mic");
  const cameras = devices.filter((d) => d.kind === "camera");
  const timerSize = width < 400 ? fontSize["5xl"] : fontSize["5xl"] + spacing[5];

  return (
    <Modal visible animationType={reduceMotion ? "none" : "slide"} onRequestClose={askToClose} presentationStyle="fullScreen">
      <View
        accessibilityViewIsModal
        style={{
          flex: 1,
          backgroundColor: dark ? colors.ink : colors.canvas,
          paddingTop: insets.top,
          paddingBottom: Math.max(insets.bottom, spacing[4]),
        }}
      >
        <View style={[s.between, { paddingHorizontal: spacing[4], minHeight: spacing[12] + spacing[4] }]}>
          <RoundIcon icon={X} label={busy ? "Close the recorder" : "Close"} onPress={askToClose} dark={dark} disabled={stage === "saving"} />
          <Text accessibilityRole="header" style={[s.heading, { color: ink }]}>
            {stage === "review" || stage === "saving" ? (video ? "Your video" : "Your voice note") : video ? "Record a video" : "Record a voice note"}
          </Text>
          <View style={{ width: spacing[11] }} />
        </View>

        {stage === "review" || stage === "saving" ? (
          <ScrollView contentContainerStyle={{ padding: spacing[5], gap: spacing[4], width: "100%", maxWidth: 560, alignSelf: "center" }}>
            {capture && (
              <>
                <RecordingPlayer
                  kind={capture.kind}
                  src={capture.previewUri}
                  label={video ? "Your new video" : "Your new voice note"}
                />
                <Text style={s.small}>
                  {capture.durationMs ? `${formatDuration(capture.durationMs)} · ` : ""}
                  {formatSize(capture.sizeBytes)} · not saved yet
                </Text>
              </>
            )}
            <Field
              label="Title (you can leave this empty)"
              value={title}
              onChangeText={setTitle}
              maxLength={120}
              placeholder={video ? "For example: Mum's birthday" : "For example: Thoughts after the walk"}
              editable={stage !== "saving"}
            />
            <DayField value={day} onChange={setDay} />
            <ErrorNotice error={error} />
            {stage === "saving" ? (
              <View accessibilityLiveRegion="polite" style={{ gap: spacing[2] }}>
                <Text style={s.text}>Saving your recording… {Math.round(progress * 100)}%</Text>
                <View
                  accessibilityRole="progressbar"
                  accessibilityLabel="Saving your recording"
                  accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
                  style={{ height: spacing[2], borderRadius: radius.full, backgroundColor: colors.line, overflow: "hidden" }}
                >
                  <View style={{ width: `${Math.round(progress * 100)}%`, height: "100%", backgroundColor: colors.accent }} />
                </View>
                <Text style={s.small}>Keep this open until it says saved.</Text>
              </View>
            ) : confirm ? (
              <ConfirmThrowAway
                leaving={confirm === "leave"}
                onYes={confirm === "leave" ? leave : throwAway}
                onNo={() => setConfirm(undefined)}
              />
            ) : (
              <View style={{ gap: spacing[2] }}>
                <Button primary icon={Upload} onPress={() => void save()}>
                  Save recording
                </Button>
                <View style={[s.row, { gap: spacing[2], flexWrap: "wrap" }]}>
                  <Button icon={RefreshCw} style={{ flexGrow: 1 }} onPress={() => setConfirm("discard")}>
                    Record again
                  </Button>
                  <Button danger icon={Trash2} style={{ flexGrow: 1 }} onPress={() => setConfirm("leave")}>
                    Throw it away
                  </Button>
                </View>
              </View>
            )}
            <Text style={s.small}>
              Kept privately; only you can play it. Daksha writes out the words with Cloudflare's speech service. Up to{" "}
              {Math.round(status.limits.maxBytes / (1024 * 1024))} MB and {status.limits.maxMinutes} minutes each.
            </Text>
          </ScrollView>
        ) : (
          <View style={{ flex: 1 }}>
            {video ? (
              <View style={{ flex: 1, marginHorizontal: width < 600 ? 0 : spacing[5], borderRadius: width < 600 ? 0 : radius.page, overflow: "hidden", backgroundColor: colors.ink }}>
                {(live ?? preview)?.stream ? (
                  <LivePreview recording={(live ?? preview) as { stream?: unknown }} fill mirrored={facing === "user" && !cameraId} />
                ) : (
                  <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: spacing[6] }}>
                    <Text style={[s.text, { color: colors.onInk, textAlign: "center" }]}>
                      {error ? "The camera is off." : "Starting the camera…"}
                    </Text>
                  </View>
                )}
                <View style={{ position: "absolute", top: spacing[4], left: 0, right: 0, alignItems: "center" }}>
                  <Timer elapsed={elapsed} stage={stage} size={fontSize["3xl"]} onDark pill />
                </View>
              </View>
            ) : (
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing[6], gap: spacing[6] }}>
                <Timer elapsed={elapsed} stage={stage} size={timerSize} />
                <View style={{ width: "100%", maxWidth: 520 }}>
                  {preview?.level || live?.level ? (
                    reduceMotion ? (
                      <SteadyMeter level={levels[levels.length - 1] ?? 0} />
                    ) : (
                      <LevelBars levels={levels.length ? levels : [0]} tint={stage === "paused" ? colors.lineStrong : colors.accent} />
                    )
                  ) : (
                    <View style={{ height: spacing[12] * 2 }} />
                  )}
                  <Text style={[s.small, { textAlign: "center", marginTop: spacing[3] }]}>
                    {stage === "paused"
                      ? "Paused. The microphone is still on, but nothing is being recorded."
                      : stage === "recording"
                        ? "Recording. Speak as you normally would."
                        : preview?.level
                          ? "Your microphone is on so you can see it hears you. Nothing is kept until you save."
                          : "Press Start recording below."}
                  </Text>
                </View>
              </View>
            )}

            <View style={{ paddingHorizontal: spacing[5], paddingTop: spacing[4], gap: spacing[4], width: "100%", maxWidth: 560, alignSelf: "center" }}>
              <ErrorNotice error={error} onRetry={stage === "setup" ? () => void ready() : undefined} />
              {confirm && (
                <View style={{ backgroundColor: colors.card, borderRadius: radius.page, padding: spacing[4] }}>
                  <ConfirmThrowAway leaving={confirm === "leave"} onYes={confirm === "leave" ? leave : throwAway} onNo={() => setConfirm(undefined)} />
                </View>
              )}
              {stage === "setup" && (mics.length > 1 || cameras.length > 1) && (
                <View style={[s.row, { gap: spacing[3], flexWrap: "wrap", justifyContent: "center" }]}>
                  {mics.length > 1 && (
                    <DevicePicker label="Microphone" devices={mics} value={micId} onChange={setMicId} dark={dark} />
                  )}
                  {video && cameras.length > 1 && (
                    <DevicePicker label="Camera" devices={cameras} value={cameraId} onChange={setCameraId} dark={dark} />
                  )}
                </View>
              )}
              {!confirm && (
                <View style={[s.row, { justifyContent: "space-evenly", alignItems: "flex-start" }]}>
                  {recordingNow ? (
                    <Control icon={Trash2} label="Throw away" onPress={() => setConfirm("discard")} dark={dark} />
                  ) : video ? (
                    <Control
                      icon={SwitchCamera}
                      label="Flip camera"
                      onPress={() => {
                        setCameraId(undefined);
                        setFacing((f) => (f === "user" ? "environment" : "user"));
                      }}
                      dark={dark}
                    />
                  ) : (
                    <View style={{ width: spacing[12] + spacing[8] }} />
                  )}
                  {recordingNow ? (
                    <Control icon={Square} label="Stop" onPress={() => void finish()} dark={dark} main />
                  ) : (
                    <Control
                      icon={Circle}
                      label="Start recording"
                      onPress={() => void begin()}
                      dark={dark}
                      main
                      record
                      disabled={!preview && !error && Platform.OS === "web"}
                    />
                  )}
                  {recordingNow && canPause ? (
                    stage === "paused" ? (
                      <Control
                        icon={Play}
                        label="Carry on"
                        onPress={() => {
                          live?.resume?.();
                          setStage("recording");
                        }}
                        dark={dark}
                      />
                    ) : (
                      <Control
                        icon={Pause}
                        label="Pause"
                        onPress={() => {
                          live?.pause?.();
                          setStage("paused");
                        }}
                        dark={dark}
                      />
                    )
                  ) : (
                    <View style={{ width: spacing[12] + spacing[8] }} />
                  )}
                </View>
              )}
              <Text style={[s.small, { color: subtle, textAlign: "center" }]}>
                Up to {status.limits.maxMinutes} minutes. The screen stays on while you record.
              </Text>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

function Timer({ elapsed, stage, size, onDark, pill }: { elapsed: number; stage: Stage; size: number; onDark?: boolean; pill?: boolean }) {
  const live = stage === "recording";
  const color = onDark ? colors.onInk : colors.text;
  return (
    <View
      // No live region: the time changes every second, and reading it out each time drowns everything else.
      accessibilityLabel={`${live ? "Recording" : stage === "paused" ? "Paused" : "Ready"}, ${formatDuration(elapsed)}`}
      style={[
        s.row,
        { gap: spacing[3] },
        pill && { backgroundColor: colors.ink, paddingHorizontal: spacing[4], paddingVertical: spacing[1.5], borderRadius: radius.full },
      ]}
    >
      {(live || stage === "paused") && (
        <View
          style={{
            width: spacing[3],
            height: spacing[3],
            borderRadius: radius.full,
            backgroundColor: live ? colors.stop : colors.lineStrong,
          }}
        />
      )}
      <Text style={{ color, fontSize: size, fontWeight: "600", letterSpacing: -1, fontVariant: ["tabular-nums"] }}>
        {formatDuration(elapsed)}
      </Text>
      {stage === "paused" && <Text style={[s.text, { color }]}>Paused</Text>}
    </View>
  );
}

/** With reduced motion: one steady bar for the level instead of a moving row. */
function SteadyMeter({ level }: { level: number }) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ height: spacing[3], borderRadius: radius.full, backgroundColor: colors.line, overflow: "hidden", marginVertical: spacing[12] }}
    >
      <View style={{ width: `${Math.round(Math.min(1, level) * 100)}%`, height: "100%", backgroundColor: colors.accent }} />
    </View>
  );
}

/** A big round control with its name written under it, so it is clear and easy to hit. */
function Control({
  icon: Icon,
  label,
  onPress,
  dark,
  main,
  record,
  disabled,
}: {
  icon: typeof Circle;
  label: string;
  onPress: () => void;
  dark?: boolean;
  main?: boolean;
  record?: boolean;
  disabled?: boolean;
}) {
  const size = main ? spacing[12] * 2 - spacing[4] : spacing[12] + spacing[4];
  const fill = record ? colors.stop : main ? (dark ? colors.card : colors.accent) : dark ? colors.accent : colors.card;
  const glyph = record ? colors.onStop : main ? (dark ? colors.text : colors.onAccent) : dark ? colors.onInk : colors.text;
  return (
    <View style={{ alignItems: "center", gap: spacing[2], width: spacing[12] + spacing[8] }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: !!disabled }}
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => ({
          width: size,
          height: size,
          borderRadius: radius.full,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: fill,
          borderWidth: record ? spacing[1] : 0,
          borderColor: dark ? colors.onInk : colors.card,
          opacity: disabled ? 0.5 : 1,
          transform: [{ scale: pressed ? 0.95 : 1 }],
        })}
      >
        <Icon size={main ? 30 : 22} color={glyph} fill={record || (main && Icon === Square) ? glyph : "transparent"} />
      </Pressable>
      <Text style={[s.small, { color: dark ? colors.onInk : colors.text, fontWeight: "600", textAlign: "center" }]}>{label}</Text>
    </View>
  );
}

function RoundIcon({ icon: Icon, label, onPress, dark, disabled }: { icon: typeof X; label: string; onPress: () => void; dark?: boolean; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        width: spacing[11],
        height: spacing[11],
        borderRadius: radius.full,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: pressed ? colors.line : dark ? colors.accent : colors.card,
        opacity: disabled ? 0.5 : 1,
      })}
    >
      <Icon size={20} color={dark ? colors.onInk : colors.text} />
    </Pressable>
  );
}

function ConfirmThrowAway({ leaving, onYes, onNo }: { leaving: boolean; onYes: () => void; onNo: () => void }) {
  return (
    <View accessibilityRole="alert" style={{ gap: spacing[3] }}>
      <Text style={s.text}>
        {leaving
          ? "Throw this recording away and close? It hasn't been saved, so it can't be got back."
          : "Throw this recording away and start again? It hasn't been saved, so it can't be got back."}
      </Text>
      <View style={[s.row, { gap: spacing[2], flexWrap: "wrap" }]}>
        <Button danger icon={Trash2} onPress={onYes}>
          Yes, throw it away
        </Button>
        <Button onPress={onNo}>Keep it</Button>
      </View>
    </View>
  );
}

/** Pick a microphone or camera (the web only: the phone picks its own). A plain browser select. */
function DevicePicker({
  label,
  devices,
  value,
  onChange,
  dark,
}: {
  label: string;
  devices: InputDevice[];
  value?: string;
  onChange: (id: string | undefined) => void;
  dark?: boolean;
}): ReactNode {
  if (Platform.OS !== "web") return null;
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: spacing[1], minWidth: 0, maxWidth: 260 }}>
      <Text style={[s.small, { color: dark ? colors.onInk : colors.text, fontWeight: "600" }]}>{label}</Text>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || undefined)}
        style={{
          minHeight: spacing[11],
          borderRadius: radius.container,
          border: `1px solid ${colors.inputBorder}`,
          background: colors.card,
          color: colors.text,
          fontSize: fontSize.base,
          fontFamily: "inherit",
          padding: `0 ${spacing[3]}px`,
          maxWidth: "100%",
        }}
      >
        <option value="">The usual one</option>
        {devices.map((d) => (
          <option key={d.id} value={d.id}>
            {d.label}
          </option>
        ))}
      </select>
    </label>
  );
}
