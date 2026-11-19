// "Voice notes and calls" for one custom person: add a voice note or a call
// recording, say which voice is who, keep only their words, and (if you choose,
// with their permission) copy their voice for your calls with them.
// Shown under "What Debo learned" on each person in "People you made" (custom-people-ui.tsx).
import { createAudioPlayer } from "expo-audio";
import { Play, Plus } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { errorText } from "./debo-api";
import { pickRecording, sendRange } from "./debo-capture";
import { uploadRecording } from "./debo-upload";
import { Button, Card, CheckRow, colors, ErrorNotice, Segmented, s, spacing } from "./ui";
import {
  clock,
  type Label,
  labelsReady,
  type RecordingView,
  resultText,
  type Speaker,
  type VoiceState,
  voiceCopyApi,
} from "./voice-copy-data";
import { useWorkspace } from "./workspace";

/** Play a few seconds of the recording, from a short link the server made for its owner. */
function playSample(url: string, start: number, end: number) {
  const player = createAudioPlayer(url);
  void player.seekTo(start).then(() => player.play());
  setTimeout(() => {
    player.pause();
    player.remove();
  }, Math.max(1, end - start) * 1000);
}

function SpeakerRow({
  index,
  speaker,
  name,
  label,
  sampleUrl,
  onLabel,
}: {
  index: number;
  speaker: Speaker;
  name: string;
  label: Label | "";
  sampleUrl?: string | null;
  onLabel: (label: Label) => void;
}) {
  const sample = speaker.samples[0];
  return (
    <View style={{ gap: spacing[2], paddingTop: spacing[3], borderTopWidth: 1, borderTopColor: colors.line }}>
      <Text style={[s.text, { fontWeight: "600" }]}>
        Voice {index + 1}, talks for {clock(speaker.seconds)}
      </Text>
      {speaker.sampleLines.map((line) => (
        <Text key={line} style={s.muted}>
          “{line}”
        </Text>
      ))}
      {sampleUrl && sample ? (
        <Button small icon={Play} onPress={() => playSample(sampleUrl, sample.start, sample.end)}>
          {`Play a sample (from ${clock(sample.start)})`}
        </Button>
      ) : null}
      <Segmented<Label | "">
        label={`Who is voice ${index + 1}?`}
        options={[
          { id: "me", label: "Me" },
          { id: "them", label: name },
          { id: "other", label: "Someone else" },
        ]}
        value={label}
        onChange={(id) => id && onLabel(id)}
      />
    </View>
  );
}

