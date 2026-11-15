// A promise Debo found in a journal entry ("I told Mum I'd call on Sunday"), shown as a
// suggestion with the entry it came from. Nothing happens until the person taps:
// "Remind me" makes a reminder, "Dismiss" puts it away for good.
import { useState } from "react";
import { Text, View } from "react-native";
import type { Idea } from "../../../packages/domain/src/agent";
import { useAgentWorkspace } from "./agent-workspace";
import { errorText } from "./debo-api";
import { syncDeviceReminders } from "./debo-device-reminders";
import { SourceChips } from "./debo-source-chips";
import { Button, colors, ErrorNotice, fontSize, s, spacing } from "./ui";
import { useWorkspace } from "./workspace";

export function PromiseCard({ idea }: { idea: Idea }) {
  const { mutate } = useAgentWorkspace();
  const { api } = useWorkspace();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const quote = idea.evidence[0];
  async function act(action: "accept" | "dismiss") {
    setBusy(true);
    setError("");
    try {
      await mutate<Idea>(`/ideas/${idea.id}`, { action });
      // A phone with reminders on holds the new one itself.
      if (action === "accept") await syncDeviceReminders(api).catch(() => {});
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={{ paddingVertical: spacing[4], borderBottomWidth: 1, borderBottomColor: colors.line, gap: spacing[3] }}>
      <Text style={s.small}>A promise from your journal</Text>
      <Text style={[s.heading, { fontSize: fontSize.lg }]}>{idea.title}</Text>
      {!!quote && (
        <Text selectable style={[s.text, { fontStyle: "italic" }]}>
          "{quote.excerpt}"
        </Text>
      )}
      <Text style={s.muted}>{idea.reason}</Text>
      {quote?.kind === "journal" && <SourceChips sources={[{ id: quote.id, label: quote.title }]} />}
      <ErrorNotice error={error} />
      <View style={[s.row, { gap: spacing[2], flexWrap: "wrap" }]}>
        <Button primary busy={busy} onPress={() => void act("accept")}>
          Remind me
        </Button>
        <Button disabled={busy} onPress={() => void act("dismiss")}>
          Dismiss
        </Button>
      </View>
    </View>
  );
}
