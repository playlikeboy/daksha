// Settings cards: "Triggers" (GET /api/triggers) and "Suggestions" (GET /api/proposals).
// Triggers are made by asking Daksha in chat; here they can be paused, deleted, put back for
// 7 days, and a webhook's address and secret shown. Suggestions are lines worth remembering and
// skill drafts that wait here; nothing is saved until the person taps Save (decision 39).
import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { z } from "zod";
import { errorText } from "./debo-api";
import { Text } from "./text";
import { Button, Card, ErrorNotice, s, SectionHeading, spacing } from "./ui";
import { useWorkspace } from "./workspace";

const triggerView = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(["schedule", "webhook", "app"]),
  enabled: z.boolean(),
  instructions: z.string(),
  schedule: z.object({ every: z.string(), at: z.string(), weekday: z.number().optional() }).optional(),
  app: z.object({ app: z.string(), event: z.string(), state: z.string(), error: z.string().optional() }).optional(),
  runs: z.number(),
  lastRunAt: z.string().optional(),
  deletedAt: z.string().optional(),
});
export const triggerList = z.object({ triggers: z.array(triggerView), deleted: z.array(triggerView) });
type TriggerView = z.infer<typeof triggerView>;

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** "Every weekday at 08:00", "When gmail has GMAIL_NEW_GMAIL_MESSAGE", "When its web address is called". */
export function triggerWhen(t: TriggerView) {
  if (t.schedule) {
    const { every, at, weekday } = t.schedule;
    if (every === "hour") return `Every hour at :${at.slice(3)}`;
    if (every === "week") return `Every ${DAYS[weekday ?? 1]} at ${at}`;
    return `Every ${every} at ${at}`;
  }
  if (t.app) return `When ${t.app.app} has ${t.app.event.toLowerCase().replace(/_/g, " ")}`;
  return "When its web address is called";
}

