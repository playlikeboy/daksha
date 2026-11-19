// "Advanced: use your own keys", folded away at the bottom of Settings. Most people never need it.
// A person with their own Anthropic or OpenRouter account can paste a key; their chats, calls and
// pictures then run on that account. The server checks each key with one cheap call before it
// keeps it, stores it encrypted, and never sends it back: this screen only ever sees "ends in 1234".
// See apps/server/src/own-keys/.
import { ChevronDown, ChevronRight } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { z } from "zod";
import { errorText } from "./debo-api";
import { Button, Card, colors, ErrorNotice, Field, s, spacing } from "./ui";
import { useWorkspace } from "./workspace";

type Provider = "anthropic" | "openrouter" | "cartesia";

const Choice = z.object({ id: z.string(), label: z.string() });
const KeyView = z.object({
  provider: z.enum(["anthropic", "openrouter", "cartesia"]),
  set: z.literal(true),
  endsIn: z.string(),
  model: z.string().optional(),
  imageModel: z.string().optional(),
  checkedAt: z.string(),
});
const Reply = z.object({
  available: z.boolean(),
  keys: z.array(KeyView),
  choices: z.object({
    anthropic: z.array(Choice),
    openrouter: z.array(Choice),
    openrouterImages: z.array(Choice),
  }),
});
type Reply = z.infer<typeof Reply>;
type KeyView = z.infer<typeof KeyView>;

/** Pick from a short list, or type any other model id. An empty value means "none". */
function ModelPicker({
  label,
  choices,
  value,
  onChange,
  noneLabel,
}: {
  label: string;
  choices: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
  noneLabel?: string;
}) {
  return (
    <View style={{ gap: spacing[2] }}>
      <Text style={s.muted}>{label}</Text>
      <View accessibilityRole="radiogroup" accessibilityLabel={label} style={[s.row, { gap: spacing[2], flexWrap: "wrap" }]}>
        {noneLabel ? (
          <Button small primary={value === ""} onPress={() => onChange("")}>
            {noneLabel}
          </Button>
        ) : null}
        {choices.map((c) => (
          <Button key={c.id} small primary={value === c.id} onPress={() => onChange(c.id)}>
            {c.label}
          </Button>
        ))}
      </View>
      <Field
        label={`${label}: or type another model name`}
        value={value}
        onChangeText={onChange}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder={choices[0]?.id}
      />
    </View>
  );
}

function ProviderKey({
  provider,
  title,
  detail,
  saved,
  reply,
  onChanged,
}: {
  provider: Provider;
  title: string;
  detail: string;
  saved?: KeyView;
  reply: Reply;
  onChanged: () => Promise<void>;
}) {
  const { api } = useWorkspace();
  const [key, setKey] = useState("");
  const [model, setModel] = useState(saved?.model ?? (provider === "anthropic" ? "claude-haiku-5-5" : ""));
  const [imageModel, setImageModel] = useState(saved?.imageModel ?? "");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  async function save() {
    setBusy(true);
    setError("");
    setNote("");
    try {
      const body: Record<string, string> = provider === "cartesia" ? {} : { model };
      if (key.trim()) body.key = key.trim();
      if (provider === "openrouter") body.imageModel = imageModel;
      const answer = await api.request<{ message: string }>(`/api/own-keys/${provider}`, body, "PUT");
      setKey("");
      setNote(answer.message);
      await onChanged();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    setError("");
    setNote("");
    try {
      await api.request(`/api/own-keys/${provider}`, undefined, "DELETE");
      setNote("Key removed. Debo's own account is used again.");
      await onChanged();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: spacing[3], paddingTop: spacing[3], borderTopWidth: 1, borderTopColor: colors.line }}>
      <Text style={[s.text, { fontWeight: "600" }]}>{title}</Text>
      <Text style={s.muted}>{detail}</Text>
      <Text style={s.small}>{saved ? `Key set, ends in …${saved.endsIn}.` : "No key set."}</Text>
      <Field
        label={saved ? `New ${title} key (leave empty to keep the one you set)` : `${title} key`}
        value={key}
        onChangeText={setKey}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        textContentType="password"
      />
      {provider === "cartesia" ? null : provider === "anthropic" ? (
        <ModelPicker label="Claude model for chat" choices={reply.choices.anthropic} value={model} onChange={setModel} />
      ) : (
        <>
          <ModelPicker
            label="Chat model"
            choices={reply.choices.openrouter}
            value={model}
            onChange={setModel}
            noneLabel="None, only pictures"
          />
          <ModelPicker
            label="Picture model"
            choices={reply.choices.openrouterImages}
            value={imageModel}
            onChange={setImageModel}
            noneLabel="Debo's own"
          />
        </>
      )}
      <View style={[s.row, { gap: spacing[2], flexWrap: "wrap" }]}>
        <Button primary busy={busy} disabled={!reply.available || (!saved && !key.trim())} onPress={() => void save()}>
          {saved ? "Check and save changes" : "Check and save key"}
        </Button>
        {saved ? (
          <Button danger busy={busy} onPress={() => void remove()}>
            Remove key
          </Button>
        ) : null}
      </View>
      <Text accessibilityLiveRegion="polite" style={s.small}>
        {note}
      </Text>
      <ErrorNotice error={error} />
    </View>
  );
}

