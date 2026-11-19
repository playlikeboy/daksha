// "Make your own": the avatar builder (decision 33). The person picks a shape, colours,
// hair, ears or leaves and accessories, sees the face live and tries it in every mood,
// then saves it. Saved faces show in the character picker, where they can be picked or
// edited later. A custom person can link to one of them by its id.
//
// Opened as a sheet from the character picker ("Make your own", or "Edit" on a saved face).
// The server checks every field again (apps/server/src/custom-avatars.ts).
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import {
  type AccessoryKind,
  accessoryKinds,
  AVATAR_NAME_MAX,
  type AvatarBase,
  avatarBases,
  type AvatarColours,
  type AvatarConfig,
  type AvatarPronoun,
  type CustomAvatar,
  defaultAvatarConfig,
  type EarStyle,
  earStyles,
  type HairStyle,
  hairStyles,
} from "../../../packages/domain/src/avatar";
import { useAgentWorkspace } from "./agent-workspace";
import { errorText } from "./debo-api";
import { planPick } from "./debo-character-pick";
import { deboCharacter, useDeboCharacter } from "./debo-character-store";
import { deleteAvatar, getAvatar, saveAvatar } from "./debo-custom-avatars";
import { randomAvatar, withBase } from "./debo-custom-shape";
import { CustomFace } from "./debo-face";
import { allMoods, type Mood } from "./debo-mood";
import { customSwatches } from "./debo-paint-custom";
import { Button, Card, colors, ErrorNotice, Field, radius, s, Sheet, Skeleton, spacing } from "./ui";
import { useWorkspace } from "./workspace";

const BASES: Record<AvatarBase, string> = { blob: "Soft blob", human: "Round person", cat: "Cat", fruit: "Fruit" };
const HAIR: Record<HairStyle, string> = { none: "No hair", short: "Short", long: "Long", bun: "Bun", curly: "Curly", tuft: "Two tufts" };
const EARS: Record<EarStyle, string> = { none: "No ears", round: "Round ears", pointed: "Pointy ears", leaves: "Leaves" };
const ACCESSORIES: Record<AccessoryKind, string> = { glasses: "Glasses", cap: "Cap", bow: "Bow", earrings: "Earrings", scarf: "Scarf" };
const PRONOUNS: { id: AvatarPronoun; label: string }[] = [
  { id: "she", label: "She" },
  { id: "he", label: "He" },
  { id: "they", label: "They" },
];
const PARTS: { id: keyof AvatarColours; label: string }[] = [
  { id: "body", label: "Skin or body" },
  { id: "hair", label: "Hair or leaves" },
  { id: "outfit", label: "Clothes and scarf" },
  { id: "cheeks", label: "Cheeks" },
  { id: "eyes", label: "Eyes" },
  { id: "accessory", label: "Cap, bow and earrings" },
];
const MOOD_WORDS: Record<Mood, string> = {
  idle: "Calm",
  listening: "Listening",
  thinking: "Thinking",
  speaking: "Talking",
  happy: "Happy",
  proud: "Proud",
  shy: "Shy",
  curious: "Curious",
  sleepy: "Sleepy",
  worried: "Worried",
  pouty: "Sulking",
  angry: "Cross",
};

function Choices<T extends string>({
  label,
  options,
  value,
  onPick,
}: {
  label: string;
  options: { id: T; label: string }[];
  value: T;
  onPick: (id: T) => void;
}) {
  return (
    <View style={{ gap: spacing[2] }}>
      <Text style={s.muted}>{label}</Text>
      <View accessibilityRole="radiogroup" accessibilityLabel={label} style={[s.row, { gap: spacing[2], flexWrap: "wrap" }]}>
        {options.map((o) => (
          <Button key={o.id} small selected={value === o.id} onPress={() => onPick(o.id)}>
            {o.label}
          </Button>
        ))}
      </View>
    </View>
  );
}

