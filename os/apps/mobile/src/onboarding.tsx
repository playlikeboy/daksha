// The welcome steps, shown once per person after they first sign in, on whichever device
// they use first. Every step can be skipped, and the menu can open them again.
//
// 1. Hello, from the character.        4. A first entry (optional).
// 2. Who you talk to, and a name.      5. Optional: reminders and apps.
// 3. The three things Debo does.       6. The privacy promise, then a first question.
//
// Nothing here asks the device for a permission on its own. Reminders ask only when
// the person presses "Allow reminders"; the microphone asks on their first call.
import {
  ArrowLeft,
  Bell,
  BookOpen,
  type LucideIcon,
  MessageCircleQuestion,
  Mic,
  Shapes,
  ShieldCheck,
} from "lucide-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Linking, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAgentWorkspace } from "./agent-workspace";
import { deboApi, errorText } from "./debo-api";
import { planPick } from "./debo-character-pick";
import { CharacterPicker } from "./debo-character-picker";
import { deboCharacter } from "./debo-character-store";
import { type CharacterId, characterOrDefault, characters } from "./debo-characters";
import { useReducedMotion } from "./debo-face";
import { capital, pronounsFor } from "./debo-pronouns";
import { allowReminders, remindersOnThisDevice } from "./debo-reminder-alerts";
import { onboarding } from "./onboarding-store";
import {
  avatarSize,
  Button,
  colors,
  ErrorNotice,
  Field,
  fontSize,
  Mascot,
  radius,
  s,
  spacing,
} from "./ui";
import { useWorkspace } from "./workspace";

const PRIVACY_URL = "https://debo.life/privacy";
const STEPS = ["hello", "who", "what", "entry", "extras", "promise"] as const;
type Step = (typeof STEPS)[number];

