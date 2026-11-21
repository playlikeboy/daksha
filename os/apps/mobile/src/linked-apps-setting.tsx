// Settings card: "Linked apps" (GET /api/linked-apps). Text Daksha by SMS, WhatsApp or
// Telegram: get a code here, send "/link CODE" from the app, and that number or chat is linked.
// Without the server's keys for any of them, the card says messaging apps aren't set up yet.
import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { z } from "zod";
import { errorText } from "./debo-api";
import { Text } from "./text";
import { Button, Card, ErrorNotice, s, SectionHeading, spacing } from "./ui";
import { useWorkspace } from "./workspace";

export const linkedApps = z.object({
  available: z.object({
    sms: z.object({ number: z.string() }).nullable(),
    whatsapp: z.object({}).nullable(),
    telegram: z.object({ username: z.string().optional() }).nullable(),
  }),
  linked: z.array(z.object({ channel: z.enum(["sms", "whatsapp", "telegram"]), address: z.string(), linkedAt: z.string() })),
  code: z.string().optional(),
  expiresAt: z.string().optional(),
});
type LinkedApps = z.infer<typeof linkedApps>;
const NAMES = { sms: "SMS", whatsapp: "WhatsApp", telegram: "Telegram" } as const;

export function LinkedAppsSetting() {
  const { api } = useWorkspace();
  const [view, setView] = useState<LinkedApps | null>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setView(linkedApps.parse(await api.request("/api/linked-apps")));
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

  const act = async (path: string, method: string) => {
    setBusy(true);
    setError("");
    try {
      setView(linkedApps.parse(await api.request<unknown>(path, method === "POST" ? {} : undefined, method)));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const offered = view ? (Object.keys(NAMES) as (keyof typeof NAMES)[]).filter((k) => view.available[k]) : [];
  const where = view
    ? offered
        .map((k) =>
          k === "sms" && view.available.sms
            ? `text ${view.available.sms.number}`
            : k === "telegram" && view.available.telegram?.username
              ? `message @${view.available.telegram.username} on Telegram`
              : `message Daksha on ${NAMES[k]}`,
        )
        .join(", or ")
    : "";

  return (
    <Card style={{ gap: spacing[3] }}>
      <SectionHeading title="Linked apps" />
      {!view ? (
        <Text style={s.muted}>{error ? "" : "Loading…"}</Text>
      ) : offered.length === 0 ? (
        <Text style={s.muted}>Messaging apps aren't set up yet.</Text>
      ) : (
        <>
          <Text style={s.muted}>
            Write to Daksha from {offered.map((k) => NAMES[k]).join(", ")}. Messages land in your main chat here. Anything that
            sends, pays or changes something still waits for your tap in this app. The service carries your messages, so
            avoid sending passwords.
          </Text>
          {view.linked.map((l) => (
            <View key={l.channel} style={{ flexDirection: "row", gap: spacing[2], alignItems: "center" }}>
              <Text style={[s.text, { flex: 1 }]}>
                {NAMES[l.channel]}: {l.address}
              </Text>
              <Button small disabled={busy} onPress={() => void act(`/api/linked-apps/${l.channel}`, "DELETE")}>
                Unlink
              </Button>
            </View>
          ))}
          {view.code ? (
            <Text style={s.text} accessibilityLiveRegion="polite" selectable>
              To link, {where}, and send: /link {view.code}
              {"\n"}The code works for 15 minutes.
            </Text>
          ) : null}
          <Button small busy={busy} onPress={() => void act("/api/linked-apps/code", "POST")}>
            {view.code ? "Get a new code" : "Link an app"}
          </Button>
          {view.code && (
            <Button small disabled={busy} onPress={() => void load()}>
              I've sent it, check again
            </Button>
          )}
        </>
      )}
      <ErrorNotice error={error} />
    </Card>
  );
}
