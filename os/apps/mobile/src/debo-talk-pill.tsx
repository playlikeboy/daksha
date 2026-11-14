// The small bar shown above the tabs while a call is minimised. The call keeps
// going (see debo-talk-session.tsx). The bar always says whether the microphone
// is on, in words and in the screen reader label. Tap it to open the call again.
// It has its own Mute and End buttons, and a Review button when Debo prepared
// something that needs a tap on screen (voice can never say yes to those).
import { Mic, MicOff, PhoneOff } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";
import { DeboFace } from "./debo-face";
import { pillLabel, stateWords, useTalkCall, useTalkState } from "./debo-talk-session";
import { colors, radius, s, shadow, spacing } from "./ui";
import { useWorkspace } from "./workspace";

export function TalkPill({
  onExpand,
  reviews = 0,
  onReview,
  bottom,
}: {
  onExpand: () => void;
  /** How many things wait for a tap on screen. */
  reviews?: number;
  onReview?: () => void;
  /** Distance from the bottom of the screen, to sit above the tabs. */
  bottom: number;
}) {
  const talk = useTalkCall();
  const { notify } = useWorkspace();
  const { status, micOn, agentState, reconnecting } = useTalkState();
  const live = status === "live";
  const listening = live && micOn;
  const label = pillLabel({ status, micOn, agentState, reconnecting });
  const words = stateWords({ status, micOn, agentState, reconnecting });
  const round = {
    width: spacing[11],
    height: spacing[11],
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  } as const;
  return (
    <View
      pointerEvents="box-none"
      style={{ position: "absolute", left: spacing[4], right: spacing[4], bottom, alignItems: "center" }}
    >
      <View
        accessibilityRole="toolbar"
        accessibilityLabel="Conversation with Debo is on"
        style={{
          flexDirection: "row",
          alignItems: "center",
          width: "100%",
          maxWidth: 560,
          gap: spacing[1],
          padding: spacing[1.5],
          backgroundColor: colors.card,
          borderRadius: radius.full,
          borderWidth: 1,
          borderColor: listening ? colors.blueDark : colors.line,
          boxShadow: shadow.med,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityLiveRegion="polite"
          onPress={onExpand}
          style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: spacing[2], minHeight: spacing[11] }}
        >
          <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
            <DeboFace size={36} />
          </View>
          <View style={{ flex: 1, gap: 2 }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
            <Text numberOfLines={1} style={[s.text, { fontWeight: "600" }]}>
              Talking with Debo
            </Text>
            <View style={[s.row, { gap: spacing[1] }]}>
              {listening ? (
                <Mic size={14} color={colors.blueDark} />
              ) : (
                <MicOff size={14} color={colors.muted} />
              )}
              <Text numberOfLines={1} style={s.small}>
                {live ? `${micOn ? "Microphone on" : "Microphone off"} · ${words}` : words}
              </Text>
            </View>
          </View>
        </Pressable>
        {reviews > 0 && onReview && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${reviews} ${reviews === 1 ? "thing needs" : "things need"} your yes on screen. Review.`}
            onPress={onReview}
            style={{
              minHeight: spacing[11],
              paddingHorizontal: spacing[3],
              borderRadius: radius.full,
              backgroundColor: colors.blue,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={[s.small, { color: colors.text, fontWeight: "600" }]}>Review {reviews}</Text>
          </Pressable>
        )}
        <Pressable
          accessibilityRole="switch"
          accessibilityLabel="Microphone"
          accessibilityState={{ checked: micOn, disabled: !live }}
          disabled={!live}
          onPress={() => void talk.toggleMicrophone()}
          style={{ ...round, backgroundColor: micOn ? colors.blue : colors.subtle, opacity: live ? 1 : 0.45 }}
        >
          {micOn ? (
            <Mic size={22} strokeWidth={1.8} color={colors.text} />
          ) : (
            <MicOff size={22} strokeWidth={1.8} color={colors.text} />
          )}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="End conversation. Microphone turns off."
          onPress={() =>
            void talk.end().then(() => notify("Conversation ended. Microphone off."))
          }
          style={{ ...round, backgroundColor: colors.stop }}
        >
          <PhoneOff size={22} strokeWidth={1.8} color={colors.onStop} />
        </Pressable>
      </View>
    </View>
  );
}
