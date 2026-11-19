// Settings card "People you made": custom people to talk to, built from a description or from
// the person's own WhatsApp chats, photos and videos. See, make, change, talk to, add files for,
// and delete them (deleting is only here, never by chat). Debo is always honest that each one
// is an AI portrait. The server checks everything again (apps/server/src/custom-people).
import { FileUp, MessageCircle, Pencil, Trash2, UserRoundPlus } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";
import { type CustomPerson, initials, type PeopleReply, PeopleReplySchema } from "./custom-people-data";
import { CustomPersonUploadSheet } from "./custom-person-upload";
import { errorText } from "./debo-api";
import { Button, Card, CheckRow, colors, ErrorNotice, Field, radius, s, SectionHeading, Sheet, spacing } from "./ui";
import { useWorkspace } from "./workspace";

/**
 * A custom person's face. Until saved avatars exist (`avatarId`, records kind `custom-avatars`),
 * it is their initials in a soft circle. Swap the inside for the saved avatar when it is there.
 */
export function PersonAvatar({ person, size = 44 }: { person: Pick<CustomPerson, "name" | "avatarId">; size?: number }) {
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

type Draft = { id?: string; name: string; relation: string; description: string; voice?: string; passedAway: boolean };
const EMPTY: Draft = { name: "", relation: "", description: "", passedAway: false };

function PersonEditor({
  draft,
  voices,
  onSave,
  onClose,
}: {
  draft: Draft;
  voices: PeopleReply["voices"];
  onSave: (draft: Draft) => Promise<void>;
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
            <Button small primary={!d.voice} onPress={() => setD({ ...d, voice: undefined })}>
              Same as now
            </Button>
            {voices.map((v) => (
              <Button key={v.id} small primary={d.voice === v.id} onPress={() => setD({ ...d, voice: v.id })}>
                {v.name}
              </Button>
            ))}
          </View>
        </View>
        <CheckRow label="They have died" checked={d.passedAway} onPress={() => setD({ ...d, passedAway: !d.passedAway })} />
        {d.passedAway && (
          <Text style={s.small}>
            Debo will speak gently, the way they did, and will never pretend to really be them.
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
        <PersonAvatar person={person} />
        <View style={{ flex: 1 }}>
          <Text style={s.text}>
            {person.name}
            {active ? <Text style={s.muted}> · talking as them now</Text> : null}
          </Text>
          <Text style={s.small}>
            {[person.relation, person.builtFrom ? `learned from ${person.builtFrom.messages} messages, ${person.builtFrom.photos} photos, ${person.builtFrom.videos} videos` : "from your description"]
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
          {open ? "Hide what Debo learned" : "What Debo learned"}
        </Button>
      </View>
      {open && (
        <View style={{ gap: spacing[2] }}>
          {person.styleSummary ? <Text style={s.text}>{person.styleSummary}</Text> : <Text style={s.muted}>Nothing learned from files yet.</Text>}
          {person.facts.map((f, i) => (
            <View key={`f-${i}`} style={[s.row, { gap: spacing[2] }]}>
              <Text style={[s.small, { flex: 1 }]}>
                {f.text} <Text style={s.muted}>({factSources[f.source] ?? f.source})</Text>
              </Text>
              <Button small onPress={() => onRemoveLine("facts", i)}>
                Remove
              </Button>
            </View>
          ))}
          {person.examples.length > 0 && <Text style={s.muted}>Lines they really wrote or said</Text>}
          {person.examples.map((line, i) => (
            <View key={`e-${i}`} style={[s.row, { gap: spacing[2] }]}>
              <Text style={[s.small, { flex: 1 }]}>"{line}"</Text>
              <Button small onPress={() => onRemoveLine("examples", i)}>
                Remove
              </Button>
            </View>
          ))}
        </View>
      )}
      {confirm ? (
        <View style={{ gap: spacing[2] }}>
          <Text style={s.text}>Delete {person.name} and everything Debo learned about them? This can't be undone.</Text>
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
  const { api } = useWorkspace();
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
    if (d.id) await api.request(`/api/custom-people/${encodeURIComponent(d.id)}`, body, "PUT");
    else await api.request("/api/custom-people", body, "POST");
    setStatus(d.id ? "Saved." : `${d.name} is ready. Tap "Talk to them" to start.`);
    await load();
  };

  const people = data?.people ?? [];
  const max = typeof data?.limits.people === "number" ? data.limits.people : 10;
  return (
    <Card style={{ marginTop: spacing[5], gap: spacing[3] }}>
      <SectionHeading title="People you made" />
      <Text style={s.muted}>
        Make someone to talk to in chat and on calls: a friend, family, a partner, someone you miss, or a made-up character.
        Describe them, or add your WhatsApp chats, photos and videos so Debo learns how they talk. It's always an AI, and it
        says so if you ask. Only you can see them.
      </Text>
      <ErrorNotice error={error} onRetry={data ? undefined : () => void load()} />
      {people.length === 0 && data && <Text style={s.text}>No one yet. Make your first person below.</Text>}
      {people.map((p) => (
        <PersonRow
          key={p.id}
          person={p}
          active={data?.activeId === p.id}
          factSources={data?.factSources ?? {}}
          canRead={Boolean(data?.canRead)}
          onTalk={() => void run(() => api.request(`/api/custom-people/${encodeURIComponent(p.id)}/talk`, {}, "POST"), `Talking as ${p.name} now, in chat and on calls. Say "stop" to go back.`)}
          onEdit={() => setEditing({ id: p.id, name: p.name, relation: p.relation, description: p.description, voice: p.voice, passedAway: Boolean(p.passedAway) })}
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
      {editing && <PersonEditor draft={editing} voices={data?.voices ?? []} onSave={save} onClose={() => setEditing(null)} />}
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
