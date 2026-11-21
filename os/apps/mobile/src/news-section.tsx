// "News for you": story cards on the topics the person follows (GET /api/news). Self-contained,
// so a screen only has to place it: <NewsSection onOpenTopics={...} />. Each card shows the
// headline, the site, how long ago, a picture when the site gives one, the optional AI "why"
// line (labelled), and opens the story in the browser. An API without news reads as empty.
import { ExternalLink, Newspaper } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { Image, Linking, Pressable, View } from "react-native";
import { errorText } from "./debo-api";
import { EMPTY_FEED, loadNews, type NewsFeed, type NewsStory, safeLink, siteName } from "./news-data";
import { relativeDate } from "./relative-date";
import { useSettingsChanged } from "./settings-events";
import { Text } from "./text";
import { Button, Card, colors, ErrorNotice, radius, s, Skeleton, spacing } from "./ui";
import { useWorkspace } from "./workspace";

/** While the server is still fetching, ask again once after this long. */
const RECHECK_MS = 15_000;

function StoryCard({ story, whyLabel, onError }: { story: NewsStory; whyLabel?: string; onError: (e: string) => void }) {
  const link = safeLink(story.url);
  const [pictureOk, setPictureOk] = useState(true);
  const open = () => {
    if (link) void Linking.openURL(link).catch((e) => onError(errorText(e)));
  };
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${story.title}. From ${siteName(story.source)}, ${relativeDate(story.publishedAt)}. Opens in your browser.`}
      accessibilityHint="Opens the story on the news site"
      disabled={!link}
      onPress={open}
      style={({ pressed }) => ({
        flexDirection: "row",
        gap: spacing[3],
        padding: spacing[3],
        borderRadius: radius.chat,
        borderWidth: 1,
        borderColor: colors.line,
        backgroundColor: pressed ? colors.subtle : colors.card,
      })}
    >
      <View style={{ flex: 1, gap: spacing[1] }}>
        <Text style={[s.text, { fontWeight: "600" }]} numberOfLines={3}>
          {story.title}
        </Text>
        <View style={[s.row, { gap: spacing[1], flexWrap: "wrap" }]}>
          <Text style={s.small}>
            {siteName(story.source)} · {relativeDate(story.publishedAt)} · {story.topic}
          </Text>
          <ExternalLink size={14} color={colors.muted} accessibilityElementsHidden importantForAccessibility="no" />
        </View>
        {story.why ? (
          <Text style={s.small} accessibilityLabel={`${whyLabel ?? "Written by AI"}: ${story.why}`}>
            <Text style={[s.small, { fontWeight: "600" }]}>AI: </Text>
            {story.why}
          </Text>
        ) : null}
      </View>
      {story.image && pictureOk ? (
        <Image
          source={{ uri: story.image }}
          onError={() => setPictureOk(false)}
          accessibilityIgnoresInvertColors
          accessible={false}
          style={{ width: spacing[12] + spacing[4], height: spacing[12] + spacing[4], borderRadius: radius.chat, backgroundColor: colors.subtle }}
        />
      ) : null}
    </Pressable>
  );
}

export function NewsSection({
  limit = 6,
  title = "News for you",
  onOpenTopics,
}: {
  limit?: number;
  title?: string;
  /** Opens the "Topics I follow" setting. Without it, the empty state only explains. */
  onOpenTopics?: () => void;
}) {
  const { api } = useWorkspace();
  const [feed, setFeed] = useState<NewsFeed>();
  const [error, setError] = useState("");
  const rechecked = useRef(false);

  const load = useCallback(async () => {
    try {
      const next = await loadNews(api, limit);
      setFeed(next);
      setError("");
      return next;
    } catch (e) {
      setFeed((old) => old ?? EMPTY_FEED);
      setError(errorText(e));
      return undefined;
    }
  }, [api, limit]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    void load().then((next) => {
      if (next?.refreshing && !rechecked.current) {
        rechecked.current = true;
        timer = setTimeout(() => void load(), RECHECK_MS);
      }
    });
    return () => clearTimeout(timer);
  }, [load]);
  // Following a topic in chat or in settings shows here too.
  useSettingsChanged(["news-topics"], load);

  return (
    <Card style={{ gap: spacing[3] }}>
      <View style={[s.row, { gap: spacing[2] }]}>
        <Newspaper size={18} color={colors.blueDark} accessibilityElementsHidden importantForAccessibility="no" />
        <Text style={s.heading} accessibilityRole="header">
          {title}
        </Text>
      </View>
      {!feed ? (
        <Skeleton label="Loading your news" rows={2} />
      ) : feed.stories.length ? (
        <View style={{ gap: spacing[2] }}>
          {feed.stories.map((story) => (
            <StoryCard key={story.id} story={story} whyLabel={feed.whyLabel} onError={setError} />
          ))}
          {feed.attribution ? <Text style={s.small}>{feed.attribution}</Text> : null}
        </View>
      ) : feed.topics.length ? (
        <Text style={s.muted}>
          {feed.refreshing ? "Finding stories on your topics…" : `No new stories on ${feed.topics.join(", ")} right now.`}
        </Text>
      ) : (
        <View style={{ gap: spacing[2] }}>
          <Text style={s.muted}>Follow a few topics, like cricket or AI, and stories about them show here.</Text>
          {onOpenTopics ? (
            <Button small onPress={onOpenTopics} style={{ alignSelf: "flex-start" }}>
              Choose topics
            </Button>
          ) : (
            <Text style={s.small}>You can also say "follow cricket" in Chat.</Text>
          )}
        </View>
      )}
      <ErrorNotice error={error} onRetry={() => void load()} />
    </Card>
  );
}
