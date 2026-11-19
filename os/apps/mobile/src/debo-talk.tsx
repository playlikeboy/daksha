// "Talk to Debo": a full-screen voice popup that opens over any screen, like a
// modern voice assistant. Debo's tomato face is the orb in the middle. A soft halo
// swells with her voice and a ring answers the person's microphone. Under her, the
// state is written in words, so the face is never the only signal. The controls sit
// in one row: microphone, Stop Debo, keyboard and a clear red End. Voice is never
// the only way: the keyboard button slides up a text box.
//
// The call itself is not in this file. It lives above every screen (see
// debo-talk-session.tsx and debo-talk-call.ts), so this popup can be collapsed to
// the small bar (debo-talk-pill.tsx) while the call goes on. The chevron, Escape
// and a swipe down collapse a live call; only End ends it. With no call, they
// just close.
import { Check, ChevronDown, Keyboard, SlidersHorizontal, MessageCircle, Mic, MicOff, PhoneOff, Square } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  useWindowDimensions,
  View,
} from "react-native";
import { Text } from "./text";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { duration } from "./astryx-tokens";
import { useAssistantName } from "./debo-character-store";
import { DeboFace, useReducedMotion } from "./debo-face";
import { hasAgreedToTalk, rememberAgreedToTalk, takeTalkAutoStart } from "./debo-talk-consent";
import { TalkApprovals } from "./debo-talk-approvals";
import { deboLevels, deboMood } from "./debo-mood-store";
import { spokenStatus, stateWords, type TalkLine, useTalkCall, useTalkState } from "./debo-talk-session";
import { Button, Card, Chip, colors, ErrorNotice, Field, fontSize, radius, s, spacing } from "./ui";
import { useWorkspace } from "./workspace";

