// The slim bar at the top of every screen: menu, who you talk to, and notifications.
// It floats over the screen and frosts what scrolls under it (see chrome.tsx). The
// line under the name shows only when something is happening ("Listening", a task),
// so most of the time the bar is just a small face and a name.
import { Bell, Menu } from "lucide-react-native";
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
  onMenu,
  onTalk,
  onBell,
}: {
  height: number;
  /** On a wide screen the bar has no bottom line: it would stop short of the window edges. */
  wide?: boolean;
  name: string;
  /** Only when something is happening. Nothing means no second line. */
  status?: string;
  /** False while the floating call bubble already shows the face (one face per screen). */
  showFace: boolean;
  avatar?: "sky" | "sand" | "lilac";
  callOn: boolean;
  /** On Chat, the computer button sits next to the bell. */
  chat: boolean;
  pending: number;
  onMenu: () => void;
  onTalk: () => void;
  onBell: () => void;
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
        gap: spacing[1],
        paddingHorizontal: screenPadding.phone - spacing[2],
        backgroundColor: frost,
        borderBottomWidth: wide ? 0 : 1,
        borderBottomColor: colors.line,
      }}
    >
      <IconButton icon={Menu} label="Open conversations and menu" onPress={onMenu} quiet />
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
          gap: spacing[2],
          paddingHorizontal: spacing[1],
          borderRadius: radius.full,
          opacity: pressed ? 0.65 : 1,
        })}
      >
        {showFace && (
          <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
            <Mascot size={avatarSize.sm} variant={avatar} />
          </View>
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
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
          {!!status && (
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
      {chat && <ComputerEntry compact />}
      <View>
        <IconButton
          icon={Bell}
          label={pending ? `Notifications, ${pending} unread or waiting` : "Notifications, none new"}
          onPress={onBell}
          quiet
        />
        {pending > 0 && (
          <View
            pointerEvents="none"
            style={{
              width: spacing[2],
              height: spacing[2],
              borderRadius: radius.full,
              position: "absolute",
              top: spacing[2],
              right: spacing[2],
              backgroundColor: colors.brand,
            }}
          />
        )}
      </View>
    </Frosted>
  );
}
