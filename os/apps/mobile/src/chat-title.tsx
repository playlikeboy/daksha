// The name of the open side chat, under the header, with a small way to rename it.
//
// The name also drives the address (/chat/<name>-<id>) and the page title. A new chat is
// named after its first question by the server (no extra AI call), a voice call's chat is
// "Voice call, 14 November", and the person can rename it here. The id at the end of the
// address stays the truth; renaming only changes the readable part.
import { Pencil } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { Platform, Pressable, View } from "react-native";
import { Text } from "./text";
import { errorText } from "./debo-api";
import { pathFor, rememberChatName, titleFor } from "./routes";
import { Button, colors, ErrorNotice, Field, s, spacing } from "./ui";
import { useWorkspace } from "./workspace";

type Thread = { id: string; name: string | null };

export function ChatTitle({ id }: { id: string }) {
  const { api, section } = useWorkspace();
  const [name, setName] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const show = useCallback(
    (next: string | null) => {
      setName(next);
      rememberChatName(id, next);
      if (Platform.OS !== "web" || section !== "chat" || !next) return;
      // Put the readable name in the address and the tab title, without adding a history entry.
      const path = pathFor("chat", { threadId: id });
      if (globalThis.location?.pathname.startsWith("/chat/") && globalThis.location.pathname !== path)
        globalThis.history?.replaceState(null, "", path);
      globalThis.document.title = titleFor({ section: "chat", threadId: id });
    },
    [id, section],
  );

  // Read the name when the chat opens. A brand new chat is named after its first answer, so look
  // a few more times until it has a name.
  useEffect(() => {
    setName(null);
    setEditing(false);
    let active = true;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const look = async () => {
      try {
        const thread = await api.request<Thread>(`/api/threads/${encodeURIComponent(id)}`);
        if (!active) return;
        if (thread.name) return show(thread.name);
      } catch {
        // A chat that has not been saved yet has no record. Look again shortly.
      }
      if (active && ++tries < 8) timer = setTimeout(() => void look(), 4000);
    };
    void look();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [api, id, show]);

  async function save() {
    const next = draft.trim();
    if (!next) return;
    setBusy(true);
    setError("");
    try {
      const thread = await api.request<Thread>(`/api/threads/${encodeURIComponent(id)}`, { name: next }, "PATCH");
      show(thread.name);
      setEditing(false);
    } catch (e) {
      setError(
        /not found/i.test(errorText(e)) ? "Send your first message, then you can name this chat." : errorText(e),
      );
    } finally {
      setBusy(false);
    }
  }

  if (editing)
    return (
      <View style={{ gap: spacing[2], marginBottom: spacing[2] }}>
        <Field label="Name this chat" value={draft} onChangeText={setDraft} maxLength={80} autoFocus />
        <View style={[s.row, { gap: spacing[2] }]}>
          <Button small primary busy={busy} disabled={!draft.trim()} onPress={() => void save()}>
            Save name
          </Button>
          <Button small onPress={() => setEditing(false)}>
            Cancel
          </Button>
        </View>
        <ErrorNotice error={error} />
      </View>
    );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Chat name: ${name ?? "Side chat"}. Rename`}
      onPress={() => {
        setDraft(name ?? "");
        setEditing(true);
      }}
      style={[s.row, { alignSelf: "center", gap: spacing[1.5], minHeight: spacing[11], maxWidth: "90%" }]}
    >
      <Text numberOfLines={1} style={[s.small, { textAlign: "center", flexShrink: 1, color: colors.text, fontWeight: "600" }]}>
        {name ?? "Side chat"}
      </Text>
      <Pencil size={13} color={colors.muted} />
    </Pressable>
  );
}
