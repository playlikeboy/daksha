// Chat cards for the custom-people tools. open_custom_person_upload shows a button that opens the
// upload sheet (files can't come through chat or a call). The others say what changed.
import { FileUp, UserRound } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { z } from "zod";
import { CustomPersonUploadSheet } from "./custom-person-upload";
import { Button, Card, colors, s } from "./ui";

const Brief = z.object({ id: z.string(), name: z.string(), relation: z.string().optional() });
const Result = z.object({
  status: z.string(),
  person: Brief.optional(),
  character: z.string().optional(),
  error: z.string().optional(),
});

const CONSENT = "I'm allowed to use these files, and this is for my own private use.";

export function CustomPersonToolCard({ name, result, loading }: { name: string; result: unknown; loading: boolean }) {
  const [open, setOpen] = useState(false);
  let value = result;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      value = undefined;
    }
  }
  const parsed = Result.safeParse(value);
  const r = parsed.success ? parsed.data : undefined;
  const who = r?.person?.name ?? r?.character ?? "them";
  const title = loading
    ? "Working on it…"
    : !r || r.status === "failed"
      ? "That didn't work"
      : name === "open_custom_person_upload"
        ? `Add chats, photos and videos for ${who}`
        : name === "create_custom_person"
          ? `Made ${who}`
          : name === "update_custom_person"
            ? `Changed ${who}`
            : name === "talk_as"
              ? `Talking as ${who}`
              : "People you made";
  return (
    <Card style={{ padding: 14, gap: 10, backgroundColor: colors.subtle, maxWidth: 440, width: "100%" }}>
      <View style={[s.row, { gap: 10 }]}>
        {loading ? <ActivityIndicator size="small" color={colors.blueDark} /> : <UserRound size={18} color={colors.blueDark} />}
        <Text style={s.text}>{title}</Text>
      </View>
      {r?.error ? <Text style={s.muted}>{r.error}</Text> : null}
      {name === "open_custom_person_upload" && r?.person && (
        <>
          <Text style={s.small}>Daksha reads them once, builds a short profile, then deletes the files.</Text>
          <View style={s.row}>
            <Button small primary icon={FileUp} onPress={() => setOpen(true)}>
              Add their files
            </Button>
          </View>
          {open && <CustomPersonUploadSheet person={r.person} consentText={CONSENT} onClose={() => setOpen(false)} />}
        </>
      )}
    </Card>
  );
}
