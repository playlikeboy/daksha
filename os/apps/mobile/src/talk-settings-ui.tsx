// "How <name> talks and what <they> know": voice, personality and context in one sheet.
// Reached from the menu, from the Apps screen and from the small settings button in the
// Talk popup. Every choice saves the moment it is tapped, except the notes, which have a
// Save button. The server checks everything again (apps/server/src/talk-settings.ts).
import { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useAgentWorkspace } from "./agent-workspace";
import { errorText } from "./debo-api";
import { useAssistantName } from "./debo-character-store";
import { PeopleSetting } from "./debo-people-setting";
import { RemindersSetting } from "./debo-reminders-setting";
import { PersonaSetting } from "./debo-persona-setting";
import { capital, usePronouns, useTalkSettingsName } from "./debo-pronouns";
import { Button, Card, colors, ErrorNotice, Field, LinkRow, radius, s, SectionHeading, Sheet, Skeleton, spacing } from "./ui";
import { OwnKeysSetting } from "./own-keys-ui";
import { useSettingsChanged } from "./settings-events";
import { useWorkspace } from "./workspace";
import { Brain, UserRound } from "lucide-react-native";

type Voice = { id: string; name: string; description: string; gender: string };
type Settings = {
  voice?: string;
  speed?: number;
  mood?: "playful" | "balanced" | "calm";
  length?: "short" | "balanced" | "detailed";
  language?: "match" | "english" | "hindi" | "hinglish";
  context?: string;
};
type Reply = {
  settings: Settings | null;
  voices: Voice[];
  voice: { voice: string; speed: number };
  limits: { contextMax: number };
};

const SPEEDS = [
  { label: "Slower", value: 0.9 },
  { label: "Normal", value: 1 },
  { label: "Faster", value: 1.15 },
];
const TONES = [
  { id: "warm", label: "Warm" },
  { id: "concise", label: "Short and clear" },
  { id: "thoughtful", label: "Thoughtful" },
] as const;
const MOODS = [
  { id: "playful", label: "Playful" },
  { id: "balanced", label: "Balanced" },
  { id: "calm", label: "Calm" },
] as const;
const LENGTHS = [
  { id: "short", label: "Talks less" },
  { id: "balanced", label: "In between" },
  { id: "detailed", label: "Talks more" },
] as const;
const LANGUAGES = [
  { id: "match", label: "Match me" },
  { id: "english", label: "English" },
  { id: "hindi", label: "Hindi" },
  { id: "hinglish", label: "Hinglish" },
] as const;

function Choices<T extends string>({
  label,
  options,
  value,
  onPick,
}: {
  label: string;
  options: readonly { id: T; label: string }[];
  value: T;
  onPick: (id: T) => void;
}) {
  return (
    <View style={{ gap: spacing[2] }}>
      <Text style={s.muted}>{label}</Text>
      <View accessibilityRole="radiogroup" accessibilityLabel={label} style={[s.row, { gap: spacing[2], flexWrap: "wrap" }]}>
        {options.map((o) => (
          <Button key={o.id} small primary={value === o.id} onPress={() => onPick(o.id)}>
            {o.label}
          </Button>
        ))}
      </View>
    </View>
  );
}

