// Settings card "People you made": custom people to talk to, built from a description or from
// the person's own WhatsApp chats, photos, videos, voice notes and calls. See, make, change,
// give a face to, talk to, add files for, and delete them (deleting is only here, never by
// chat). Daksha is always honest that each one is an AI portrait. The server checks everything
// again (apps/server/src/custom-people, apps/server/src/voice-clone).
import { FileUp, MessageCircle, Pencil, Smile, Trash2, UserRoundPlus } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { Text } from "./text";
import { type CustomPerson, initials, type PeopleReply, PeopleReplySchema } from "./custom-people-data";
import { CustomPersonUploadSheet } from "./custom-person-upload";
import { type AvatarConfig, type CustomAvatar, useCustomAvatars } from "./debo-custom-avatars";
import { errorText } from "./debo-api";
import { CustomFace } from "./debo-face";
import { Button, Card, CheckRow, colors, ErrorNotice, Field, radius, s, SectionHeading, Sheet, spacing } from "./ui";
import { VoiceRecordingsPanel } from "./voice-copy-ui";
import { useWorkspace } from "./workspace";

/**
 * A custom person's face: the face made for them in the avatar builder (`avatarId`, records
 * kind `custom-avatars`) when there is one, otherwise their initials in a soft circle.
 */