export function TriggersSetting() {
  const { api } = useWorkspace();
  const [view, setView] = useState<z.infer<typeof triggerList> | null>();
  const [secret, setSecret] = useState<{ id: string; webhookUrl: string; webhookSecret: string }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setView(triggerList.parse(await api.request("/api/triggers")));
      setError("");
    } catch (e) {
      if (e instanceof Error && /\(404\)|not found/i.test(e.message)) setView(null);
      else setError(errorText(e));
    }
  }, [api]);
  useEffect(() => {
    void load();
  }, [load]);
  if (view === null) return null;

  const act = async (path: string, body: unknown, method: string) => {
    setBusy(true);
    setError("");
    try {
      await api.request<unknown>(path, body, method);
      await load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const showSecret = async (id: string) => {
    try {
      setSecret({ id, ...z.object({ webhookUrl: z.string(), webhookSecret: z.string() }).parse(await api.request(`/api/triggers/${id}/secret`)) });
    } catch (e) {
      setError(errorText(e));
    }
  };

  return (
    <Card style={{ gap: spacing[3] }}>
      <SectionHeading title="Triggers" />
      <Text style={s.muted}>
        Things Daksha starts on its own: on a schedule, when an app you connected has news, or when another service calls a
        private address. Ask in chat to make one. Anything that leaves Daksha still waits for your tap.
      </Text>
      {!view ? (
        <Text style={s.muted}>{error ? "" : "Loading…"}</Text>
      ) : view.triggers.length === 0 ? (
        <Text style={s.muted}>No triggers yet. Try "every weekday at 8, sum up my calendar".</Text>
      ) : (
        view.triggers.map((t) => (
          <View key={t.id} style={{ gap: spacing[1] }}>
            <Text style={s.text}>
              {t.name}
              {t.enabled ? "" : " (paused)"}
            </Text>
            <Text style={s.small}>
              {triggerWhen(t)}. Ran {t.runs} {t.runs === 1 ? "time" : "times"}.
              {t.app?.state === "error" ? ` ${t.app.error ?? "It can't watch the app just now."}` : ""}
            </Text>
            <View style={{ flexDirection: "row", gap: spacing[2], flexWrap: "wrap" }}>
              <Button small disabled={busy} onPress={() => void act(`/api/triggers/${t.id}`, { enabled: !t.enabled }, "PATCH")}>
                {t.enabled ? "Pause" : "Resume"}
              </Button>
              {t.kind === "webhook" && (
                <Button small disabled={busy} onPress={() => void (secret?.id === t.id ? setSecret(undefined) : showSecret(t.id))}>
                  {secret?.id === t.id ? "Hide address" : "Show address and secret"}
                </Button>
              )}
              <Button small danger disabled={busy} onPress={() => void act(`/api/triggers/${t.id}`, undefined, "DELETE")}>
                Delete
              </Button>
            </View>
            {secret?.id === t.id && (
              <Text style={s.small} selectable>
                Address: {secret.webhookUrl}
                {"\n"}Secret: {secret.webhookSecret}
                {"\n"}Sign each call the Standard Webhooks way (webhook-id, webhook-timestamp, webhook-signature).
              </Text>
            )}
          </View>
        ))
      )}
      {view && view.deleted.length > 0 && (
        <View style={{ gap: spacing[1] }}>
          <Text style={s.small}>Deleted in the last 7 days:</Text>
          {view.deleted.map((t) => (
            <View key={t.id} style={{ flexDirection: "row", gap: spacing[2], alignItems: "center" }}>
              <Text style={[s.small, { flex: 1 }]}>{t.name}</Text>
              <Button small disabled={busy} onPress={() => void act(`/api/triggers/${t.id}/restore`, {}, "POST")}>
                Put back
              </Button>
            </View>
          ))}
        </View>
      )}
      <ErrorNotice error={error} />
    </Card>
  );
}

const proposal = z.object({
  id: z.string(),
  kind: z.enum(["memory", "skill"]),
  text: z.string().optional(),
  skill: z.object({ name: z.string(), description: z.string(), body: z.string() }).optional(),
  warnings: z.array(z.string()),
  from: z.object({ threadId: z.string(), title: z.string() }),
});
export const proposalList = z.object({ proposals: z.array(proposal) });

export function SuggestionsSetting() {
  const { api } = useWorkspace();
  const [items, setItems] = useState<z.infer<typeof proposal>[] | null>();
  const [open, setOpen] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  const load = useCallback(async () => {
    try {
      setItems(proposalList.parse(await api.request("/api/proposals")).proposals);
      setError("");
    } catch (e) {
      if (e instanceof Error && /\(404\)|not found/i.test(e.message)) setItems(null);
      else setError(errorText(e));
    }
  }, [api]);
  useEffect(() => {
    void load();
  }, [load]);
  if (items === null) return null;

  const decide = async (id: string, yes: boolean) => {
    setBusy(true);
    setError("");
    try {
      await api.request<unknown>(`/api/proposals/${id}/${yes ? "accept" : "reject"}`, {}, "POST");
      setStatus(yes ? "Saved." : "Dropped. It won't be suggested again.");
      await load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={{ gap: spacing[3] }}>
      <SectionHeading title="Suggestions" />
      <Text style={s.muted}>
        Things you said that may be worth remembering, and skill drafts you asked for. Nothing is kept until you tap Save.
      </Text>
      {!items ? (
        <Text style={s.muted}>{error ? "" : "Loading…"}</Text>
      ) : items.length === 0 ? (
        <Text style={s.muted}>Nothing waiting.</Text>
      ) : (
        items.map((p) => (
          <View key={p.id} style={{ gap: spacing[1] }}>
            {p.kind === "memory" ? (
              <Text style={s.text}>"{p.text}"</Text>
            ) : (
              <Text style={s.text}>Skill draft: {p.skill?.name}</Text>
            )}
            <Text style={s.small}>From {p.from.title}</Text>
            {p.warnings.map((w) => (
              <Text key={w} style={s.small}>
                {w}
              </Text>
            ))}
            {p.kind === "skill" && open === p.id && (
              <Text style={s.small} selectable>
                {p.skill?.body}
              </Text>
            )}
            <View style={{ flexDirection: "row", gap: spacing[2], flexWrap: "wrap" }}>
              {p.kind === "skill" && (
                <Button small disabled={busy} onPress={() => setOpen(open === p.id ? undefined : p.id)}>
                  {open === p.id ? "Hide draft" : "Read draft"}
                </Button>
              )}
              <Button small primary disabled={busy || (p.kind === "skill" && open !== p.id)} onPress={() => void decide(p.id, true)}>
                Save
              </Button>
              <Button small disabled={busy} onPress={() => void decide(p.id, false)}>
                No thanks
              </Button>
            </View>
          </View>
        ))
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
