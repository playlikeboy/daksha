// The slim bar at the top of every screen: menu, who you talk to, and notifications.
// It floats over the screen and frosts what scrolls under it (see chrome.tsx). The
// line under the name shows only when something is happening ("Listening", a task),
// so most of the time the bar is just a small face and a name.
import { Bell, Menu } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";
import { Frosted, frost } from "./chrome";
import { ComputerEntry } from "./computer";
import { avatarSize, colors, fontSize, IconButton, Mascot, radius, screenPadding, spacing } from "./ui";

export function TopBar({
  height,
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
        borderBottomWidth: 1,
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
            style={{ fontSize: fontSize.lg, lineHeight: spacing[6], fontWeight: "600", color: colors.text }}
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
              backgroundColor: colors.stop,
            }}
          />
        )}
      </View>
    </Frosted>
  );
}