export function Onboarding() {
  const { api, navigate, ask, notify } = useWorkspace();
  const { data, mutate } = useAgentWorkspace();
  const debo = useMemo(() => deboApi(api), [api]);
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const [step, setStep] = useState<Step>("hello");
  const [character, setCharacter] = useState<CharacterId>(characterOrDefault(data?.identity.character));
  const [name, setName] = useState(data?.identity.name || characters[character].name);
  const [entry, setEntry] = useState("");
  const [wrote, setWrote] = useState(false);
  const [journalOn, setJournalOn] = useState(true);
  const [reminders, setReminders] = useState<"ask" | "on" | "off">("ask");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // The journal step only shows when the journal is set up on this Debo.
  useEffect(() => {
    void debo
      .status()
      .then((status) => setJournalOn(status.configured))
      .catch(() => setJournalOn(false));
  }, [debo]);

  const steps = STEPS.filter((s) => s !== "entry" || journalOn);
  const index = steps.indexOf(step);
  const go = (next: Step) => {
    setError("");
    setStep(next);
  };
  const next = () => go(steps[Math.min(index + 1, steps.length - 1)]);
  const back = () => go(steps[Math.max(index - 1, 0)]);

  // A short fade between steps; none with reduce motion. The step's heading takes focus
  // on the web, so keyboard and screen reader users start at the top of the new step.
  const fade = useRef(new Animated.Value(1)).current;
  const heading = useRef<View>(null);
  useEffect(() => {
    if (!reduce) {
      fade.setValue(0);
      Animated.timing(fade, { toValue: 1, duration: 180, useNativeDriver: Platform.OS !== "web" }).start();
    }
    if (Platform.OS === "web") (heading.current as unknown as HTMLElement | null)?.focus?.();
  }, [step, reduce, fade]);

  async function remember(status: "finished" | "skipped") {
    // If this fails the person still gets in; they may see the welcome once more later.
    await api.request("/api/onboarding", { status }, "PUT").catch(() => {});
    onboarding.close();
  }
  async function skip() {
    await remember("skipped");
    notify("You can see the welcome again from the menu.");
  }

  async function saveWho() {
    if (!data) return next();
    const trimmed = name.trim() || characters[character].name;
    setBusy(true);
    setError("");
    try {
      const plan = planPick(data.identity, character);
      await mutate("/identity", { ...plan.save, name: trimmed });
      deboCharacter.set(character);
      deboCharacter.setName(trimmed);
      next();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function saveEntry() {
    if (!entry.trim()) return next();
    setBusy(true);
    setError("");
    try {
      await debo.addEntry(entry.trim());
      setWrote(true);
      next();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function finish(then?: () => void) {
    setBusy(true);
    await remember("finished");
    setBusy(false);
    then?.();
  }

  const shownName = name.trim() || characters[character].name;
  const p = pronounsFor(character);

  return (
    <View
      accessibilityViewIsModal
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: colors.canvas,
        paddingTop: insets.top,
        paddingBottom: insets.bottom,
      }}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          flexGrow: 1,
          alignItems: "center",
          paddingHorizontal: spacing[5],
          paddingVertical: spacing[6],
        }}
      >
        <View style={{ width: "100%", maxWidth: 520, flexGrow: 1, gap: spacing[6] }}>
          <View style={[s.between, { minHeight: spacing[11] }]}>
            {index > 0 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Back"
                onPress={back}
                style={({ pressed }) => ({
                  width: spacing[11],
                  height: spacing[11],
                  borderRadius: radius.full,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: pressed ? colors.line : "transparent",
                })}
              >
                <ArrowLeft size={20} color={colors.text} />
              </Pressable>
            ) : (
              <View />
            )}
            <Progress index={index} total={steps.length} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Skip the welcome"
              onPress={() => void skip()}
              style={({ pressed }) => ({
                minHeight: spacing[11],
                paddingHorizontal: spacing[3],
                justifyContent: "center",
                borderRadius: radius.full,
                backgroundColor: pressed ? colors.line : "transparent",
              })}
            >
              <Text style={[s.buttonText, { color: colors.text }]}>Skip</Text>
            </Pressable>
          </View>

          <Animated.View style={{ flexGrow: 1, gap: spacing[5], opacity: fade }}>
            {step === "hello" && (
              <>
                <View style={{ alignItems: "center", paddingTop: spacing[6] }}>
                  <Mascot size={avatarSize.xl} variant={data?.identity.avatar} />
                </View>
                <Heading refFor={heading} title={`Hi, I'm ${data?.identity.name || "Debo"}.`} />
                <Text style={[s.muted, { fontSize: fontSize.lg, lineHeight: spacing[7] }]}>
                  I keep your days safe and help you remember them. Tell me about your day, then ask me
                  anything about it later. This takes about a minute.
                </Text>
              </>
            )}

            {step === "who" && (
              <>
                <Heading refFor={heading} title="Who would you like to talk to?" />
                <Text style={s.muted}>
                  Pick a face and a name. You can change both any time in Apps.
                </Text>
                <CharacterPicker
                  value={character}
                  busy={busy}
                  onChange={(id) => {
                    // A name the person typed stays; a character's own name follows the pick.
                    if (Object.values(characters).some((c) => c.name === name.trim()) || !name.trim())
                      setName(characters[id].name);
                    setCharacter(id);
                    deboCharacter.set(id);
                  }}
                />
                <Field
                  label="What should I be called?"
                  value={name}
                  onChangeText={setName}
                  maxLength={40}
                  autoCapitalize="words"
                  returnKeyType="done"
                  onSubmitEditing={() => void saveWho()}
                />
              </>
            )}

            {step === "what" && (
              <>
                <Heading refFor={heading} title={`Three things ${shownName} does`} />
                <View accessibilityRole="list" style={{ gap: spacing[4] }}>
                  <Point
                    icon={BookOpen}
                    title="Keeps your day"
                    detail="Write a few lines or record a voice note in Journal. It stays private to you."
                  />
                  <Point
                    icon={MessageCircleQuestion}
                    title="Answers with sources"
                    detail={`Ask about your days in Chat. Every answer shows the entry it came from. If there is none, ${p.they} ${p.verb("say")} so.`}
                  />
                  <Point
                    icon={Mic}
                    title="Talks out loud"
                    detail={`Tap the face at the top to talk. ${capital(p.they)} only ${p.verb("listen")} while a call is on, and the screen always shows it.`}
                  />
                </View>
              </>
            )}

            {step === "entry" && (
              <>
                <Heading refFor={heading} title="Want to write your first entry?" />
                <Text style={s.muted}>
                  A line or two is plenty. What happened today, or what is on your mind. You can skip this.
                </Text>
                <Field
                  label="Your first entry"
                  value={entry}
                  onChangeText={setEntry}
                  multiline
                  numberOfLines={5}
                  placeholder="Today I…"
                />
              </>
            )}

            {step === "extras" && (
              <>
                <Heading refFor={heading} title="A couple of choices" />
                <Text style={s.muted}>Both are optional, and you can change them later.</Text>
                {remindersOnThisDevice() && (
                  <Choice
                    icon={Bell}
                    title="Reminders on this phone"
                    detail="So a reminder you set with me can buzz at the right time. Your phone will ask you first."
                  >
                    {reminders === "ask" ? (
                      <Button
                        small
                        onPress={() =>
                          void allowReminders().then((ok) => setReminders(ok ? "on" : "off"))
                        }
                      >
                        Allow reminders
                      </Button>
                    ) : (
                      <Text accessibilityLiveRegion="polite" style={s.small}>
                        {reminders === "on"
                          ? "Reminders are on."
                          : "Reminders are off. You can turn them on in your phone's settings."}
                      </Text>
                    )}
                  </Choice>
                )}
                <Choice
                  icon={Shapes}
                  title="Connect an app"
                  detail="Let me look things up in your calendar or mail. You sign in on the app's own page, and anything that sends or changes something waits for your yes."
                >
                  <Button small onPress={() => void finish(() => navigate("apps"))}>
                    Connect an app
                  </Button>
                </Choice>
                <Choice
                  icon={Mic}
                  title="Microphone and camera"
                  detail="Nothing to do now. The first time you talk or record, your device asks, and you choose."
                />
              </>
            )}

            {step === "promise" && (
              <>
                <View
                  style={{
                    width: spacing[12],
                    height: spacing[12],
                    borderRadius: radius.container,
                    backgroundColor: colors.green,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <ShieldCheck size={24} color={colors.success} />
                </View>
                <Heading refFor={heading} title="Your things stay yours" />
                <View style={{ gap: spacing[3] }}>
                  {[
                    "Only you can read your journal.",
                    "Every answer shows where it came from.",
                    "You can see, fix, download or delete anything I keep.",
                    "We do not sell your data, show ads, or train AI on it ourselves.",
                    "Anything that sends, posts or changes something outside Debo waits for your yes.",
                  ].map((line) => (
                    <View key={line} style={[s.row, { gap: spacing[3], alignItems: "flex-start" }]}>
                      <View
                        style={{
                          width: spacing[1.5],
                          height: spacing[1.5],
                          borderRadius: radius.full,
                          backgroundColor: colors.text,
                          marginTop: spacing[2] + spacing[0.5],
                        }}
                      />
                      <Text style={[s.text, { flex: 1 }]}>{line}</Text>
                    </View>
                  ))}
                </View>
                <Pressable
                  accessibilityRole="link"
                  onPress={() => void Linking.openURL(PRIVACY_URL)}
                  style={{ minHeight: spacing[11], justifyContent: "center", alignSelf: "flex-start" }}
                >
                  <Text style={[s.text, { textDecorationLine: "underline", fontWeight: "600" }]}>
                    Read the full privacy page, including which companies help run Debo
                  </Text>
                </Pressable>
                <Text style={[s.heading, { marginTop: spacing[2] }]}>Try a first question</Text>
                <View style={{ gap: spacing[2] }}>
                  {(wrote
                    ? ["What did I write today?", "What can you do for me?"]
                    : ["What can you do for me?", "How do I write my first entry?"]
                  ).map((question) => (
                    <Button key={question} disabled={busy} onPress={() => void finish(() => ask(question))}>
                      {question}
                    </Button>
                  ))}
                </View>
              </>
            )}

            <ErrorNotice error={error} />
          </Animated.View>

          <View style={{ gap: spacing[2] }}>
            {step === "hello" && (
              <Button primary onPress={next}>
                Let's start
              </Button>
            )}
            {step === "who" && (
              <Button primary busy={busy} onPress={() => void saveWho()}>
                {`Call me ${shownName}`}
              </Button>
            )}
            {step === "what" && (
              <Button primary onPress={next}>
                Next
              </Button>
            )}
            {step === "entry" && (
              <>
                <Button primary busy={busy} disabled={!entry.trim()} onPress={() => void saveEntry()}>
                  Save entry
                </Button>
                <Button onPress={next}>Not now</Button>
              </>
            )}
            {step === "extras" && (
              <Button primary onPress={next}>
                Next
              </Button>
            )}
            {step === "promise" && (
              <Button primary busy={busy} onPress={() => void finish(() => navigate("chat"))}>
                Go to chat
              </Button>
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function Heading({ title, refFor }: { title: string; refFor: React.RefObject<View | null> }) {
  return (
    // tabIndex -1: the web can move focus here when a step opens, without adding a tab stop.
    <View ref={refFor} tabIndex={-1} style={{ outlineStyle: "none" } as object}>
      <Text accessibilityRole="header" style={[s.title, { fontSize: fontSize["3xl"], lineHeight: spacing[9] }]}>
        {title}
      </Text>
    </View>
  );
}

function Progress({ index, total }: { index: number; total: number }) {
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`Step ${index + 1} of ${total}`}
      accessibilityValue={{ min: 1, max: total, now: index + 1 }}
      style={[s.row, { gap: spacing[1.5] }]}
    >
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          style={{
            width: i === index ? spacing[5] : spacing[2],
            height: spacing[2],
            borderRadius: radius.full,
            backgroundColor: i <= index ? colors.text : colors.lineStrong,
          }}
        />
      ))}
    </View>
  );
}

