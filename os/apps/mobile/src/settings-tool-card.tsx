// Cards for the tools that change the app by asking (apps/server/src/settings-tools.ts):
// update_talk_settings, update_identity and update_reminders show what changed, and
// open_screen shows a button that opens the screen. When a change is saved, any open
// settings screen loads again, so it shows the new value.
import { Check, SlidersHorizontal } from "lucide-react-native";
import { useEffect, useRef } from "react";
import { ActivityIndicator, View } from "react-native";
import { Text } from "./text";
import { z } from "zod";
import { useAgentWorkspace } from "./agent-workspace";
import { screenLink, screenTitle } from "./screen-links";
import { type SettingsKind, settingsChanged } from "./settings-events";
import { Button, Card, colors, ErrorNotice, s, spacing } from "./ui";
import { useWorkspace } from "./workspace";

const Saved = z.object({
  status: z.literal("saved"),
  kind: z.enum(["talk-settings", "identity", "reminders", "news-topics"]),
  changed: z.array(z.string()).default([]),
  screen: z.string().optional(),
});
const Ready = z.object({
  status: z.literal("ready"),
  screen: z.string(),
  title: z.string().optional(),
  reason: z.string().optional(),
});
const Failed = z.object({ error: z.string() });

function parse(result: unknown): unknown {
  if (typeof result !== "string") return result;
  try {
    return JSON.parse(result);
  } catch {
    return undefined;
  }
}

/** A button that opens one of the app's screens, or a kind note when this app doesn't have it yet. */
function OpenScreenButton({ screen, label }: { screen: string; label?: string }) {
  const { open, navigate } = useWorkspace();
  const link = screenLink(screen);
  const title = screenTitle(screen);
  if (link.kind === "missing")
    return (
      <Text style={s.muted}>
        {title ? `${title} isn't in this version of the app yet.` : "That screen isn't in this version of the app yet."} Try
        again after the app updates.
      </Text>
    );
  const go = () => (link.kind === "sheet" ? open({ type: link.detail }) : navigate(link.section));
  return (
    <Button small primary icon={SlidersHorizontal} onPress={go}>
      {label ?? `Open ${title ?? "it"}`}
    </Button>
  );
}

export function SettingsToolCard({ result, loading }: { result: unknown; loading: boolean }) {
  const { refresh } = useAgentWorkspace();
  const value = parse(result);
  const saved = Saved.safeParse(value);
  const failed = Failed.safeParse(value);
  // Only a change made while this card was on screen reloads the settings. Opening an old
  // conversation shows its cards without reloading anything.
  const startedLoading = useRef(loading);
  const announced = useRef(false);
  const kind: SettingsKind | undefined = saved.success ? saved.data.kind : undefined;
  useEffect(() => {
    if (loading || !kind || !startedLoading.current || announced.current) return;
    announced.current = true;
    settingsChanged(kind);
    if (kind === "identity") void refresh().catch(() => {});
  }, [loading, kind, refresh]);

  return (
    <Card style={{ padding: 14, gap: spacing[2], backgroundColor: colors.subtle, maxWidth: 440, width: "100%" }}>
      <View style={[s.row, { gap: 10 }]}>
        {loading ? <ActivityIndicator size="small" color={colors.blueDark} /> : <Check size={18} color={colors.blueDark} />}
        <Text style={s.text}>
          {loading ? "Changing a setting…" : saved.success ? "Setting changed" : "Couldn't change the setting"}
        </Text>
      </View>
      {saved.success
        ? saved.data.changed.map((line) => (
            <Text key={line} style={s.muted}>
              {line}
            </Text>
          ))
        : null}
      {failed.success ? <ErrorNotice error={failed.data.error} /> : null}
      {saved.success && saved.data.screen ? <OpenScreenButton screen={saved.data.screen} label="Open settings" /> : null}
    </Card>
  );
}

export function ScreenToolCard({ result, loading }: { result: unknown; loading: boolean }) {
  const value = parse(result);
  const ready = Ready.safeParse(value);
  const failed = Failed.safeParse(value);
  return (
    <Card style={{ padding: 14, gap: spacing[2], backgroundColor: colors.subtle, maxWidth: 440, width: "100%" }}>
      <View style={[s.row, { gap: 10 }]}>
        {loading ? <ActivityIndicator size="small" color={colors.blueDark} /> : <SlidersHorizontal size={18} color={colors.blueDark} />}
        <Text style={s.text}>
          {loading ? "Finding the screen…" : ready.success ? (screenTitle(ready.data.screen) ?? ready.data.title ?? "A screen") : "Couldn't find that screen"}
        </Text>
      </View>
      {ready.success && ready.data.reason ? <Text style={s.muted}>{ready.data.reason}</Text> : null}
      {failed.success ? <ErrorNotice error={failed.data.error} /> : null}
      {ready.success ? <OpenScreenButton screen={ready.data.screen} /> : null}
    </Card>
  );
}
