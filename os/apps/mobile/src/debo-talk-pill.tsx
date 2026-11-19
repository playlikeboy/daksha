// The small round bubble shown while a call is minimised. The call keeps going (see
// debo-talk-session.tsx). The bubble floats at the bottom right, above the tabs.
//
// - Tap it to open the call full screen again.
// - A soft ring moves while someone speaks, and holds still while Daksha listens.
//   With reduce motion on, the ring never moves; the words in the label still say it all.
// - A small badge shows when the microphone is off, and a number when something waits
//   for a yes on screen (voice can never say yes to those).
// - Long-press (or right-click on the web) opens a small menu: Open, Mute or Unmute,
//   Review and End. Screen readers get the same as actions on the bubble.
import { Mic, MicOff, PhoneOff, Maximize2, ShieldCheck } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Platform, Pressable, Text, View } from "react-native";
import { DeboFace, useReducedMotion } from "./debo-face";
import { useAssistantName } from "./debo-character-store";
import { pillLabel, stateWords, useTalkCall, useTalkState } from "./debo-talk-session";
import { avatarSize, colors, fontSize, radius, s, shadow, spacing } from "./ui";
import { useWorkspace } from "./workspace";

const SIZE = avatarSize.lg;

export function TalkPill({
  onExpand,
  reviews = 0,
  onReview,
  bottom,
  right,
}: {
  onExpand: () => void;
  /** How many things wait for a tap on screen. */
  reviews?: number;
  onReview?: () => void;
  /** Distance from the bottom of the screen, to sit above the tabs and the composer. */
  bottom: number;
  /** Distance from the right edge. */
  right: number;
}) {
  const talk = useTalkCall();
  const { notify } = useWorkspace();
  const name = useAssistantName();
  const state = useTalkState();
  const { status, micOn, agentState, reconnecting, youActive } = state;
  const live = status === "live";
  const speaking = live && (agentState === "speaking" || (micOn && youActive));
  const listening = live && micOn && !speaking;
  const words = stateWords({ status, micOn, agentState, reconnecting, name });
  const [menu, setMenu] = useState(false);
  const reduce = useReducedMotion();

  // The ring: a slow breath while someone speaks; still otherwise, or with reduce motion.
  const ring = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!speaking || reduce) {
      ring.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(ring, {
        toValue: 1,
        duration: 1400,
        easing: Easing.out(Easing.quad),
        useNativeDriver: Platform.OS !== "web",
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [speaking, reduce, ring]);

  const end = () => {
    setMenu(false);
    void talk.end().then(() => notify("Conversation ended. Microphone off."));
  };
  const mute = () => {
    setMenu(false);
    if (live) void talk.toggleMicrophone();
  };
  const review = () => {
    setMenu(false);
    onReview?.();
  };
  const reviewWords = `${reviews} ${reviews === 1 ? "thing needs" : "things need"} your yes on screen`;
  const label = `${pillLabel({ status, micOn, agentState, reconnecting })}${reviews ? ` ${reviewWords}.` : ""}`;

  // Right-click opens the menu on the web, like a long-press on a phone.
  const bubble = useRef<View>(null);
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const node = bubble.current as unknown as HTMLElement | null;
    if (!node?.addEventListener) return;
    const open = (event: Event) => {
      event.preventDefault();
      setMenu(true);
    };
    node.addEventListener("contextmenu", open);
    return () => node.removeEventListener("contextmenu", open);
  }, []);

  return (
    <>
      {menu && (
        // Tapping anywhere else closes the menu.
        <Pressable
          accessibilityLabel="Close the call menu"
          onPress={() => setMenu(false)}
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        />
      )}
      <View pointerEvents="box-none" style={{ position: "absolute", right, bottom, alignItems: "flex-end" }}>
        {menu && (
          <View
            accessibilityRole="menu"
            accessibilityLabel="Call menu"
            style={{
              marginBottom: spacing[3],
              minWidth: 220,
              padding: spacing[1.5],
              gap: spacing[0.5],
              backgroundColor: colors.card,
              borderRadius: radius.container + spacing[2],
              boxShadow: shadow.high,
            }}
          >
            <Text style={[s.small, { paddingHorizontal: spacing[3], paddingTop: spacing[2], paddingBottom: spacing[1] }]}>
              {live ? `${micOn ? "Microphone on" : "Microphone off"} · ${words}` : words}
            </Text>
            <MenuItem icon={Maximize2} label="Open full screen" onPress={() => { setMenu(false); onExpand(); }} />
            {reviews > 0 && onReview && <MenuItem icon={ShieldCheck} label={`Review ${reviews}`} onPress={review} />}
            <MenuItem
              icon={micOn ? MicOff : Mic}
              label={micOn ? "Turn microphone off" : "Turn microphone on"}
              disabled={!live}
              onPress={mute}
            />
            <MenuItem icon={PhoneOff} label="End conversation" danger onPress={end} />
          </View>
        )}
        <View ref={bubble} style={{ width: SIZE, height: SIZE }}>
          {/* The ring sits behind the face: still while listening, breathing while someone speaks. */}
          <Animated.View
            pointerEvents="none"
            style={{
              position: "absolute",
              top: -spacing[1],
              left: -spacing[1],
              width: SIZE + spacing[2],
              height: SIZE + spacing[2],
              borderRadius: radius.full,
              borderWidth: 3,
              borderColor: listening || speaking ? colors.blueLine : "transparent",
              opacity: speaking && !reduce ? ring.interpolate({ inputRange: [0, 1], outputRange: [1, 0.2] }) : 1,
              transform: [{ scale: speaking && !reduce ? ring.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] }) : 1 }],
            }}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityHint="Opens the conversation. Long-press for mute and end."
            accessibilityLiveRegion="polite"
            accessibilityActions={[
              { name: "activate", label: "Open full screen" },
              { name: "longpress", label: "Show call menu" },
              ...(live ? [{ name: "mute", label: micOn ? "Turn microphone off" : "Turn microphone on" }] : []),
              ...(reviews > 0 && onReview ? [{ name: "review", label: `Review ${reviews}` }] : []),
              { name: "end", label: "End conversation" },
            ]}
            onAccessibilityAction={({ nativeEvent }) => {
              if (nativeEvent.actionName === "activate") onExpand();
              else if (nativeEvent.actionName === "longpress") setMenu(true);
              else if (nativeEvent.actionName === "mute") mute();
              else if (nativeEvent.actionName === "review") review();
              else if (nativeEvent.actionName === "end") end();
            }}
            onPress={onExpand}
            onLongPress={() => setMenu(true)}
            delayLongPress={350}
            style={({ pressed }) => ({
              width: SIZE,
              height: SIZE,
              borderRadius: radius.full,
              backgroundColor: colors.card,
              boxShadow: shadow.high,
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              transform: [{ scale: pressed ? 0.95 : 1 }],
            })}
          >
            <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
              <DeboFace size={SIZE - spacing[2]} />
            </View>
          </Pressable>
          {!micOn && (
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                left: -spacing[0.5],
                bottom: -spacing[0.5],
                width: spacing[6],
                height: spacing[6],
                borderRadius: radius.full,
                backgroundColor: colors.ink,
                borderWidth: 2,
                borderColor: colors.card,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <MicOff size={12} color={colors.onInk} />
            </View>
          )}
          {reviews > 0 && (
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                right: -spacing[1],
                top: -spacing[1],
                minWidth: spacing[6],
                height: spacing[6],
                paddingHorizontal: spacing[1.5],
                borderRadius: radius.full,
                backgroundColor: colors.stop,
                borderWidth: 2,
                borderColor: colors.card,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ color: colors.onStop, fontSize: fontSize.sm, fontWeight: "700" }}>{reviews}</Text>
            </View>
          )}
        </View>
      </View>
    </>
  );
}

function MenuItem({
  icon: Icon,
  label,
  onPress,
  danger,
  disabled,
}: {
  icon: typeof Mic;
  label: string;
  onPress: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="menuitem"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        s.row,
        {
          gap: spacing[3],
          minHeight: spacing[11],
          paddingHorizontal: spacing[3],
          borderRadius: radius.container,
          backgroundColor: pressed || hovered ? colors.subtle : "transparent",
          opacity: disabled ? 0.45 : 1,
        },
      ]}
    >
      <Icon size={18} color={danger ? colors.danger : colors.text} />
      <Text style={[s.text, { color: danger ? colors.danger : colors.text, fontWeight: "500" }]}>{label}</Text>
    </Pressable>
  );
}
