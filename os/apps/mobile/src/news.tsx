// Home's news card. It asks Daksha's own server for the person's news (`/api/news`) and
// draws nothing at all while that route does not exist (404), so Home never shows an empty
// or broken box. The data shape and the 404 rule live in news-data.ts.
import { ArrowUpRight, Newspaper } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Linking, Pressable, View } from "react-native";
import { Glass } from "./genie";
import { type NewsItem, type NewsState, readNews } from "./news-data";
import { relativeDate } from "./relative-date";
import { Text } from "./text";
import { colors, radius, s, spacing } from "./ui";
import { useWorkspace } from "./workspace";

/** Load the feed once per screen. Returns "absent" when the server has no news route. */
export function useNews(limit = 3): NewsState {
  const { api } = useWorkspace();
  const [state, setState] = useState<NewsState>({ kind: "loading" });
  useEffect(() => {
    let live = true;
    void fetch(api.url(`/api/news?limit=${limit}`), { headers: { Authorization: `Bearer ${api.token}` } })
      .then(readNews)
      .catch((): NewsState => ({ kind: "error" }))
      .then((next) => live && setState(next));
    return () => {
      live = false;
    };
  }, [api, limit]);
  return state;
}

function NewsRow({ item }: { item: NewsItem }) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${item.title}. From ${item.source}. Opens the article`}
      onPress={() => void Linking.openURL(item.url)}
      style={({ pressed }) => [
        s.row,
        {
          gap: spacing[3],
          alignItems: "flex-start",
          padding: spacing[3],
          marginHorizontal: -spacing[3],
          borderRadius: radius.container,
          backgroundColor: pressed ? colors.subtle : "transparent",
        },
      ]}
    >
      <View style={{ flex: 1, gap: spacing[1] }}>
        <Text style={[s.text, { fontWeight: "700" }]} numberOfLines={2}>
          {item.title}
        </Text>
        {!!item.summary && (
          <Text style={s.muted} numberOfLines={2}>
            {item.summary}
          </Text>
        )}
        <Text style={s.small}>
          {item.source} · {relativeDate(item.publishedAt)}
          {item.reason ? ` · ${item.reason}` : ""}
        </Text>
      </View>
      <ArrowUpRight size={18} color={colors.muted} />
    </Pressable>
  );
}

/**
 * Personal news on Home. Renders nothing while loading, when the route is missing (404),
 * or when there is nothing to show. An error shows one quiet line instead of the list.
 * Wire-up: build `GET /api/news?limit=n` answering `{ items: NewsItem[] }` (news-data.ts).
 */
export function NewsSection({ limit = 3 }: { limit?: number }) {
  const state = useNews(limit);
  if (state.kind === "loading" || state.kind === "absent") return null;
  if (state.kind === "ready" && state.items.length === 0) return null;
  return (
    <View style={{ gap: spacing[3] }}>
      <View style={[s.row, { gap: spacing[2] }]}>
        <Newspaper size={18} color={colors.text} />
        <Text accessibilityRole="header" style={s.heading}>
          News for you
        </Text>
      </View>
      <Glass style={{ padding: spacing[4], gap: spacing[1] }}>
        {state.kind === "error" ? (
          <Text style={s.muted}>Your news did not load. It will try again next time you open Home.</Text>
        ) : (
          state.items.map((item) => <NewsRow key={item.id} item={item} />)
        )}
      </Glass>
    </View>
  );
}