export function TalkPopup({ onClose }: { onClose: () => void }) {
  const { navigate, notify, open } = useWorkspace();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const talk = useTalkCall();
  const { status, micOn, agentState, reconnecting, lines, problem, youActive, active } = useTalkState();
  const [typed, setTyped] = useState("");
  const [typing, setTyping] = useState(false);
  const [transcript, setTranscript] = useState(false);
  // The transcript panel stays mounted only while it is open or sliding away.
  const [transcriptMounted, setTranscriptMounted] = useState(false);
  const closing = useRef(false);

  const live = status === "live";
  const listening = live && micOn;

  // The session needs to know the popup is open (a call that ends behind it is announced).
  // A finished call from before starts fresh.
  useEffect(() => {
    talk.popupOpen(true);
    talk.reset();
    return () => talk.popupOpen(false);
  }, [talk]);

  // Pressing Start talking is the person's yes to the text under it. It is remembered on this device,
  // so pressing Debo's face at the top of the app can start straight away next time.
  const begin = useCallback(async () => {
    await rememberAgreedToTalk();
    await talk.start();
  }, [talk]);
  // Opened from the top of the app: start at once, but only if they have agreed on this device before.
  // The first time, the text below stays and waits for "Start talking".
  useEffect(() => {
    if (!takeTalkAutoStart()) return;
    let cancelled = false;
    void hasAgreedToTalk().then((agreed) => {
      if (agreed && !cancelled) void talk.start();
    });
    return () => {
      cancelled = true;
    };
  }, [talk]);

  // Motion values: the popup rising, the keyboard panel, the transcript panel, the halo pulse.
  const enter = useRef(new Animated.Value(0)).current;
  const drag = useRef(new Animated.Value(0)).current;
  const keyboardIn = useRef(new Animated.Value(0)).current;
  const transcriptIn = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const native = Platform.OS !== "web";

  useEffect(() => {
    Animated.timing(enter, {
      toValue: 1,
      // With reduce motion on, panels appear in place instead of sliding.
      duration: reduceMotion ? 0 : duration.medium,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: native,
    }).start();
  }, [enter, native, reduceMotion]);
  useEffect(() => {
    Animated.timing(keyboardIn, {
      toValue: typing ? 1 : 0,
      // With reduce motion on, panels appear in place instead of sliding.
      duration: reduceMotion ? 0 : duration.medium,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: native,
    }).start();
  }, [typing, keyboardIn, native, reduceMotion]);
  useEffect(() => {
    if (transcript) setTranscriptMounted(true);
    Animated.timing(transcriptIn, {
      toValue: transcript ? 1 : 0,
      // With reduce motion on, panels appear in place instead of sliding.
      duration: reduceMotion ? 0 : duration.medium,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: native,
    }).start(() => {
      if (!transcript) setTranscriptMounted(false);
    });
  }, [transcript, transcriptIn, native, reduceMotion]);
  // A slow swell while she listens. It stops with reduced motion.
  useEffect(() => {
    if (!listening || reduceMotion || agentState === "speaking") {
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: native }),
        Animated.timing(pulse, { toValue: 0, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: native }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [listening, reduceMotion, agentState, pulse, native]);

  // The face follows the conversation. The privacy text keeps her calm until the person starts.
  useEffect(() => {
    deboMood.serious(status === "idle");
    return () => deboMood.serious(false);
  }, [status]);
  // Put focus back where it was when the popup closes (web).
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const before = globalThis.document?.activeElement as HTMLElement | null;
    return () => before?.focus?.();
  }, []);

  // Slide the popup away, then tell the screen underneath.
  const slideAway = useCallback(
    (then?: () => void) => {
      if (closing.current) return;
      closing.current = true;
      Animated.timing(enter, {
        toValue: 0,
        duration: reduceMotion ? 0 : duration.exit + 100,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: native,
      }).start(() => {
        then?.();
        onClose();
      });
    },
    [enter, native, onClose, reduceMotion],
  );

  // The chevron, Escape and a swipe down. During a call this only collapses it: the call keeps
  // going, and the small bar above the tabs says the microphone is on. With no call it just closes.
  const requestClose = useCallback(() => {
    if (closing.current) return;
    if (!active) talk.reset();
    slideAway();
  }, [active, slideAway, talk]);

  // The only way to hang up from here. The microphone turns off.
  const endCall = useCallback(async () => {
    if (closing.current) return;
    const hadCall = active;
    await talk.end();
    slideAway(() => {
      if (hadCall) notify("Conversation ended. Microphone off.");
    });
  }, [active, notify, slideAway, talk]);

  // Escape closes the popup (web).
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (transcript) setTranscript(false);
      else if (typing) setTyping(false);
      else requestClose();
    };
    globalThis.document?.addEventListener("keydown", onKey);
    return () => globalThis.document?.removeEventListener("keydown", onKey);
  }, [requestClose, transcript, typing]);

  // Swipe down closes.
  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => g.dy > 12 && g.dy > Math.abs(g.dx) * 1.5,
        onPanResponderMove: (_e, g) => drag.setValue(Math.max(0, g.dy)),
        onPanResponderRelease: (_e, g) => {
          if (g.dy > 120 || g.vy > 0.9) requestClose();
          else Animated.spring(drag, { toValue: 0, useNativeDriver: false, friction: 8 }).start();
        },
        onPanResponderTerminate: () =>
          Animated.spring(drag, { toValue: 0, useNativeDriver: false, friction: 8 }).start(),
      }),
    [drag, requestClose],
  );

  async function send() {
    const text = typed.trim();
    if (!text) return;
    setTyped("");
    await talk.send(text);
  }

  const assistant = useAssistantName();
  const words = stateWords({ status, micOn, agentState, reconnecting, name: assistant });
  const spoken = spokenStatus({ status, micOn, agentState, reconnecting, name: assistant });
  const shown = lines.filter((line) => line.text);
  const recent = shown.slice(typing ? -1 : -2);
  const latestSources = [...lines].reverse().find((line) => line.sources.length > 0)?.sources ?? [];

  // Sizes work from 320px up. On desktop the column stays centred.
  const column = Math.min(width, 560);
  // Before a call starts the promise and the buttons need room too, so the orb is smaller then.
  const orb = Math.max(110, Math.min(250, column - 120, height * 0.3) * (typing ? 0.62 : status === "idle" ? 0.72 : 1));
  const face = orb * 0.82;

  const haloScale = Animated.add(
    deboLevels.debo.interpolate({ inputRange: [0, 1], outputRange: [1, 1.32] }),
    pulse.interpolate({ inputRange: [0, 1], outputRange: [0, 0.06] }),
  );
  const ringScale = deboLevels.you.interpolate({ inputRange: [0, 1], outputRange: [1.04, 1.28] });
  const slide = enter.interpolate({ inputRange: [0, 1], outputRange: [Math.min(height, 900), 0] });
  const keyboardShift = keyboardIn.interpolate({ inputRange: [0, 1], outputRange: [90, 0] });
  const transcriptShift = transcriptIn.interpolate({ inputRange: [0, 1], outputRange: [Math.min(height, 900), 0] });

  return (
    <Modal transparent visible animationType="none" statusBarTranslucent onRequestClose={requestClose}>
      <Animated.View
        style={{ flex: 1, backgroundColor: colors.scrim, opacity: enter }}
        pointerEvents="none"
      />
      <Animated.View
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, transform: [{ translateY: drag }] }}
      >
        <Animated.View
          accessibilityViewIsModal
          role={Platform.OS === "web" ? "dialog" : undefined}
          aria-modal={Platform.OS === "web" ? true : undefined}
          aria-label="Talk to Debo"
          accessibilityLabel="Talk to Debo"
          {...pan.panHandlers}
          style={{
            flex: 1,
            backgroundColor: colors.canvas,
            alignItems: "center",
            paddingTop: insets.top + spacing[2],
            paddingBottom: Math.max(insets.bottom, spacing[4]),
            transform: [{ translateY: slide }],
          }}
        >
          <View style={{ flex: 1, width: "100%", maxWidth: 560, paddingHorizontal: spacing[5] }}>
            {/* Top: grab handle, and the transcript button. */}
            <View style={[s.between, { minHeight: spacing[11] }]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  active
                    ? "Minimise. The conversation keeps going and the microphone stays as it is."
                    : "Close"
                }
                onPress={requestClose}
                style={{ width: spacing[11], height: spacing[11], alignItems: "center", justifyContent: "center" }}
              >
                <ChevronDown size={24} color={colors.muted} strokeWidth={1.8} />
              </Pressable>
              <View
                style={{ width: 40, height: 4, borderRadius: radius.full, backgroundColor: colors.lineStrong }}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`How ${assistant} talks: voice, personality and notes`}
                onPress={() => open({ type: "talk-settings" })}
                style={{ width: spacing[11], height: spacing[11], alignItems: "center", justifyContent: "center" }}
              >
                <SlidersHorizontal size={22} color={colors.muted} strokeWidth={1.8} />
              </Pressable>
              {live || shown.length > 0 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: transcript }}
                  onPress={() => setTranscript(!transcript)}
                  style={{ minHeight: spacing[11], justifyContent: "center", paddingHorizontal: spacing[2] }}
                >
                  <Text style={[s.small, { color: colors.blueDark, fontWeight: "600" }]}>
                    {transcript ? "Hide transcript" : "Show transcript"}
                  </Text>
                </Pressable>
              ) : (
                <View style={{ width: spacing[11] }} />
              )}
            </View>

            {/* The orb: Debo, a halo that follows her voice, and a ring that follows yours. */}
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ flexGrow: 1, alignItems: "center", justifyContent: "center", gap: spacing[3] }}
              showsVerticalScrollIndicator={false}
            >
              {/* Anything that needs a yes is shown first, on top of the call, never only behind it. */}
              <TalkApprovals />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={live ? assistant : "Start talking"}
                disabled={live || status === "connecting"}
                onPress={() => void begin()}
                style={{ width: orb * 1.4, height: orb * 1.4, alignItems: "center", justifyContent: "center" }}
              >
                <Animated.View
                  pointerEvents="none"
                  style={{
                    position: "absolute",
                    width: orb,
                    height: orb,
                    borderRadius: radius.full,
                    backgroundColor: colors.blue,
                    opacity: agentState === "speaking" ? 0.9 : 0.55,
                    transform: [{ scale: reduceMotion ? 1.1 : haloScale }],
                  }}
                />
                <Animated.View
                  pointerEvents="none"
                  style={{
                    position: "absolute",
                    width: orb * 1.08,
                    height: orb * 1.08,
                    borderRadius: radius.full,
                    borderWidth: 2,
                    borderColor: colors.blueDark,
                    opacity: listening && youActive ? 0.45 : 0,
                    transform: [{ scale: reduceMotion ? 1.12 : ringScale }],
                  }}
                />
                <View style={{ marginTop: -face * 0.06 }}>
                  <DeboFace size={face} interactive={live} />
                </View>
              </Pressable>

              <View
                accessible
                accessibilityRole="text"
                accessibilityLiveRegion="polite"
                accessibilityLabel={spoken}
                style={{ alignItems: "center", gap: spacing[2] }}
              >
                <Text style={[s.title, { textAlign: "center" }]}>{words}</Text>
                <View style={[s.row, { gap: spacing[1.5] }]} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
                  {listening ? (
                    <Mic size={14} color={colors.blueDark} />
                  ) : (
                    <MicOff size={14} color={colors.muted} />
                  )}
                  <Text style={s.small}>{listening ? "Microphone on" : "Microphone off"}</Text>
                </View>
              </View>

              {status === "idle" && (
                <View style={{ gap: spacing[4], alignItems: "center", width: "100%", maxWidth: 420 }}>
                  {/* Short points instead of one long paragraph, so the promise is easy to read. */}
                  <View style={{ gap: spacing[2], alignSelf: "stretch" }}>
                    {[
                      `${assistant} listens only during the call. Your device asks for the microphone when you start.`,
                      "What you say is saved as text in your journal. You can delete it. Voice recordings are not kept.",
                      "You can mute, make the call small or end it at any time. Closing this tab ends it too.",
                    ].map((line) => (
                      <View key={line} style={[s.row, { gap: spacing[2], alignItems: "flex-start" }]}>
                        <Check size={16} color={colors.success} style={{ marginTop: spacing[1] }} />
                        <Text style={[s.muted, { flex: 1 }]}>{line}</Text>
                      </View>
                    ))}
                  </View>
                  <View style={[s.row, { gap: spacing[3], flexWrap: "wrap", justifyContent: "center" }]}>
                    <Button primary icon={Mic} onPress={() => void begin()}>
                      Start talking
                    </Button>
                    <Button onPress={requestClose}>Not now</Button>
                  </View>
                </View>
              )}

              {(status === "ended" || status === "error") && (
                <View style={[s.row, { gap: spacing[3], flexWrap: "wrap", justifyContent: "center" }]}>
                  <Button primary icon={Mic} onPress={() => void begin()}>
                    {status === "error" ? "Try again" : "Start again"}
                  </Button>
                  {status === "error" && (
                    <Button
                      icon={MessageCircle}
                      onPress={() => {
                        talk.reset();
                        slideAway();
                        navigate("chat");
                      }}
                    >
                      Type in Chat instead
                    </Button>
                  )}
                </View>
              )}

              <ErrorNotice error={problem} />

              {/* Live captions: the last one or two lines, the older one faded. */}
              {recent.length > 0 && (
                <View accessibilityLiveRegion="polite" accessibilityLabel="Live captions" style={{ gap: spacing[1], alignSelf: "stretch" }}>
                  {recent.map((line, i) => (
                    <Caption key={line.id} line={line} faded={recent.length === 2 && i === 0} />
                  ))}
                </View>
              )}
              {latestSources.length > 0 && (
                <View
                  accessibilityRole="list"
                  accessibilityLabel="Where this answer came from"
                  style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing[2], justifyContent: "center" }}
                >
                  {latestSources.map((source) => (
                    <Chip key={source.id} tint={colors.green}>
                      {source.label}
                    </Chip>
                  ))}
                </View>
              )}
            </ScrollView>

            {/* The keyboard panel slides up above the controls. */}
            {live && typing && (
              <Animated.View
                style={{
                  opacity: keyboardIn,
                  transform: [{ translateY: keyboardShift }],
                  marginBottom: spacing[3],
                }}
              >
                <Field
                  label="Type to Debo instead"
                  value={typed}
                  onChangeText={setTyped}
                  maxLength={500}
                  placeholder="Or type here"
                  returnKeyType="send"
                  autoFocus
                  onSubmitEditing={() => void send()}
                />
                <Button onPress={() => void send()} disabled={!typed.trim()}>
                  Send message
                </Button>
              </Animated.View>
            )}

            {/* Controls: microphone, Stop Debo, keyboard, End. */}
            {(live || status === "connecting") && (
              <View style={{ flexDirection: "row", justifyContent: "space-between", paddingBottom: spacing[2] }}>
                <RoundButton
                  label="Microphone"
                  caption={micOn ? "Mic on" : "Mic off"}
                  checked={micOn}
                  disabled={!live}
                  onPress={() => void talk.toggleMicrophone()}
                  icon={micOn ? Mic : MicOff}
                />
                <RoundButton
                  label="Stop Debo"
                  caption="Stop Debo"
                  disabled={!live || agentState !== "speaking"}
                  onPress={() => void talk.stopDebo()}
                  icon={Square}
                />
                <RoundButton
                  label="Type to Debo"
                  caption="Type"
                  expanded={typing}
                  disabled={!live}
                  onPress={() => setTyping(!typing)}
                  icon={Keyboard}
                />
                <RoundButton
                  label="End conversation"
                  caption="End"
                  danger
                  onPress={() => void endCall()}
                  icon={PhoneOff}
                />
              </View>
            )}
          </View>

          {/* The full transcript slides over everything. */}
          {transcriptMounted && (
          <Animated.View
            pointerEvents={transcript ? "auto" : "none"}
            accessibilityElementsHidden={!transcript}
            importantForAccessibility={transcript ? "auto" : "no-hide-descendants"}
            style={{
              position: "absolute",
              top: insets.top + spacing[2],
              left: 0,
              right: 0,
              bottom: 0,
              alignItems: "center",
              backgroundColor: colors.canvas,
              opacity: transcriptIn,
              transform: [{ translateY: transcriptShift }],
            }}
          >
            <View style={{ flex: 1, width: "100%", maxWidth: 560, paddingHorizontal: spacing[5] }}>
              <View style={[s.between, { minHeight: spacing[11] }]}>
                <Text style={s.heading}>Transcript</Text>
                <Button small onPress={() => setTranscript(false)}>
                  Hide transcript
                </Button>
              </View>
              <ScrollView contentContainerStyle={{ gap: spacing[3], paddingVertical: spacing[3] }}>
                {shown.length === 0 && latestSources.length === 0 && (
                  <Text style={s.muted}>Nothing has been said yet.</Text>
                )}
                {lines
                  .filter((line) => line.text || line.sources.length > 0)
                  .map((line) => (
                    <Card
                      key={line.id}
                      style={{
                        padding: spacing[3],
                        gap: spacing[1.5],
                        backgroundColor: line.who === "you" ? colors.sky : colors.card,
                      }}
                    >
                      {line.text ? (
                        <>
                          <Text style={s.small}>{line.who === "you" ? "You" : assistant}</Text>
                          <Text style={[s.text, { flexShrink: 1 }]}>{line.text}</Text>
                        </>
                      ) : null}
                      {line.sources.length > 0 && (
                        <View
                          accessibilityRole="list"
                          accessibilityLabel="Where this answer came from"
                          style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing[2] }}
                        >
                          {line.sources.map((source) => (
                            <Chip key={source.id} tint={colors.green}>
                              {source.label}
                            </Chip>
                          ))}
                        </View>
                      )}
                    </Card>
                  ))}
              </ScrollView>
            </View>
          </Animated.View>
          )}
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