function RecordingCard({
  recording,
  name,
  state,
  api,
  onDone,
}: {
  recording: RecordingView;
  name: string;
  state: VoiceState;
  api: ReturnType<typeof voiceCopyApi>;
  onDone: (note: string) => Promise<void>;
}) {
  const [labels, setLabels] = useState<Record<string, Label>>({});
  const [copy, setCopy] = useState(false);
  const [copyConsent, setCopyConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function finish() {
    setBusy(true);
    setError("");
    try {
      const result = await api.label(recording.id, labels, copy && copyConsent ? { consent: true } : undefined);
      await onDone(resultText(result, name));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function discard() {
    setBusy(true);
    try {
      await api.discard(recording.id);
      await onDone("Recording removed. Nothing from it was kept.");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const kind = recording.source === "call" ? "Call recording" : "Voice note";
  if (recording.status !== "ready")
    return (
      <Card style={{ gap: spacing[2] }}>
        <Text style={[s.text, { fontWeight: "600" }]}>{kind}</Text>
        <Text style={s.muted} accessibilityLiveRegion="polite">
          {recording.status === "failed"
            ? recording.message
            : recording.status === "uploading"
              ? "This upload didn't finish. Remove it and add the file again."
              : "Telling the voices apart. This takes about a minute."}
        </Text>
        <ErrorNotice error={error} />
        {recording.status === "failed" || recording.status === "uploading" ? (
          <Button small busy={busy} onPress={() => void discard()}>
            Remove this recording
          </Button>
        ) : null}
      </Card>
    );

  return (
    <Card style={{ gap: spacing[3] }}>
      <Text style={[s.text, { fontWeight: "600" }]}>{kind}: who is talking?</Text>
      <Text style={s.muted}>
        I found {recording.speakers.length} {recording.speakers.length === 1 ? "voice" : "voices"}. Pick which one is {name}. I keep
        only {name}'s words, and throw the other voices away.
      </Text>
      {recording.speakers.map((speaker, index) => (
        <SpeakerRow
          key={speaker.speaker}
          index={index}
          speaker={speaker}
          name={name}
          label={labels[speaker.speaker] ?? ""}
          sampleUrl={recording.sampleUrl}
          onLabel={(label) => setLabels({ ...labels, [speaker.speaker]: label })}
        />
      ))}
      <View style={{ gap: spacing[2], paddingTop: spacing[3], borderTopWidth: 1, borderTopColor: colors.line }}>
        <CheckRow label={`Also copy ${name}'s voice for my calls with them`} checked={copy} onPress={() => setCopy(!copy)} />
        {copy ? (
          <View style={{ gap: spacing[2] }}>
            {!recording.canCopyVoice ? (
              <Text style={s.small}>
                I can't cut a voice sample from this kind of file. Their words are still used. For a voice copy, add a voice note,
                an mp3 or a wav file.
              </Text>
            ) : null}
            {state.key === "none" ? <Text style={s.small}>{state.message}</Text> : null}
            <Text style={s.small}>
              I send a short clip of only {name}'s voice (10 to 30 seconds) to Cartesia, the voice service Debo's calls use.
              Cartesia keeps a private voice model until you remove the voice copy or delete {name}. Every call in this voice
              starts by saying it's an AI version. It is never used outside your own calls.
            </Text>
            <CheckRow label={state.consentText} checked={copyConsent} onPress={() => setCopyConsent(!copyConsent)} />
          </View>
        ) : null}
      </View>
      <ErrorNotice error={error} />
      <View style={[s.row, { gap: spacing[2], flexWrap: "wrap" }]}>
        <Button primary busy={busy} disabled={!labelsReady(labels) || (copy && !copyConsent)} onPress={() => void finish()}>
          {`Keep ${name}'s words`}
        </Button>
        <Button busy={busy} onPress={() => void discard()}>
          Remove this recording
        </Button>
      </View>
    </Card>
  );
}

/** Voice notes and calls of one custom person, and their voice copy. */
export function VoiceRecordingsPanel({ personId, name }: { personId: string; name: string }) {
  const { api: fuse } = useWorkspace();
  const api = useRef(voiceCopyApi(fuse, personId)).current;
  const [state, setState] = useState<VoiceState>();
  const [recordings, setRecordings] = useState<RecordingView[]>([]);
  const [available, setAvailable] = useState(true);
  const [consent, setConsent] = useState(false);
  const [kind, setKind] = useState<"voice-note" | "call">("voice-note");
  const [progress, setProgress] = useState<number>();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  /** Removing the copied voice asks once more: it may not be possible to make it again. */
  const [sureRemove, setSureRemove] = useState(false);

  const load = useCallback(async () => {
    try {
      const [voice, list] = await Promise.all([api.voice(), api.list()]);
      // The sample link comes with each recording's own status.
      const ready = await Promise.all(list.uploads.map((u) => (u.status === "ready" ? api.status(u.id) : u)));
      setState(voice);
      setAvailable(list.available);
      setRecordings(ready);
      setError("");
    } catch (e) {
      setError(errorText(e));
    }
  }, [api]);
  useEffect(() => {
    void load();
  }, [load]);
  // While voices are being told apart, look again every few seconds.
  const working = recordings.some((r) => r.status === "waiting" || r.status === "working");
  useEffect(() => {
    if (!working) return;
    const timer = setInterval(() => void load(), 4000);
    return () => clearInterval(timer);
  }, [working, load]);

  async function add() {
    setError("");
    setNote("");
    const capture = await pickRecording();
    if (!capture) return;
    if (!capture.mimeType.startsWith("audio/") && !capture.mimeType.startsWith("video/")) {
      setError("That isn't a sound file. Pick a voice note or a call recording.");
      return;
    }
    setProgress(0);
    try {
      await uploadRecording(api.uploader(kind), sendRange, capture, { onProgress: setProgress });
      setNote("Added. I'm telling the voices apart now.");
      await load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setProgress(undefined);
    }
  }

  async function removeVoice() {
    setBusy(true);
    setError("");
    try {
      const answer = await api.removeVoice();
      setNote(answer.message ?? `Voice copy removed, here and at Cartesia. Calls with ${name} use a Debo voice again.`);
      await load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card style={{ gap: spacing[3] }}>
      <Text style={s.heading}>Voice notes and calls</Text>
      <Text style={s.muted}>
        Add voice notes or call recordings with {name} in them. I tell the voices apart, you say which one is {name}, and I keep
        only {name}'s words to learn how they talk. The recording itself is deleted when we're done, or after 24 hours.
      </Text>
      {!available ? (
        <Text style={s.small}>Adding recordings is not turned on in this Debo yet.</Text>
      ) : (
        <View style={{ gap: spacing[2] }}>
          <Segmented<"voice-note" | "call">
            label="What are you adding?"
            options={[
              { id: "voice-note", label: "Voice note" },
              { id: "call", label: "Call recording" },
            ]}
            value={kind}
            onChange={setKind}
          />
          {state ? <CheckRow label={state.audioConsentText} checked={consent} onPress={() => setConsent(!consent)} /> : null}
          <Button icon={Plus} primary disabled={!consent} busy={progress !== undefined} onPress={() => void add()}>
            Add a recording
          </Button>
          {progress !== undefined ? (
            <Text style={s.small} accessibilityLiveRegion="polite">
              Sending… {Math.round(progress * 100)}%
            </Text>
          ) : null}
        </View>
      )}
      <Text style={s.small} accessibilityLiveRegion="polite">
        {note}
      </Text>
      <ErrorNotice error={error} onRetry={() => void load()} />
      {state
        ? recordings.map((r) => (
            <RecordingCard
              key={r.id}
              recording={r}
              name={name}
              state={state}
              api={api}
              onDone={async (text) => {
                setNote(text);
                await load();
              }}
            />
          ))
        : null}
      {state?.copied ? (
        <View style={{ gap: spacing[2], paddingTop: spacing[3], borderTopWidth: 1, borderTopColor: colors.line }}>
          <Text style={s.text}>
            Calls with {name} use a copied voice. Each call starts by saying it's an AI version of {name}.
          </Text>
          {sureRemove ? (
            <View accessibilityRole="alert" style={{ gap: spacing[2] }}>
              <Text style={s.text}>
                {`Remove ${name}'s copied voice? You would need a new recording to make it again.`}
              </Text>
              <View style={[s.row, { gap: spacing[2], flexWrap: "wrap" }]}>
                <Button danger busy={busy} onPress={() => void removeVoice().then(() => setSureRemove(false))}>
                  Yes, remove the voice copy
                </Button>
                <Button disabled={busy} onPress={() => setSureRemove(false)}>
                  Keep it
                </Button>
              </View>
            </View>
          ) : (
            <Button danger disabled={busy} onPress={() => setSureRemove(true)}>
              Remove voice copy
            </Button>
          )}
        </View>
      ) : null}
    </Card>
  );
}