export function OwnKeysSetting() {
  const { api } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [reply, setReply] = useState<Reply>();
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const parsed = Reply.safeParse(await api.request<unknown>("/api/own-keys"));
      if (!parsed.success) throw new Error("I couldn't read your keys. Try again in a moment.");
      setReply(parsed.data);
      setError("");
    } catch (e) {
      setError(errorText(e));
    }
  }, [api]);
  useEffect(() => {
    if (open && !reply) void load();
  }, [open, reply, load]);

  const saved = (p: Provider) => reply?.keys.find((k) => k.provider === p);
  return (
    <Card style={{ gap: spacing[3] }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel="Advanced: use your own keys"
        onPress={() => setOpen(!open)}
        style={[s.row, { gap: spacing[2], minHeight: spacing[11] }]}
      >
        {open ? <ChevronDown size={18} color={colors.muted} /> : <ChevronRight size={18} color={colors.muted} />}
        <Text style={[s.text, { fontWeight: "600" }]}>Advanced: use your own keys</Text>
      </Pressable>
      {open ? (
        <View style={{ gap: spacing[3] }}>
          <Text style={s.muted}>
            Most people never need this. If you have your own AI account, paste its key here. Then your chats, calls
            and pictures use your account, under that company's terms, and you pay them for it. Debo's daily limits
            don't apply to what runs on your key. Keys are checked before they are saved, stored encrypted, and never shown again.
            Removing a key deletes it.
          </Text>
          <Text style={s.small}>
            On calls, your key is used for what she says. Hearing you and speaking out loud stay on Debo's voice
            service, except a copied voice of one of your custom people, which uses your Cartesia key.
          </Text>
          {reply && !reply.available ? (
            <Text style={s.small}>This Debo can't store keys safely yet, so keys can't be saved here.</Text>
          ) : null}
          {reply ? (
            <>
              <ProviderKey
                provider="anthropic"
                title="Anthropic"
                detail="Your Claude key from console.anthropic.com. Chats, calls and journal answers use it."
                saved={saved("anthropic")}
                reply={reply}
                onChanged={load}
              />
              <ProviderKey
                provider="openrouter"
                title="OpenRouter"
                detail="Your key from openrouter.ai. Pick a chat model to chat on it (used only if no Anthropic key is set), and a picture model to make pictures on it. The chat model must support tools."
                saved={saved("openrouter")}
                reply={reply}
                onChanged={load}
              />
              <ProviderKey
                provider="cartesia"
                title="Cartesia"
                detail="Your key from play.cartesia.ai. Only used to copy the voice of one of your custom people, and to speak in that voice on your calls with them. The voice copy is kept in your Cartesia account until you remove it."
                saved={saved("cartesia")}
                reply={reply}
                onChanged={load}
              />
            </>
          ) : null}
          <ErrorNotice error={error} />
        </View>
      ) : null}
    </Card>
  );
}