/** A row of colour dots for one part of the face. */
function Swatches({ label, list, value, onPick }: { label: string; list: readonly string[]; value: string; onPick: (hex: string) => void }) {
  return (
    <View style={{ gap: spacing[2] }}>
      <Text style={s.muted}>{label}</Text>
      <View accessibilityRole="radiogroup" accessibilityLabel={label} style={[s.row, { gap: spacing[2], flexWrap: "wrap" }]}>
        {list.map((hex, i) => {
          const picked = value === hex;
          return (
            <Pressable
              key={hex}
              accessibilityRole="radio"
              accessibilityLabel={`${label}: colour ${i + 1} of ${list.length}`}
              accessibilityState={{ checked: picked }}
              onPress={() => onPick(hex)}
              style={{
                width: spacing[11],
                height: spacing[11],
                borderRadius: radius.full,
                padding: spacing[1],
                borderWidth: 2,
                borderColor: picked ? colors.text : "transparent",
              }}
            >
              <View style={{ flex: 1, borderRadius: radius.full, backgroundColor: hex, borderWidth: 1, borderColor: colors.line }} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function AvatarBuilderSheet({
  avatarId,
  onSaved,
  pickOnly,
}: {
  avatarId?: string;
  /** Gets the saved face, for example so a custom person can link it by id. */
  onSaved?: (avatar: CustomAvatar) => void;
  /** Saving never changes who the person talks to. */
  pickOnly?: boolean;
}) {
  const { api, close, notify } = useWorkspace();
  const { data, mutate } = useAgentWorkspace();
  const character = useDeboCharacter();
  const [config, setConfig] = useState<AvatarConfig>(defaultAvatarConfig);
  const [mood, setMood] = useState<Mood>("happy");
  const [loading, setLoading] = useState(!!avatarId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sureDelete, setSureDelete] = useState(false);
  const inUse = !!avatarId && character === "custom" && data?.identity.customAvatar === avatarId;

  useEffect(() => {
    if (!avatarId) return;
    let live = true;
    getAvatar(api, avatarId)
      .then((saved) => {
        if (!live) return;
        const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = saved;
        setConfig(rest);
      })
      .catch((e) => live && setError(errorText(e)))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [api, avatarId]);

  const set = (changes: Partial<AvatarConfig>) => setConfig((old) => ({ ...old, ...changes }));
  const setColour = (part: keyof AvatarColours, hex: string) => setConfig((old) => ({ ...old, colours: { ...old.colours, [part]: hex } }));
  const toggle = (kind: AccessoryKind) =>
    setConfig((old) => ({
      ...old,
      accessories: old.accessories.includes(kind) ? old.accessories.filter((k) => k !== kind) : [...old.accessories, kind],
    }));

  async function save(talk: boolean) {
    if (!config.name.trim()) {
      setError("Give the face a name first.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const saved = await saveAvatar(api, { ...config, name: config.name.trim() }, avatarId);
      if (talk && data) {
        const plan = planPick(data.identity, "custom", { id: saved.id, name: saved.name });
        await mutate("/identity", plan.save);
        deboCharacter.setCustom(saved);
        deboCharacter.set("custom");
        if (plan.save.name) deboCharacter.setName(plan.save.name);
      } else if (inUse) {
        deboCharacter.setCustom(saved);
      }
      onSaved?.(saved);
      notify(talk ? `You are now talking to ${saved.name}.` : `${saved.name} is saved. Find it under Choose who you talk to.`);
      close();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!avatarId) return;
    if (!sureDelete) {
      setSureDelete(true);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await deleteAvatar(api, avatarId);
      // The server moves the person back to Debo if this was the face in use.
      if (inUse) deboCharacter.set("debo");
      notify(`${config.name} is deleted.`);
      close();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      title={avatarId ? `Edit ${config.name || "this face"}` : "Make your own"}
      subtitle="Design a face to talk to. You can change it later."
      onClose={close}
    >
      {loading ? (
        <Skeleton label="Loading the face" rows={3} />
      ) : (
        <View style={{ gap: spacing[4] }}>
          <Card style={{ gap: spacing[3], alignItems: "center" }}>
            <CustomFace size={160} config={config} mood={mood} label={`Preview of ${config.name || "your face"}, looking ${MOOD_WORDS[mood].toLowerCase()}`} />
            <View accessibilityRole="radiogroup" accessibilityLabel="Try a mood" style={[s.row, { gap: spacing[2], flexWrap: "wrap", justifyContent: "center" }]}>
              {allMoods.map((m) => (
                <Button key={m} small selected={mood === m} onPress={() => setMood(m)}>
                  {MOOD_WORDS[m]}
                </Button>
              ))}
            </View>
            <Button onPress={() => setConfig(randomAvatar(config))}>Randomise</Button>
          </Card>

          <Card style={{ gap: spacing[3] }}>
            <Field label="Name" value={config.name} onChangeText={(name) => set({ name })} maxLength={AVATAR_NAME_MAX} />
            <Choices label="How to talk about them" options={PRONOUNS} value={config.pronoun} onPick={(pronoun) => set({ pronoun })} />
            <Text style={s.small}>This sets the words in the app (she, he or they) and the voice they start with on calls.</Text>
            <Choices
              label="Shape"
              options={avatarBases.map((id) => ({ id, label: BASES[id] }))}
              value={config.base}
              onPick={(base) => setConfig((old) => withBase(old, base))}
            />
            <Choices label="Hair" options={hairStyles.map((id) => ({ id, label: HAIR[id] }))} value={config.hair} onPick={(hair) => set({ hair })} />
            <Choices label="Ears or leaves" options={earStyles.map((id) => ({ id, label: EARS[id] }))} value={config.ears} onPick={(ears) => set({ ears })} />
            <View style={{ gap: spacing[2] }}>
              <Text style={s.muted}>Accessories</Text>
              <View style={[s.row, { gap: spacing[2], flexWrap: "wrap" }]}>
                {accessoryKinds.map((kind) => {
                  const on = config.accessories.includes(kind);
                  return (
                    <Pressable
                      key={kind}
                      accessibilityRole="checkbox"
                      accessibilityLabel={ACCESSORIES[kind]}
                      accessibilityState={{ checked: on }}
                      onPress={() => toggle(kind)}
                      style={{
                        minHeight: spacing[11],
                        justifyContent: "center",
                        paddingHorizontal: spacing[3],
                        borderRadius: radius.full,
                        borderWidth: 2,
                        borderColor: on ? colors.blueDark : colors.line,
                        backgroundColor: on ? colors.sky : colors.card,
                      }}
                    >
                      <Text style={[s.text, on && { fontWeight: "600" }]}>{ACCESSORIES[kind]}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </Card>

          <Card style={{ gap: spacing[3] }}>
            {PARTS.map((part) => (
              <Swatches
                key={part.id}
                label={part.label}
                list={customSwatches[part.id]}
                value={config.colours[part.id]}
                onPick={(hex) => setColour(part.id, hex)}
              />
            ))}
          </Card>

          <ErrorNotice error={error} />
          <View style={[s.row, { gap: spacing[2], flexWrap: "wrap" }]}>
            {!pickOnly && (
              <Button primary busy={busy} onPress={() => void save(!inUse)}>
                {inUse ? "Save changes" : `Save and talk to ${config.name.trim() || "them"}`}
              </Button>
            )}
            {(pickOnly || !inUse) && (
              <Button primary={pickOnly} busy={busy} onPress={() => void save(false)}>
                Save face
              </Button>
            )}
            {avatarId && (
              <Button danger busy={busy} onPress={() => void remove()}>
                {sureDelete ? `Yes, delete ${config.name}` : "Delete this face"}
              </Button>
            )}
          </View>
          <Text style={s.small}>
            Faces are only drawing choices, never a photo. They are kept in your account, are in your download, and are
            deleted with your account. You can keep up to 10.
          </Text>
        </View>
      )}
    </Sheet>
  );
}
