// The first screen people see: Daksha's face, a warm hello, and the sign-in (or access key)
// card. On a phone it is one column. On a wide screen the hello sits in a soft panel on
// the left, with three plain lines about what Daksha is for, and the card on the right, so
// a big window is not a small card floating in empty space.
import { BookOpen, Check, type LucideIcon, MessageCircle, ShieldCheck } from "lucide-react-native";
import type { ReactNode } from "react";
import { ScrollView, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text } from "./text";
import { Backdrop, Glass } from "./genie";
import { avatarSize, colors, Mascot, radius, s, spacing, typeSize } from "./ui";

/** Only what the app really does today (AGENTS.md: be honest about it). */
const points: { icon: LucideIcon; text: string; tint: string }[] = [
  { icon: BookOpen, text: "Write or talk about your day.", tint: colors.yellow },
  { icon: MessageCircle, text: "Ask about your own life, and see where each answer came from.", tint: colors.sky },
  { icon: Check, text: "See, fix or forget anything Daksha knows.", tint: colors.mint },
];

export function WelcomeFrame({ subtitle, children }: { subtitle: string; children: ReactNode }) {
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const hello = (
    <View style={{ gap: spacing[3], alignItems: wide ? "flex-start" : "center" }}>
      <Mascot size={wide ? avatarSize.xl : avatarSize.lg + spacing[4]} />
      <Text
        accessibilityRole="header"
        style={[
          s.pageTitle,
          {
            marginTop: spacing[2],
            fontSize: wide ? typeSize["3xl"] + spacing[2] : typeSize["3xl"],
            lineHeight: wide ? spacing[11] : spacing[10],
            letterSpacing: wide ? -1.2 : -0.9,
            textAlign: wide ? "left" : "center",
          },
        ]}
      >
        Welcome to Daksha.
      </Text>
      <Text
        style={[
          s.muted,
          {
            fontSize: typeSize.lg,
            lineHeight: spacing[7],
            textAlign: wide ? "left" : "center",
            maxWidth: 400,
          },
        ]}
      >
        {subtitle}
      </Text>
    </View>
  );
  const privacy = (
    <View style={[s.row, { gap: spacing[2], alignItems: "flex-start", maxWidth: 380, alignSelf: wide ? "flex-start" : "center" }]}>
      <ShieldCheck size={18} strokeWidth={2} color={colors.success} style={{ marginTop: spacing[0.5] }} />
      <Text style={[s.small, { flexShrink: 1 }]}>
        What you give Daksha is yours. You can download it or delete it all at any time.
      </Text>
    </View>
  );
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }}>
      <Backdrop />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "center",
          alignItems: "center",
          padding: wide ? spacing[10] : spacing[4],
        }}
      >
        {wide ? (
          <View style={{ width: "100%", maxWidth: 1040, flexDirection: "row", gap: spacing[10], alignItems: "stretch" }}>
            <Glass
              style={{
                flex: 1,
                borderRadius: radius.sheet,
                padding: spacing[12],
                justifyContent: "center",
                gap: spacing[8],
              }}
            >
              {hello}
              <View style={{ gap: spacing[4] }}>
                {points.map(({ icon: Icon, text, tint }) => (
                  <View key={text} style={[s.row, { gap: spacing[3] }]}>
                    <View
                      style={{
                        width: spacing[10],
                        height: spacing[10],
                        borderRadius: radius.full,
                        backgroundColor: tint,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Icon size={18} strokeWidth={2} color={colors.text} />
                    </View>
                    <Text style={[s.text, { flex: 1, fontWeight: "500" }]}>{text}</Text>
                  </View>
                ))}
              </View>
            </Glass>
            <View style={{ width: 420, justifyContent: "center", gap: spacing[5] }}>
              {children}
              {privacy}
            </View>
          </View>
        ) : (
          <View style={{ width: "100%", maxWidth: 440, gap: spacing[6], alignItems: "stretch" }}>
            {hello}
            {children}
            {privacy}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