/** One caption line. It fades in when it appears and dims when a newer line arrives. */
function Caption({ line, faded }: { line: TalkLine; faded: boolean }) {
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(opacity, {
      toValue: faded ? 0.45 : 1,
      duration: duration.medium,
      useNativeDriver: Platform.OS !== "web",
    }).start();
  }, [faded, opacity]);
  return (
    <Animated.View style={{ opacity }}>
      <Text numberOfLines={3} style={[s.text, { textAlign: "center", fontSize: fontSize.lg }]}>
        <Text style={s.small}>{line.who === "you" ? "You: " : ""}</Text>
        {line.text}
      </Text>
    </Animated.View>
  );
}

function RoundButton({
  label,
  caption,
  icon: Icon,
  onPress,
  disabled,
  danger,
  checked,
  expanded,
}: {
  label: string;
  caption: string;
  icon: typeof Mic;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
  checked?: boolean;
  expanded?: boolean;
}) {
  const tint = danger ? colors.onStop : colors.text;
  return (
    <View style={{ alignItems: "center", gap: spacing[1.5], width: 72, opacity: disabled ? 0.45 : 1 }}>
      <Pressable
        accessibilityRole={checked === undefined ? "button" : "switch"}
        accessibilityLabel={label}
        accessibilityState={{ disabled: !!disabled, checked, expanded }}
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => ({
          width: 64,
          height: 64,
          borderRadius: radius.full,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: danger ? colors.stop : checked || expanded ? colors.blue : colors.subtle,
          transform: [{ scale: pressed ? 0.94 : 1 }],
        })}
      >
        <Icon
          size={26}
          strokeWidth={1.8}
          color={tint}
        />
      </Pressable>
      <Text style={[s.small, { color: colors.text, textAlign: "center" }]}>{caption}</Text>
    </View>
  );
}
