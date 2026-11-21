// Home: the first screen after sign-in. A greeting from the assistant, a box to ask
// anything, the six things Daksha does as big tiles, and a "Today" strip with the next
// reminder, a check-in and the latest entries. News for the person shows under it once the
// server has a news route (news.tsx draws nothing until then).
import {
  ArrowRight,
  ArrowUp,
  AudioLines,
  BellRing,
  BookOpen,
  CalendarDays,
  FileText,
  Globe,
  ImageIcon,
  Mail,
  MessageCircleQuestion,
  NotebookPen,
  PenLine,
  Shapes,
  Smile,
  Sparkles,
  UserRound,
  UsersRound,
} from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { Platform, Pressable, ScrollView, type TextStyle, useWindowDimensions, View } from "react-native";
import { chatDraft } from "./chat-draft";
import { useAssistantName } from "./debo-character-store";
import { deboApi } from "./debo-api";
import { type EntryView, entryDay, kindName, preview } from "./debo-data";
import { requestTalkAutoStart } from "./debo-talk-consent";
import { deboMood } from "./debo-mood-store";
import { Glass, Tile, type TileArtKind } from "./genie";
import { useAccount } from "./neon-gate";
import { NewsSection } from "./news-section";
import { Text, TextInput } from "./text";
import { brandShadow, colors, headingFamily, radius, s, Skeleton, spacing, typeSize } from "./ui";
import { useWorkspace } from "./workspace";
import type { LucideIcon } from "lucide-react-native";

const noFocusRing = Platform.OS === "web" ? ({ outlineStyle: "none" } as unknown as TextStyle) : undefined;

/** The person's first name, when Daksha knows one. Live workspaces call everyone "You". */
export function useFirstName(): string | undefined {
  const account = useAccount();
  const { workspace } = useWorkspace();
  const full = account?.name?.trim() || (workspace.mode === "sample" ? workspace.profile.name : "");
  const first = full.split(/\s+/)[0];
  return first && first !== "You" ? first : undefined;
}

type Reminder = { id: string; title: string; at: string; status: "scheduled" | "sent" };
type TodayData = {
  reminder?: Reminder | null;
  checkin?: boolean;
  entries?: EntryView[];
  journalOn?: boolean;
};

/** Everything the Today strip shows. Each part fails on its own, quietly. */
function useToday(): TodayData & { loading: boolean } {
  const { api } = useWorkspace();
  const debo = useMemo(() => deboApi(api), [api]);
  const [data, setData] = useState<TodayData>({});
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let live = true;
    const reminders = api
      .request<{ reminders: Reminder[] }>("/api/companion/reminders")
      .then((r) => {
        const next = r.reminders
          .filter((x) => x.status === "scheduled" && Date.parse(x.at) > Date.now() - 60_000)
          .sort((a, b) => a.at.localeCompare(b.at))[0];
        return next ?? null;
      })
      .catch(() => undefined);
    const settings = api
      .request<{ settings: { checkin: boolean } }>("/api/companion/settings")
      .then((r) => r.settings.checkin)
      .catch(() => undefined);
    const entries = debo
      .status()
      .then(async (status) => (status.configured ? { on: true, list: (await debo.entries()).slice(0, 3) } : { on: false, list: [] }))
      .catch(() => undefined);
    void Promise.all([reminders, settings, entries]).then(([reminder, checkin, journal]) => {
      if (!live) return;
      setData({ reminder, checkin, entries: journal?.list, journalOn: journal?.on });
      setLoading(false);
    });
    return () => {
      live = false;
    };
  }, [api, debo]);
  return { ...data, loading };
}