function Point({ icon: Icon, title, detail }: { icon: LucideIcon; title: string; detail: string }) {
  return (
    <View style={[s.row, { gap: spacing[4], alignItems: "flex-start" }]}>
      <View style={[s.iconBox, { backgroundColor: colors.card }]}>
        <Icon size={20} color={colors.text} />
      </View>
      <View style={{ flex: 1, gap: spacing[1] }}>
        <Text style={[s.text, { fontWeight: "600" }]}>{title}</Text>
        <Text style={s.muted}>{detail}</Text>
      </View>
    </View>
  );
}

function Choice({
  icon: Icon,
  title,
  detail,
  children,
}: {
  icon: LucideIcon;
  title: string;
  detail: string;
  children?: React.ReactNode;
}) {
  return (
    <View style={[s.card, { gap: spacing[3] }]}>
      <View style={[s.row, { gap: spacing[3], alignItems: "flex-start" }]}>
        <Icon size={20} color={colors.text} />
        <View style={{ flex: 1, gap: spacing[1] }}>
          <Text style={[s.text, { fontWeight: "600" }]}>{title}</Text>
          <Text style={s.muted}>{detail}</Text>
        </View>
      </View>
      {children && <View style={{ alignItems: "flex-start" }}>{children}</View>}
    </View>
  );
}
