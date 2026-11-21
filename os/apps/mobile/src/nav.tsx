// The app's two ways around: a floating pill of round tabs at the bottom of a phone, and a
// side bar on a wide screen (900px and up) with the same places, the recent chats, and the
// person's account at the bottom. The active place is a filled Daksha-blue circle.
// On the web every place is a real link, so middle-click and "open in new tab" work.
import type { Section } from "../../../packages/domain/src";
import { Menu, MessageCircle, Plus, Settings2 } from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import { createElement, type ReactNode } from "react";
import { Platform, Pressable, ScrollView, View } from "react-native";
import { Blurred } from "./genie";
import { useAccount } from "./neon-gate";
import { pathFor } from "./routes";
import { Text } from "./text";
import { useSavedThreads } from "./thread-list";
import { useFuseThread } from "./threads";
import { brandShadow, colors, fontFamily, fontSize, headingFamily, radius, s, spacing, typeSize } from "./ui";
import { useWorkspace } from "./workspace";

/** `short` is the word on screen; `label` is the full name read out by screen readers. */
export type NavItem = { id: Section; label: string; short: string; icon: LucideIcon };

const onWeb = Platform.OS === "web";

/** A place in the app: a link on the web, a tab on phones. */
function Place({
  item,
  active,
  onPress,
  role,
  style,
  children,
}: {
  item: NavItem;
  active: boolean;
  onPress: () => void;
  role: "tab" | "link";
  style: object;
  children: ReactNode;
}) {
  if (onWeb)
    return createElement(
      "a",
      {
        href: pathFor(item.id),
        "aria-label": item.label,
        "aria-current": active ? "page" : undefined,
        onClick: (event: MouseEvent) => {
          if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault();
          onPress();
        },
        style: { ...style, display: "flex", textDecoration: "none" },
      },
      children,
    );
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityLabel={item.label}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={style}
    >
      {children}
    </Pressable>
  );
}

/** The round icon of a place: a filled blue circle when it is the one on screen. */
function Dot({ icon: Icon, active, size = spacing[11] }: { icon: LucideIcon; active: boolean; size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius.full,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: active ? colors.nav : "transparent",
        boxShadow: active ? brandShadow.button : undefined,
      }}
    >
      <Icon size={21} strokeWidth={active ? 2.2 : 1.9} color={active ? colors.onNav : colors.text} />
    </View>
  );
}

/** The floating pill at the bottom of a phone. */
export function BottomNav({
  items,
  isActive,
  onGo,
  bottom,
  onHeight,
}: {
  items: NavItem[];
  isActive: (item: NavItem) => boolean;
  onGo: (id: Section) => void;
  /** Space below the pill: the safe area plus a small gap. */
  bottom: number;
  onHeight: (height: number) => void;
}) {
  return (
    <View
      pointerEvents="box-none"
      onLayout={(event) => onHeight(event.nativeEvent.layout.height + bottom)}
      style={{ position: "absolute", left: 0, right: 0, bottom, alignItems: "center", paddingHorizontal: spacing[4] }}
    >
      <Blurred
        accessibilityRole={onWeb ? undefined : "tablist"}
        style={{
          flexDirection: "row",
          width: "100%",
          maxWidth: 440,
          padding: spacing[1.5],
          borderRadius: radius.full,
          backgroundColor: colors.glassStrong,
          borderWidth: 1,
          borderColor: colors.card,
          boxShadow: brandShadow.float,
        }}
      >
        {items.map((item) => {
          const active = isActive(item);
          return (
            <Place
              key={item.id}
              item={item}
              active={active}
              role="tab"
              onPress={() => onGo(item.id)}
              style={{
                flex: 1,
                minWidth: 0,
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: spacing[0.5],
                paddingVertical: spacing[0.5],
              }}
            >
              <Dot icon={item.icon} active={active} />
              <Text
                numberOfLines={1}
                style={{
                  fontFamily,
                  fontSize: fontSize.sm,
                  lineHeight: spacing[4],
                  fontWeight: active ? "700" : "500",
                  color: active ? colors.text : colors.muted,
                }}
              >
                {item.short}
              </Text>
            </Place>
          );
        })}
      </Blurred>
    </View>
  );
}