/** The box on Home. Pressing Send asks in Chat; the words are sent as typed. */
function AskBox() {
  const { ask } = useWorkspace();
  const name = useAssistantName();
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  const send = () => {
    const words = text.trim();
    if (!words) return;
    setText("");
    ask(words);
  };
  return (
    <Glass
      style={[
        s.row,
        {
          borderRadius: radius.full,
          paddingLeft: spacing[5],
          paddingRight: spacing[1.5],
          paddingVertical: spacing[1.5],
          gap: spacing[2],
          backgroundColor: colors.card,
          borderColor: focused ? colors.nav : colors.line,
          boxShadow: brandShadow.float,
        },
      ]}
    >
      <TextInput
        accessibilityLabel={`Ask ${name} anything`}
        value={text}
        onChangeText={setText}
        placeholder="Ask me anything…"
        placeholderTextColor={colors.muted}
        returnKeyType="send"
        onSubmitEditing={send}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{ flex: 1, minHeight: spacing[11], fontSize: typeSize.md, color: colors.text, ...noFocusRing }}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Ask in Chat"
        accessibilityState={{ disabled: !text.trim() }}
        disabled={!text.trim()}
        onPress={send}
        style={({ pressed }) => ({
          width: spacing[11],
          height: spacing[11],
          borderRadius: radius.full,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: text.trim() ? colors.nav : colors.subtle,
          boxShadow: text.trim() ? brandShadow.button : undefined,
          transform: [{ scale: pressed ? 0.94 : 1 }],
        })}
      >
        <ArrowUp size={22} strokeWidth={2} color={text.trim() ? colors.onNav : colors.muted} />
      </Pressable>
    </Glass>
  );
}