export function TalkSettingsSheet() {
  const { api, close, navigate } = useWorkspace();
  const { data, mutate } = useAgentWorkspace();
  const name = useAssistantName();
  const p = usePronouns();
  const settingsName = useTalkSettingsName();
  const [reply, setReply] = useState<Reply>();
  const [context, setContext] = useState("");
  const [saved, setSaved] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const next = await api.request<Reply>("/api/talk-settings");
      setReply(next);
      setContext(next.settings?.context ?? "");
    } catch (e) {
      setError(errorText(e));
    }
  }, [api]);
  useEffect(() => {
    void load();
  }, [load]);
  // A change made by asking in chat or on a call shows here too.
  useSettingsChanged(["talk-settings"], load);

  async function save(patch: Settings, note: string) {
    setBusy(true);
    setError("");
    try {
      await api.request<{ settings: Settings }>("/api/talk-settings", patch, "PUT");
      await load();
      setSaved(note);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function pickTone(tone: "warm" | "concise" | "thoughtful") {
    if (!data) return;
    setBusy(true);
    setError("");
    try {
      await mutate("/identity", { name: data.identity.name, tone });
      setSaved("Saved.");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const s1 = reply?.settings;
  const voiceId = reply?.voice.voice;
  const speed = reply?.voice.speed ?? 1;
  const contextMax = reply?.limits.contextMax ?? 1500;

  return (
    <Sheet
      title={settingsName}
      subtitle="Changes save as soon as you tap them."
      onClose={close}
    >
      {!reply && !error ? (
        <Skeleton label="Loading your settings" rows={3} />
      ) : !reply ? (
        <ErrorNotice error={error} onRetry={() => void load()} />
      ) : (
      <View style={{ gap: spacing[4] }}>
        <Card style={{ gap: spacing[3] }}>
          <SectionHeading title="Voice" />
          <Text style={s.muted}>
            Pick the voice you hear on calls. It starts on your next call. Samples are not built yet, so the
            description is the guide.
          </Text>
          <View accessibilityRole="radiogroup" accessibilityLabel="Voice" style={{ gap: spacing[2] }}>
            {reply?.voices.map((v) => {
              const picked = voiceId === v.id;
              return (
                <Pressable
                  key={v.id}
                  accessibilityRole="radio"
                  accessibilityLabel={`${v.name}. ${v.description}`}
                  accessibilityState={{ checked: picked, disabled: busy }}
                  disabled={busy}
                  onPress={() => void save({ voice: v.id }, `${v.name} will speak on your next call.`)}
                  style={{
                    padding: spacing[3],
                    borderRadius: radius.chat,
                    borderWidth: 1,
                    borderColor: picked ? colors.blueDark : colors.line,
                    backgroundColor: picked ? colors.sky : colors.card,
                    gap: spacing[1],
                    minHeight: spacing[11],
                  }}
                >
                  <Text style={[s.text, { fontWeight: "600" }]}>
                    {v.name}
                    {picked ? " (in use)" : ""}
                  </Text>
                  <Text style={s.muted}>{v.description}</Text>
                </Pressable>
              );
            })}
          </View>
          <Choices
            label={`How fast ${p.they} ${p.verb("speak")}`}
            options={SPEEDS.map((o) => ({ id: String(o.value), label: o.label }))}
            value={String(SPEEDS.reduce((a, b) => (Math.abs(b.value - speed) < Math.abs(a.value - speed) ? b : a)).value)}
            onPick={(id) => void save({ speed: Number(id) }, "Speed saved for your next call.")}
          />
        </Card>

        <Card style={{ gap: spacing[3] }}>
          <SectionHeading title="Personality" />
          <Choices
            label={`${capital(p.their)} tone`}
            options={TONES}
            value={(data?.identity.tone ?? "warm") as "warm" | "concise" | "thoughtful"}
            onPick={(id) => void pickTone(id)}
          />
          <Choices label={`${capital(p.their)} mood`} options={MOODS} value={s1?.mood ?? "balanced"} onPick={(id) => void save({ mood: id }, "Saved.")} />
          <Choices label={`How much ${p.they} ${p.verb("say")}`} options={LENGTHS} value={s1?.length ?? "balanced"} onPick={(id) => void save({ length: id }, "Saved.")} />
          <Choices label="Language" options={LANGUAGES} value={s1?.language ?? "match"} onPick={(id) => void save({ language: id }, "Saved.")} />
          <LinkRow
            icon={UserRound}
            title="Name, face and colour"
            detail="Choose who you talk to"
            onPress={() => {
              close();
              navigate("apps");
            }}
          />
        </Card>

        <PersonaSetting />

        <PeopleSetting />

        <RemindersSetting />

        <Card style={{ gap: spacing[3] }}>
          <SectionHeading title={`What ${name} should always know`} />
          <Field
            label={`Things ${name} should always know about you`}
            value={context}
            onChangeText={setContext}
            multiline
            numberOfLines={5}
            maxLength={contextMax}
            placeholder="What to call you, your city, people who matter, how you like things"
          />
          <Text style={s.small}>
            {context.length} of {contextMax}. These are your own notes. {name} uses them in chat and on calls, but
            never treats them as orders. They are in your download and are deleted with your account.
          </Text>
          <Button primary busy={busy} onPress={() => void save({ context }, "Notes saved.")}>
            Save notes
          </Button>
          <LinkRow
            icon={Brain}
            title={`What ${name} knows`}
            detail={`The things ${p.they} ${p.verb("have")} learned, each with its source`}
            onPress={() => {
              close();
              navigate("knows");
            }}
          />
        </Card>

        <Text accessibilityLiveRegion="polite" style={s.small}>
          {saved}
        </Text>
        <ErrorNotice error={error} />

        <OwnKeysSetting />
      </View>
      )}
    </Sheet>
  );
}