export function PersonAvatar({
  person,
  face,
  size = 44,
}: {
  person: Pick<CustomPerson, "name" | "avatarId">;
  /** The saved face `person.avatarId` points at, if it is loaded. */
  face?: AvatarConfig;
  size?: number;
}) {
  if (person.avatarId && face) return <CustomFace size={size} config={face} mood="idle" label={`${person.name}'s face`} />;
  return (
    <View
      accessible
      accessibilityLabel={`${person.name}'s picture`}
      style={{
        width: size,
        height: size,
        borderRadius: radius.full,
        backgroundColor: colors.subtle,
        borderWidth: 1,
        borderColor: colors.line,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={[s.text, { color: colors.text }]}>{initials(person.name)}</Text>
    </View>
  );
}

type Draft = {
  id?: string;
  name: string;
  relation: string;
  description: string;
  voice?: string;
  avatarId?: string;
  passedAway: boolean;
};
const EMPTY: Draft = { name: "", relation: "", description: "", passedAway: false };

/**
 * Pick one of the saved faces, or none. "Make a new face" and "Edit this face" open the avatar
 * builder, which takes the whole screen: the editor closes, the face is linked to the person
 * when it is saved, and this settings sheet opens again.
 */
function FacePicker({
  draft,
  faces,
  onPick,
  onBuild,
}: {
  draft: Draft;
  faces: CustomAvatar[];
  onPick: (avatarId?: string) => void;
  onBuild: (avatarId?: string) => void;
}) {
  return (
    <View style={{ gap: spacing[2] }}>
      <Text style={s.muted}>Their face</Text>
      <View accessibilityRole="radiogroup" accessibilityLabel="Their face" style={[s.row, { gap: spacing[2], flexWrap: "wrap" }]}>
        <Button small selected={!draft.avatarId} onPress={() => onPick(undefined)}>
          Just initials
        </Button>
        {faces.map((f) => (
          <Pressable
            key={f.id}
            accessibilityRole="radio"
            accessibilityState={{ checked: draft.avatarId === f.id }}
            accessibilityLabel={`Use the face ${f.name}`}
            onPress={() => onPick(f.id)}
            style={{
              borderRadius: radius.full,
              borderWidth: 2,
              borderColor: draft.avatarId === f.id ? colors.text : "transparent",
              padding: 2,
            }}
          >
            <CustomFace size={44} config={f} mood="idle" label={f.name} />
          </Pressable>
        ))}
      </View>
      {draft.id ? (
        <View style={[s.row, { gap: spacing[2], flexWrap: "wrap" }]}>
          <Button small icon={Smile} onPress={() => onBuild(undefined)}>
            Make a new face
          </Button>
          {draft.avatarId && (
            <Button small icon={Pencil} onPress={() => onBuild(draft.avatarId)}>
              Edit this face
            </Button>
          )}
        </View>
      ) : (
        <Text style={s.small}>Pick a face you made, or make this person first and then make a new face for them.</Text>
      )}
    </View>
  );
}

function PersonEditor({
  draft,
  voices,
  faces,
  onSave,
  onBuildFace,
  onClose,
}: {
  draft: Draft;
  voices: PeopleReply["voices"];
  faces: CustomAvatar[];
  onSave: (draft: Draft) => Promise<void>;
  /** Open the avatar builder for this saved person: a new face, or the one with this id. */
  onBuildFace: (personId: string, avatarId?: string) => void;
  onClose: () => void;
}) {
  const [d, setD] = useState(draft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      await onSave(d);
      onClose();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet title={d.id ? `Change ${draft.name}` : "Make someone new"} onClose={onClose}>
      <View style={{ gap: spacing[3] }}>
        <Field label="Name" value={d.name} onChangeText={(name) => setD({ ...d, name })} maxLength={60} placeholder="For example: Nani" />
        <Field
          label="Who they are to you"
          value={d.relation}
          onChangeText={(relation) => setD({ ...d, relation })}
          maxLength={80}
          placeholder="My grandmother, my best friend, a made-up pirate"
        />
        <Field
          label="What they are like and how they talk"
          value={d.description}
          onChangeText={(description) => setD({ ...d, description })}
          maxLength={1500}
          multiline
          numberOfLines={5}
          placeholder="Calls me beta, always asks if I ate, loves old Hindi songs"
        />
        <View style={{ gap: spacing[2] }}>
          <Text style={s.muted}>Their voice on calls</Text>
          <View accessibilityRole="radiogroup" accessibilityLabel="Their voice on calls" style={[s.row, { gap: spacing[2], flexWrap: "wrap" }]}>
            <Button small selected={!d.voice} onPress={() => setD({ ...d, voice: undefined })}>
              Same as now
            </Button>
            {voices.map((v) => (
              <Button key={v.id} small selected={d.voice === v.id} onPress={() => setD({ ...d, voice: v.id })}>
                {v.name}
              </Button>
            ))}
          </View>
        </View>
        <FacePicker
          draft={d}
          faces={faces}
          onPick={(avatarId) => setD({ ...d, avatarId })}
          onBuild={(avatarId) => {
            if (!d.id) return;
            onClose();
            onBuildFace(d.id, avatarId);
          }}
        />
        <CheckRow label="They have died" checked={d.passedAway} onPress={() => setD({ ...d, passedAway: !d.passedAway })} />
        {d.passedAway && (
          <Text style={s.small}>
            Daksha will speak gently, the way they did, and will never pretend to really be them.
          </Text>
        )}
        <ErrorNotice error={error} />
        <Button primary busy={busy} disabled={!d.name.trim()} onPress={() => void save()}>
          {d.id ? "Save changes" : "Make this person"}
        </Button>
      </View>
    </Sheet>
  );
}

function PersonRow({
  person,
  face,
  active,
  factSources,
  canRead,
  onTalk,
  onEdit,
  onUpload,
  onDelete,
  onRemoveLine,
}: {
  person: CustomPerson;
  face?: AvatarConfig;
  active: boolean;
  factSources: Record<string, string>;
  canRead: boolean;
  onTalk: () => void;
  onEdit: () => void;
  onUpload: () => void;
  onDelete: () => void;
  onRemoveLine: (kind: "examples" | "facts", index: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  return (
    <View style={{ gap: spacing[2], paddingVertical: spacing[2], borderTopWidth: 1, borderTopColor: colors.line }}>
      <View style={[s.row, { gap: spacing[3] }]}>
        <PersonAvatar person={person} face={face} />
        <View style={{ flex: 1 }}>
          <Text style={s.text}>
            {person.name}
            {active ? <Text style={s.muted}> · talking as them now</Text> : null}
          </Text>
          <Text style={s.small}>
            {[
              person.relation,
              person.builtFrom
                ? `learned from ${person.builtFrom.messages} messages, ${person.builtFrom.photos} photos, ${person.builtFrom.videos} videos, ${person.builtFrom.voice} spoken lines`
                : "from your description",
              person.voiceCloneId ? "speaks in a copy of their voice on calls" : "",
            ]
              .filter(Boolean)
              .join(" · ")}
          </Text>
        </View>
      </View>
      {person.passedAway && (
        <Text style={s.small}>
          In loving memory. This is an AI portrait made from their words. It can be a comfort, and it is never really them.
        </Text>
      )}
      <View style={[s.row, { gap: spacing[2], flexWrap: "wrap" }]}>
        <Button small primary={!active} icon={MessageCircle} onPress={onTalk} disabled={active}>
          {active ? "Talking now" : "Talk to them"}
        </Button>
        <Button small icon={Pencil} onPress={onEdit}>
          Change
        </Button>
        {canRead && (
          <Button small icon={FileUp} onPress={onUpload}>
            Add chats and photos
          </Button>
        )}
        <Button small onPress={() => setOpen((v) => !v)}>
          {open ? "Hide what Daksha learned" : "What Daksha learned"}
        </Button>
      </View>
      {open && (
        <View style={{ gap: spacing[2] }}>
          {person.styleSummary ? <Text style={s.text}>{person.styleSummary}</Text> : <Text style={s.muted}>Nothing learned from files yet.</Text>}
          {person.facts.map((f, i) => (
            <View key={`f-${i}`} style={[s.row, { gap: spacing[2] }]}>
              <Text style={[s.text, { flex: 1 }]}>
                {f.text} <Text style={s.muted}>({factSources[f.source] ?? f.source})</Text>
              </Text>
              <Button small accessibilityLabel={`Remove: ${f.text}`} onPress={() => onRemoveLine("facts", i)}>
                Remove
              </Button>
            </View>
          ))}
          {person.examples.length > 0 && <Text style={s.muted}>Lines they really wrote or said</Text>}
          {person.examples.map((line, i) => (
            <View key={`e-${i}`} style={[s.row, { gap: spacing[2] }]}>
              <Text style={[s.text, { flex: 1 }]}>"{line}"</Text>
              <Button small accessibilityLabel={`Remove the line: ${line}`} onPress={() => onRemoveLine("examples", i)}>
                Remove
              </Button>
            </View>
          ))}
          {/* Voice notes and calls: keep only their words, and an optional copy of their voice. */}
          <VoiceRecordingsPanel personId={person.id} name={person.name} />
        </View>
      )}
      {confirm ? (
        <View style={{ gap: spacing[2] }}>
          <Text style={s.text}>Delete {person.name} and everything Daksha learned about them? This can't be undone.</Text>
          <View style={[s.row, { gap: spacing[2] }]}>
            <Button small danger icon={Trash2} onPress={onDelete}>
              Delete {person.name}
            </Button>
            <Button small onPress={() => setConfirm(false)}>
              Keep them
            </Button>
          </View>
        </View>
      ) : (
        <View style={s.row}>
          <Button small danger icon={Trash2} onPress={() => setConfirm(true)}>
            Delete…
          </Button>
        </View>
      )}
    </View>
  );
}

export function CustomPeopleSetting() {
  const { api, open, notify } = useWorkspace();
  const { avatars } = useCustomAvatars(api);
  const faceOf = (id?: string) => (id ? avatars.find((a) => a.id === id) : undefined);
  const [data, setData] = useState<PeopleReply | null>(null);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [uploading, setUploading] = useState<CustomPerson | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  const load = useCallback(async () => {
    try {
      setData(PeopleReplySchema.parse(await api.request("/api/custom-people")));
    } catch (e) {
      setError(errorText(e));
    }
  }, [api]);
  useEffect(() => {
    void load();
  }, [load]);

  const run = async (work: () => Promise<unknown>, done: string) => {
    setError("");
    try {
      await work();
      setStatus(done);
      await load();
    } catch (e) {
      setError(errorText(e));
    }
  };

  const save = async (d: Draft) => {
    const body = { name: d.name, relation: d.relation, description: d.description, passedAway: d.passedAway, ...(d.voice ? { voice: d.voice } : {}) };
    // A face can be taken off a saved person (null); a new person only sends one that was picked.
    if (d.id) await api.request(`/api/custom-people/${encodeURIComponent(d.id)}`, { ...body, avatarId: d.avatarId ?? null }, "PUT");
    else await api.request("/api/custom-people", { ...body, ...(d.avatarId ? { avatarId: d.avatarId } : {}) }, "POST");
    setStatus(d.id ? "Saved." : `${d.name} is ready. Tap "Talk to them" to start.`);
    await load();
  };

  /**
   * The avatar builder replaces this settings sheet while it is open. When the face is saved
   * it is linked to the person, and this sheet opens again.
   */
  const buildFace = (personId: string, avatarId?: string) =>
    open({
      type: "avatar-builder",
      avatarId,
      pickOnly: true,
      onSaved: (face) =>
        void (async () => {
          try {
            await api.request(`/api/custom-people/${encodeURIComponent(personId)}`, { avatarId: face.id }, "PUT");
          } catch (e) {
            notify(errorText(e));
          }
          open({ type: "talk-settings" });
        })(),
    });

  const people = data?.people ?? [];
  const max = typeof data?.limits.people === "number" ? data.limits.people : 10;
  return (
    <Card style={{ gap: spacing[3] }}>
      <SectionHeading title="People you made" />
      <Text style={s.muted}>
        Make someone to talk to in chat and on calls: a friend, family, a partner, someone you miss, or a made-up character.
        Describe them, or add your WhatsApp chats, photos and videos so Daksha learns how they talk. It's always an AI, and it
        says so if you ask. Only you can see them.
      </Text>
      <ErrorNotice error={error} onRetry={data ? undefined : () => void load()} />
      {people.length === 0 && data && <Text style={s.text}>No one yet. Make your first person below.</Text>}
      {people.map((p) => (
        <PersonRow
          key={p.id}
          person={p}
          face={faceOf(p.avatarId)}
          active={data?.activeId === p.id}
          factSources={data?.factSources ?? {}}
          canRead={Boolean(data?.canRead)}
          onTalk={() => void run(() => api.request(`/api/custom-people/${encodeURIComponent(p.id)}/talk`, {}, "POST"), `Talking as ${p.name} now, in chat and on calls. Say "stop" to go back.`)}
          onEdit={() =>
            setEditing({
              id: p.id,
              name: p.name,
              relation: p.relation,
              description: p.description,
              voice: p.voice,
              avatarId: p.avatarId,
              passedAway: Boolean(p.passedAway),
            })
          }
          onUpload={() => setUploading(p)}
          onDelete={() => void run(() => api.request(`/api/custom-people/${encodeURIComponent(p.id)}`, undefined, "DELETE"), `${p.name} is deleted.`)}
          onRemoveLine={(kind, index) =>
            void run(
              () =>
                api.request(
                  `/api/custom-people/${encodeURIComponent(p.id)}`,
                  { [kind]: (kind === "facts" ? p.facts : p.examples).filter((_, i) => i !== index) },
                  "PUT",
                ),
              "Removed.",
            )
          }
        />
      ))}
      <View style={s.row}>
        <Button primary icon={UserRoundPlus} disabled={people.length >= max} onPress={() => setEditing({ ...EMPTY })}>
          Make someone new
        </Button>
      </View>
      {people.length >= max && <Text style={s.small}>You have {max} people, the most you can keep. Delete one to make room.</Text>}
      <Text accessibilityLiveRegion="polite" style={s.small}>
        {status}
      </Text>
      {editing && (
        <PersonEditor
          draft={editing}
          voices={data?.voices ?? []}
          faces={avatars}
          onSave={save}
          onBuildFace={buildFace}
          onClose={() => setEditing(null)}
        />
      )}
      {uploading && (
        <CustomPersonUploadSheet
          person={uploading}
          consentText={data?.consentText ?? "I'm allowed to use these files, and this is for my own private use."}
          onClose={() => {
            setUploading(null);
            void load();
          }}
          onDone={() => void load()}
        />
      )}
    </Card>
  );
}