/** One card in the Today strip. */
function TodayCard({
  icon: Icon,
  tint,
  title,
  detail,
  action,
  onPress,
  width,
}: {
  icon: LucideIcon;
  tint: string;
  title: string;
  detail: string;
  action: string;
  onPress: () => void;
  width?: number;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${detail}. ${action}`}
      onPress={onPress}
      style={({ pressed }) => ({ width, flexGrow: width ? 0 : 1, flexBasis: width ? undefined : 0, transform: [{ scale: pressed ? 0.98 : 1 }] })}
    >
      <Glass style={{ padding: spacing[4], gap: spacing[3], minHeight: 168, backgroundColor: colors.card }}>
        <View style={s.between}>
          <View style={{ width: spacing[10], height: spacing[10], borderRadius: radius.full, backgroundColor: tint, alignItems: "center", justifyContent: "center" }}>
            <Icon size={18} strokeWidth={2} color={colors.text} />
          </View>
          <View style={{ width: spacing[8], height: spacing[8], borderRadius: radius.full, backgroundColor: colors.subtle, alignItems: "center", justifyContent: "center" }}>
            <ArrowRight size={16} color={colors.text} />
          </View>
        </View>
        <View style={{ flex: 1, gap: spacing[1] }}>
          <Text numberOfLines={2} style={[s.text, { fontWeight: "700" }]}>
            {title}
          </Text>
          <Text numberOfLines={3} style={s.small}>
            {detail}
          </Text>
        </View>
        <Text style={[s.label, { color: colors.blueText }]}>{action}</Text>
      </Glass>
    </Pressable>
  );
}

export function HomeScreen() {
  const { navigate, open } = useWorkspace();
  const name = useAssistantName();
  const { width } = useWindowDimensions();
  const desktop = width >= 900;
  const today = useToday();
  const columns = width >= 1180 ? 3 : 2;
  const [gridWidth, setGridWidth] = useState(0);

  const talk = () => {
    deboMood.tap();
    requestTalkAutoStart();
    navigate("talk");
  };
  const draft = (words: string) => {
    chatDraft.set(words);
    navigate("chat");
  };
  const tiles: {
    label: string;
    detail: string;
    icon: LucideIcon;
    tint: string;
    art: TileArtKind;
    artIcons?: LucideIcon[];
    onPress: () => void;
  }[] = [
    { label: "Talk", detail: `Have a voice conversation with ${name}`, icon: AudioLines, tint: colors.mint, art: "talk", onPress: talk },
    { label: "Write in journal", detail: "Write, speak or record your day", icon: PenLine, tint: colors.yellow, art: "journal", onPress: () => navigate("journal") },
    { label: "Ask about my life", detail: "Answers show which entry they came from", icon: MessageCircleQuestion, tint: colors.sky, art: "ask", onPress: () => navigate("chat") },
    { label: "Images", detail: "Ask for a picture in Chat", icon: ImageIcon, tint: colors.pink, art: "images", onPress: () => draft("Make a picture of ") },
    {
      label: "People you made",
      detail: "Talk with a person you set up",
      icon: UsersRound,
      tint: colors.orange,
      art: "people",
      artIcons: [UserRound, Smile, Sparkles],
      onPress: () => open({ type: "talk-settings" }),
    },
    {
      label: "Apps",
      detail: "Connect mail, calendar and more",
      icon: Shapes,
      tint: colors.lavender,
      art: "apps",
      artIcons: [Mail, CalendarDays, FileText, Globe],
      onPress: () => navigate("apps"),
    },
  ];

  const reminderCard = today.reminder ? (
    <TodayCard
      key="reminder"
      icon={BellRing}
      tint={colors.pink}
      title={today.reminder.title}
      detail={new Date(today.reminder.at).toLocaleString(undefined, { weekday: "long", hour: "numeric", minute: "2-digit" })}
      action="See reminders"
      onPress={() => open({ type: "talk-settings" })}
      width={desktop ? undefined : 220}
    />
  ) : (
    <TodayCard
      key="reminder"
      icon={BellRing}
      tint={colors.pink}
      title="No reminders coming up"
      detail={`Ask ${name} to remind you of something, at a time you choose.`}
      action="Ask for a reminder"
      onPress={() => draft("Remind me to ")}
      width={desktop ? undefined : 220}
    />
  );
  const checkinCard = (
    <TodayCard
      key="checkin"
      icon={NotebookPen}
      tint={colors.yellow}
      title="How is your day going?"
      detail={today.checkin ? "Your check-in is on. A few lines now is enough." : "A few lines are enough. Only you can read them."}
      action="Write an entry"
      onPress={() => navigate("journal")}
      width={desktop ? undefined : 220}
    />
  );
  const entryCards = (today.entries ?? []).map((entry) => (
    <TodayCard
      key={entry.id}
      icon={BookOpen}
      tint={colors.sky}
      title={entry.title || kindName(entry.kind)}
      detail={`${entryDay(entry.happenedAt)}. ${preview(entry.text, 90)}`}
      action="Open entry"
      onPress={() => navigate("journal", { entryId: entry.id })}
      width={desktop ? undefined : 220}
    />
  ));

  return (
    <View style={{ gap: spacing[8] }}>
      <View style={{ gap: spacing[5] }}>
        <Text
          accessibilityRole="header"
          style={{
            fontFamily: headingFamily,
            fontSize: desktop ? typeSize.hero + 8 : typeSize.hero,
            lineHeight: desktop ? 52 : 44,
            fontWeight: "800",
            letterSpacing: -1.4,
            color: colors.text,
            maxWidth: 560,
          }}
        >
          What's on your mind today?
        </Text>
        <AskBox />
      </View>

      <View style={{ gap: spacing[3] }}>
        <Text accessibilityRole="header" style={s.heading}>
          What would you like to do?
        </Text>
        <View
          onLayout={(event) => setGridWidth(event.nativeEvent.layout.width)}
          style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing[3] }}
        >
          {tiles.map((tile) => (
            <View key={tile.label} style={{ width: gridWidth ? (gridWidth - spacing[3] * (columns - 1)) / columns : "47%" }}>
              <Tile {...tile} height={desktop ? 196 : 172} />
            </View>
          ))}
        </View>
      </View>

      <View style={{ gap: spacing[3] }}>
        <View style={s.between}>
          <Text accessibilityRole="header" style={s.heading}>
            Today
          </Text>
          <Pressable accessibilityRole="link" onPress={() => navigate("journal")} style={{ minHeight: spacing[11], justifyContent: "center" }}>
            <Text style={[s.label, { color: colors.blueText }]}>All entries</Text>
          </Pressable>
        </View>
        {today.loading ? (
          <Skeleton label="Loading today" rows={1} heading={false} />
        ) : desktop ? (
          <View style={{ flexDirection: "row", gap: spacing[3] }}>
            {[reminderCard, checkinCard, ...entryCards].slice(0, 4)}
          </View>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginHorizontal: -spacing[5] }}
            contentContainerStyle={{ gap: spacing[3], paddingHorizontal: spacing[5], paddingVertical: spacing[2] }}
          >
            {[reminderCard, checkinCard, ...entryCards]}
          </ScrollView>
        )}
      </View>

      <NewsSection limit={6} onOpenTopics={() => open({ type: "talk-settings" })} />
    </View>
  );
}
