// Settings card: "Topics I follow" for the news feed (GET/PUT /api/news/topics). Add a topic,
// remove one, accept or put away a suggestion, and turn the AI "why" line on or off. Topics are
// the only thing sent to news services, so the server refuses names and private words.
import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { errorText } from "./debo-api";
import { loadTopics, type NewsTopics, saveTopics } from "./news-data";
import { settingsChanged, useSettingsChanged } from "./settings-events";
import { Text } from "./text";
import { Button, Card, CheckRow, ErrorNotice, Field, s, SectionHeading, spacing } from "./ui";
import { useWorkspace } from "./workspace";

export function NewsTopicsSetting() {
  const { api } = useWorkspace();
  const [view, setView] = useState<NewsTopics | null>();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  const load = useCallback(async () => {
    try {
      setView(await loadTopics(api));
      setError("");
    } catch (e) {
      setError(errorText(e));
    }
  }, [api]);
  useEffect(() => {
    void load();
  }, [load]);
  useSettingsChanged(["news-topics"], load);

  // An API without news: nothing to show.
  if (view === null) return null;

  const topics = view?.topics.map((t) => t.keyword) ?? [];
  const max = view?.limits?.topicsMax ?? 12;
  const save = async (patch: Parameters<typeof saveTopics>[1], done: string) => {
    setBusy(true);
    setError("");
    setStatus("");
    try {
      setView(await saveTopics(api, patch));
      setStatus(done);
      settingsChanged("news-topics");
      return true;
    } catch (e) {
      setError(errorText(e));
      return false;
    } finally {
      setBusy(false);
    }
  };
  const add = async () => {
    const word = draft.trim();
    if (!word) return;
    if (await save({ topics: [...topics, word] }, `Following ${word}.`)) setDraft("");
  };

  return (
    <Card style={{ gap: spacing[3] }}>
      <SectionHeading title="Topics I follow" />
      <Text style={s.muted}>
        Your news feed shows stories on these. Only these words are sent to the news services, never your entries,
        names or anything else about you.
      </Text>
      {!view ? (
        <Text style={s.muted}>{error ? "" : "Loading…"}</Text>
      ) : (
        <>
          {topics.length ? (
            <View style={{ gap: spacing[2] }}>
              {topics.map((t) => (
                <View key={t} style={[s.between, { gap: spacing[2] }]}>
                  <Text style={[s.text, { flex: 1 }]}>{t}</Text>
                  <Button
                    small
                    disabled={busy}
                    accessibilityLabel={`Stop following ${t}`}
                    onPress={() => void save({ topics: topics.filter((x) => x !== t) }, `Stopped following ${t}.`)}
                  >
                    Stop following
                  </Button>
                </View>
              ))}
            </View>
          ) : (
            <Text style={s.muted}>You follow no topics yet. Add one, like cricket, AI or Bengaluru weather.</Text>
          )}
          {topics.length < max && (
            <View style={{ flexDirection: "row", gap: spacing[2], alignItems: "flex-end" }}>
              <View style={{ flex: 1 }}>
                <Field
                  label="Add a topic"
                  value={draft}
                  onChangeText={setDraft}
                  maxLength={view.limits?.keywordMax ?? 40}
                  placeholder="cricket"
                  onSubmitEditing={() => void add()}
                />
              </View>
              <Button small busy={busy} disabled={!draft.trim()} onPress={() => void add()}>
                Follow
              </Button>
            </View>
          )}
          {view.suggestions.length > 0 && topics.length < max && (
            <View style={{ gap: spacing[2] }}>
              <Text style={s.small}>Suggested from what you write. Nothing is followed until you tap Follow.</Text>
              {view.suggestions.map((t) => (
                <View key={t} style={[s.between, { gap: spacing[2] }]}>
                  <Text style={[s.text, { flex: 1 }]}>{t}</Text>
                  <View style={[s.row, { gap: spacing[2] }]}>
                    <Button small disabled={busy} accessibilityLabel={`Follow ${t}`} onPress={() => void save({ topics: [...topics, t] }, `Following ${t}.`)}>
                      Follow
                    </Button>
                    <Button small disabled={busy} accessibilityLabel={`Don't suggest ${t} again`} onPress={() => void save({ dismiss: t }, "Okay, I won't suggest it again.")}>
                      Not for me
                    </Button>
                  </View>
                </View>
              ))}
            </View>
          )}
          <CheckRow
            label="Add a short line on why each story may interest you (written by AI from the headline)"
            checked={view.why}
            onPress={() => void save({ why: !view.why }, view.why ? "The AI lines are off." : "The AI lines are on.")}
          />
        </>
      )}
      <ErrorNotice error={error} />
      {!!status && (
        <Text style={s.muted} accessibilityLiveRegion="polite">
          {status}
        </Text>
      )}
    </Card>
  );
}
