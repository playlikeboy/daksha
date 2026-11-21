// The slim bar at the top of every screen: who you talk to, and round buttons for the
// chat's history, notifications and the menu. It floats over the screen and frosts what
// scrolls under it (see chrome.tsx). On Home the name becomes a greeting ("Hi, Alex! How
// can I help you?"). The line under the name shows only when something is happening
// ("Listening", a task), so most of the time the bar is just a small face and a name.
import { Bell, History, Menu } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { Text } from "./text";
import { Frosted, frost } from "./chrome";
import { ComputerEntry } from "./computer";
import {
  avatarSize,
  colors,
  fontSize,
  headingFamily,
  IconButton,
  Mascot,
  radius,
  screenPadding,
  spacing,
  typeSize,
} from "./ui";

export function TopBar({
  height,
  wide,
  name,
  status,
  showFace,
  avatar,
  callOn,
  chat,
  pending,
  greeting,
  onMenu,
  onTalk,
  onBell,
  onActivity,
}: {
  height: number;
  /** On a wide screen the side bar holds the menu, so the bar has no menu button. */
  wide?: boolean;
  name: string;
  /** Only when something is happening. Nothing means no second line. */
  status?: string;
  /** False while the face shows elsewhere on the screen (one face per screen). */
  showFace: boolean;
  avatar?: "sky" | "sand" | "lilac";
  callOn: boolean;
  /** On Chat, the chat history button (and on a wide screen the computer) sit next to the bell. */
  chat: boolean;
  pending: number;
  /** On Home: a hello and a question instead of the name. */
  greeting?: { hello: string; ask: string };
  onMenu: () => void;
  onTalk: () => void;
  onBell: () => void;
  onActivity?: () => void;
}) {
  return (
    <Frosted
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height,
        flexDirection: "row",
        alignItems: "center",
        gap: spacing[2],
        paddingHorizontal: wide ? screenPadding.desktop : screenPadding.phone,
        backgroundColor: frost,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          callOn
            ? `Open the conversation with ${name}${status ? `. ${status}` : ""}`
            : `Talk to ${name}${status ? `. ${status}` : ""}`
        }
        accessibilityHint={callOn ? undefined : "Opens Talk and starts a voice conversation"}
        onPress={onTalk}
        style={({ pressed }) => ({
          flex: 1,
          minWidth: 0,
          minHeight: spacing[11],
          flexDirection: "row",
          alignItems: "center",
          gap: spacing[3],
          borderRadius: radius.full,
          opacity: pressed ? 0.65 : 1,
        })}
      >
        {showFace && (
          <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
            <Mascot size={greeting ? avatarSize.md : avatarSize.sm + spacing[1]} variant={avatar} />
          </View>
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          {greeting ? (
            <>
              <Text numberOfLines={1} style={{ fontSize: typeSize.md, lineHeight: spacing[5], color: colors.muted }}>
                {greeting.hello}
              </Text>
              <Text
                numberOfLines={1}
                style={{
                  fontFamily: headingFamily,
                  fontSize: typeSize.lg,
                  lineHeight: spacing[6],
                  fontWeight: "700",
                  letterSpacing: -0.4,
                  color: colors.text,
                }}
              >
                {greeting.ask}
              </Text>
            </>
          ) : (
            <Text
              numberOfLines={1}
              style={{
                fontFamily: headingFamily,
                fontSize: typeSize.lg,
                lineHeight: spacing[6],
                fontWeight: "700",
                letterSpacing: -0.2,
                color: colors.text,
              }}
            >
              {name}
            </Text>
          )}
          {!!status && !greeting && (
            <Text
              numberOfLines={1}
              accessibilityLiveRegion="polite"
              style={{ fontSize: fontSize.base, lineHeight: spacing[5], color: colors.muted }}
            >
              {status}
            </Text>
          )}
        </View>
      </Pressable>
      {chat && onActivity && <IconButton icon={History} label="Chat activity" onPress={onActivity} />}
      {chat && wide && <ComputerEntry compact />}
      <View>
        <IconButton
          icon={Bell}
          label={pending ? `Notifications, ${pending} unread or waiting` : "Notifications, none new"}
          onPress={onBell}
        />
        {pending > 0 && (
          <View
            pointerEvents="none"
            style={{
              width: spacing[2] + spacing[0.5],
              height: spacing[2] + spacing[0.5],
              borderRadius: radius.full,
              position: "absolute",
              top: spacing[2],
              right: spacing[2],
              borderWidth: 2,
              borderColor: colors.card,
              backgroundColor: colors.brand,
            }}
          />
        )}
      </View>
      {!wide && <IconButton icon={Menu} label="Open conversations and menu" onPress={onMenu} />}
    </Frosted>
  );
}
