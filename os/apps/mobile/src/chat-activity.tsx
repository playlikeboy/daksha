// "Chat activity": past conversations as cards, opened from the round history button in
// the chat's top bar. Each card says when the chat was last used and opens it. Renaming
// and archiving stay in the menu (threads.tsx), so this list is quick to scan.
import { ArrowUpRight, MessageCircle, MessagesSquare, Plus, Sparkles } from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { relativeDate } from "./relative-date";
import { Text } from "./text";
import { useSavedThreads } from "./thread-list";
import { useFuseThread } from "./threads";
import { brandShadow, Button, colors, ErrorNotice, radius, s, Sheet, Skeleton, spacing } from "./ui";
import { useWorkspace } from "./workspace";

const tints = [colors.sky, colors.mint, colors.lavender, colors.pink, colors.yellow, colors.orange];

function ActivityCard({
  title,
  detail,
  icon: Icon,
  tint,
  current,
  onPress,
}: {
  title: string;
  detail: string;
  icon: LucideIcon;
  tint: string;
  current?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open conversation: ${title}. ${detail}`}
      accessibilityState={{ selected: !!current }}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: spacing[3],
        padding: spacing[3],
        paddingLeft: spacing[4],
        borderRadius: radius.page,
        backgroundColor: tint,
        borderWidth: 1,
        borderColor: current ? colors.nav : colors.card,
        boxShadow: brandShadow.card,
        transform: [{ scale: pressed ? 0.98 : 1 }],
      })}
    >
      <View
        style={{
          width: spacing[11],
          height: spacing[11],
          borderRadius: radius.full,
          backgroundColor: colors.card,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon size={20} strokeWidth={1.9} color={colors.text} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: spacing[0.5] }}>
        <Text numberOfLines={1} style={[s.text, { fontWeight: "700" }]}>
          {title}
        </Text>
        <Text numberOfLines={1} style={[s.small, { color: colors.muted }]}>
          {detail}
        </Text>
      </View>
      <View
        style={{
          width: spacing[10],
          height: spacing[10],
          borderRadius: radius.full,
          backgroundColor: colors.card,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ArrowUpRight size={18} color={colors.text} />
      </View>
    </Pressable>
  );
}

export function ChatActivitySheet({ onClose }: { onClose: () => void }) {
  const { enabled, selection, mainId, select, start } = useFuseThread();
  const { navigate } = useWorkspace();
  const threads = useSavedThreads(enabled, 30);
  const recent = threads.threads.filter((t) => t.id !== mainId && !t.archived);
  const openMain = () => {
    if (enabled) select({ id: mainId, existing: true });
    else navigate("chat");
    onClose();
  };
  return (
    <Sheet title="Chat activity" subtitle="Your conversations, newest first." onClose={onClose}>
      <View style={{ gap: spacing[3] }}>
        {enabled && (
          <Button
            primary
            icon={Plus}
            onPress={() => {
              start();
              onClose();
            }}
          >
            New side chat
          </Button>
        )}
        <ActivityCard
          title="Main chat"
          detail="Your ongoing conversation"
          icon={MessageCircle}
          tint={colors.navSoft}
          current={!enabled || selection.id === mainId}
          onPress={openMain}
        />
        {threads.isLoading && <Skeleton label="Loading your conversations" variant="rows" rows={3} />}
        <ErrorNotice error={threads.error?.message} onRetry={threads.error ? threads.refetchThreads : undefined} />
        {recent.map((thread, index) => (
          <ActivityCard
            key={thread.id}
            title={thread.name || "Untitled conversation"}
            detail={`Last used ${relativeDate(thread.updatedAt).replace(/^Just now$/, "just now")}`}
            icon={index % 2 ? Sparkles : MessagesSquare}
            tint={tints[index % tints.length] as string}
            current={selection.id === thread.id}
            onPress={() => {
              select({ id: thread.id, existing: true });
              onClose();
            }}
          />
        ))}
        {threads.hasMoreThreads && (
          <Button small busy={threads.isFetchingMoreThreads} onPress={threads.fetchMoreThreads}>
            Load more conversations
          </Button>
        )}
        {!threads.isLoading && !threads.error && recent.length === 0 && (
          <Text style={[s.muted, { textAlign: "center", paddingVertical: spacing[3] }]}>
            {enabled
              ? "Side chats you start show up here. Your main chat is always at the top."
              : "Your conversation is saved in your Daksha account."}
          </Text>
        )}
      </View>
    </Sheet>
  );
}
