// Things waiting for a yes, shown inside the Talk popup itself.
//
// The popup covers the whole screen, so a review that Debo prepared during a call
// (anything that leaves Debo: a connected app, email, calendar, or deleting) would
// otherwise be invisible until the call was minimised. Each card says plainly what
// will happen and has two buttons: Approve and Not now. The yes is always a tap here;
// saying "yes" out loud never counts. Saving inside Debo (the journal, memories, tasks)
// needs no review any more, so it never shows here.
import { Check, X } from "lucide-react-native";
import { useState } from "react";
import { Text, View } from "react-native";
import type { ActionProposal } from "../../../packages/domain/src";
import { reviewsWaiting } from "./debo-talk-call";
import { Button, Card, colors, ErrorNotice, s, spacing } from "./ui";
import { useWorkspace } from "./workspace";

/** One plain sentence about what approving does. */
export function approvalSummary(action: Pick<ActionProposal, "kind" | "title" | "account" | "data">): string {
  const where = action.account ? ` in ${action.account}` : "";
  switch (action.kind) {
    case "email.send":
      return `Debo will send this email${where}.`;
    case "calendar.create":
    case "calendar.update":
    case "calendar.delete":
      return `Debo will change your calendar${where}.`;
    case "connector.call":
      return `Debo will do this${where}.`;
    default:
      return "Debo will do this only if you say yes.";
  }
}

function lines(action: ActionProposal): { label: string; value: string }[] {
  const raw = action.data.lines;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((l): l is { label: string; value: string } => !!l && typeof l.label === "string" && typeof l.value === "string")
    .slice(0, 4);
}

export function TalkApprovals() {
  const { workspace, api, refresh, notify } = useWorkspace();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const waiting = reviewsWaiting(workspace.actions);
  if (waiting.length === 0) return null;

  async function decide(action: ActionProposal, decision: "approve" | "deny") {
    setBusy(action.id);
    setError("");
    try {
      const result = await api.request<ActionProposal>(`/api/actions/${action.id}/decide`, {
        decision,
        hash: action.hash,
      });
      await refresh();
      notify(
        decision === "deny"
          ? "Okay, nothing was changed."
          : result.status === "succeeded"
            ? "Done."
            : (result.error ?? "That did not finish. Open Tasks to see why."),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "That did not work. Try again.");
    } finally {
      setBusy("");
    }
  }

  return (
    <View
      accessibilityRole="alert"
      accessibilityLabel="Waiting for your yes"
      style={{ alignSelf: "stretch", gap: spacing[2] }}
    >
      {waiting.slice(0, 2).map((action) => (
        <Card key={action.id} style={{ padding: spacing[3], gap: spacing[2], backgroundColor: colors.subtle }}>
          <Text style={[s.small, { color: colors.blueDark, fontWeight: "600" }]}>Waiting for your yes</Text>
          <Text style={[s.text, { fontWeight: "600" }]}>{action.title}</Text>
          <Text style={s.muted}>{approvalSummary(action)}</Text>
          {lines(action).map((line) => (
            <Text key={line.label} numberOfLines={2} style={s.small}>
              {line.label}: {line.value}
            </Text>
          ))}
          <View style={[s.row, { gap: spacing[2] }]}>
            <Button primary small icon={Check} busy={busy === action.id} onPress={() => void decide(action, "approve")}>
              Approve
            </Button>
            <Button small icon={X} disabled={busy === action.id} onPress={() => void decide(action, "deny")}>
              Not now
            </Button>
          </View>
        </Card>
      ))}
      {waiting.length > 2 && (
        <Text style={[s.small, { textAlign: "center" }]}>{waiting.length - 2} more waiting in Tasks.</Text>
      )}
      <ErrorNotice error={error} />
    </View>
  );
}