/** A row in the side bar's list of chats. */
function ChatRow({ title, active, onPress }: { title: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open conversation: ${title}`}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: spacing[2],
        minHeight: spacing[10],
        paddingHorizontal: spacing[3],
        borderRadius: radius.full,
        backgroundColor: active ? colors.navSoft : pressed || hovered ? colors.subtle : "transparent",
      })}
    >
      <MessageCircle size={16} strokeWidth={1.9} color={colors.muted} />
      <Text numberOfLines={1} style={[s.text, { flex: 1, fontSize: typeSize.md }]}>
        {title}
      </Text>
    </Pressable>
  );
}

/** Recent chats in the side bar: the main chat, then side chats from the server. */
function RecentChats() {
  const { enabled, selection, mainId, select, start } = useFuseThread();
  const { navigate, section } = useWorkspace();
  const threads = useSavedThreads(enabled, 12);
  const recent = threads.threads.filter((t) => t.id !== mainId && !t.archived).slice(0, 10);
  return (
    <View style={{ gap: spacing[1] }}>
      <Pressable
        accessibilityRole="button"
        onPress={() => (enabled ? start() : navigate("chat"))}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: spacing[2],
          minHeight: spacing[11],
          marginBottom: spacing[3],
          borderRadius: radius.full,
          backgroundColor: colors.accent,
          opacity: pressed ? 0.85 : 1,
          boxShadow: brandShadow.card,
        })}
      >
        <Plus size={18} strokeWidth={2.2} color={colors.onAccent} />
        <Text style={[s.buttonText, { color: colors.onAccent }]}>{enabled ? "New side chat" : "Open chat"}</Text>
      </Pressable>
      <Text accessibilityRole="header" style={[s.label, { paddingHorizontal: spacing[3], marginBottom: spacing[1] }]}>
        Recent chats
      </Text>
      <ChatRow
        title="Main chat"
        active={section === "chat" && (!enabled || selection.id === mainId)}
        onPress={() => (enabled ? select({ id: mainId, existing: true }) : navigate("chat"))}
      />
      {recent.map((thread) => (
        <ChatRow
          key={thread.id}
          title={thread.name || "Untitled conversation"}
          active={section === "chat" && selection.id === thread.id}
          onPress={() => select({ id: thread.id, existing: true })}
        />
      ))}
    </View>
  );
}

/** The side bar on a wide screen. */
export function SideNav({
  items,
  isActive,
  onGo,
  onMenu,
}: {
  items: NavItem[];
  isActive: (item: NavItem) => boolean;
  onGo: (id: Section) => void;
  onMenu: () => void;
}) {
  const { workspace, navigate } = useWorkspace();
  const account = useAccount();
  const who = account?.name || (workspace.mode === "sample" ? workspace.profile.name : "") || "Your account";
  const email = account?.email || workspace.profile.email;
  return (
    <Blurred
      accessibilityRole={onWeb ? undefined : "menu"}
      style={{
        width: 288,
        margin: spacing[4],
        marginRight: 0,
        padding: spacing[4],
        borderRadius: radius.sheet,
        backgroundColor: colors.glass,
        borderWidth: 1,
        borderColor: colors.card,
        boxShadow: brandShadow.card,
        gap: spacing[4],
      }}
    >
      <Text
        style={{
          fontFamily: headingFamily,
          fontSize: typeSize.xl,
          lineHeight: spacing[8],
          fontWeight: "800",
          letterSpacing: -0.6,
          color: colors.text,
          paddingHorizontal: spacing[2],
          paddingTop: spacing[1],
        }}
      >
        Daksha
      </Text>
      <View accessibilityRole={onWeb ? undefined : "tablist"} style={{ gap: spacing[1] }}>
        {items.map((item) => {
          const active = isActive(item);
          return (
            <Place
              key={item.id}
              item={item}
              active={active}
              role="link"
              onPress={() => onGo(item.id)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: spacing[3],
                padding: spacing[1],
                paddingRight: spacing[3],
                borderRadius: radius.full,
                backgroundColor: active ? colors.card : "transparent",
                boxShadow: active ? brandShadow.card : undefined,
              }}
            >
              <Dot icon={item.icon} active={active} size={spacing[10]} />
              <Text
                numberOfLines={1}
                style={{ fontFamily, fontSize: typeSize.md, fontWeight: active ? "700" : "500", color: colors.text }}
              >
                {item.label}
              </Text>
            </Place>
          );
        })}
      </View>
      <View style={{ height: 1, backgroundColor: colors.line, marginHorizontal: spacing[2] }} />
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        <RecentChats />
      </ScrollView>
      <View
        style={[
          s.row,
          {
            gap: spacing[2],
            padding: spacing[2],
            borderRadius: radius.full,
            backgroundColor: colors.card,
            boxShadow: brandShadow.card,
          },
        ]}
      >
        <View
          style={{
            width: spacing[10],
            height: spacing[10],
            borderRadius: radius.full,
            backgroundColor: colors.lavender,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={[s.text, { fontWeight: "700" }]}>{who.slice(0, 1).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={[s.text, { fontWeight: "700", fontSize: typeSize.md }]}>
            {who}
          </Text>
          {!!email && (
            <Text numberOfLines={1} style={s.small}>
              {email}
            </Text>
          )}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Apps & settings"
          onPress={() => navigate("apps")}
          style={({ pressed }) => ({
            width: spacing[10],
            height: spacing[10],
            borderRadius: radius.full,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: pressed ? colors.navSoft : colors.subtle,
          })}
        >
          <Settings2 size={18} color={colors.text} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open conversations and menu"
          onPress={onMenu}
          style={({ pressed }) => ({
            width: spacing[10],
            height: spacing[10],
            borderRadius: radius.full,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: pressed ? colors.navSoft : colors.subtle,
          })}
        >
          <Menu size={18} color={colors.text} />
        </Pressable>
      </View>
    </Blurred>
  );
}
