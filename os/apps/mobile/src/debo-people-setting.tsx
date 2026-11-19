// Settings card: the people in your life. Debo saves someone when you tell her about them in
// chat or on a call ("my sister Riya's birthday is 3 March"). Here you can see everyone she
// keeps, fix any detail, add someone yourself, or remove them.
import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { Text } from "./text";
import { errorText } from "./debo-api";
import { useAssistantName } from "./debo-character-store";
import { usePronouns } from "./debo-pronouns";
import { Button, Card, ErrorNotice, Field, s, spacing } from "./ui";
import { useWorkspace } from "./workspace";

type Person = {
  id: string;
  name: string;
  relation: string;
  birthday?: string;
  dates: { label: string; date: string }[];
  notes: string;
};
type Draft = { id?: string; name: string; relation: string; birthday: string; notes: string };
const EMPTY: Draft = { name: "", relation: "", birthday: "", notes: "" };

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** "1994-03-03" or "03-03" as "3 March". */
const dayText = (date: string) => {
  const [month, day] = date.slice(-5).split("-").map(Number);
  return month && day ? `${day} ${MONTHS[month - 1]}` : date;
};

function summary(p: Person): string {
  const parts = [
    p.relation,
    p.birthday ? `birthday ${dayText(p.birthday)}` : "",
    ...p.dates.map((d) => `${d.label} ${dayText(d.date)}`),
  ].filter(Boolean);
  return parts.join(" · ");
}

export function PeopleSetting() {
  const { api } = useWorkspace();
  const name = useAssistantName();
  const pronouns = usePronouns();
  const [people, setPeople] = useState<Person[]>([]);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  /** The person whose removal is waiting for a second yes. */
  const [removing, setRemoving] = useState<string>();

  const load = useCallback(async () => {
    try {
      setPeople((await api.request<{ people: Person[] }>("/api/people")).people);
    } catch (e) {
      setError(errorText(e));
    }
  }, [api]);
  useEffect(() => {
    void load();
  }, [load]);

  const run = async (work: () => Promise<unknown>, done: string, after?: () => void) => {
    setBusy(true);
    setError("");
    setStatus("");
    try {
      await work();
      await load();
      setStatus(done);
      after?.();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    const old = people.find((p) => p.id === draft.id);
    const body = {
      name: draft.name,
      relation: draft.relation,
      birthday: draft.birthday.trim(),
      notes: draft.notes,
      dates: old?.dates ?? [],
    };
    void run(
      () => (draft.id ? api.request(`/api/people/${draft.id}`, body, "PUT") : api.request("/api/people", body, "POST")),
      draft.id ? `Saved ${draft.name.trim()}.` : `Added ${draft.name.trim()}.`,
      () => setDraft(EMPTY),
    );
  };

  return (
    <Card style={{ marginTop: spacing[5], gap: spacing[3] }}>
      <Text style={s.heading}>People in your life</Text>
      <Text style={s.muted}>
        {people.length
          ? `${name} remembers these people so ${pronouns.they} can ask after them and remind you of birthdays. Fix or remove anyone here.`
          : `No one yet. Tell ${name} about your family and friends in chat or on a call, or add someone here.`}
      </Text>
      <ErrorNotice error={error} />
      {status ? (
        <Text style={s.muted} accessibilityLiveRegion="polite">
          {status}
        </Text>
      ) : null}
      {people.map((p) => (
        <View key={p.id} style={{ gap: spacing[1] }}>
          <Text style={[s.text, { fontWeight: "600" }]}>{p.name}</Text>
          {summary(p) ? <Text style={s.muted}>{summary(p)}</Text> : null}
          {p.notes ? <Text style={s.muted}>{p.notes}</Text> : null}
          {removing === p.id ? (
            <View accessibilityRole="alert" style={{ gap: spacing[2] }}>
              <Text style={s.text}>{`Remove ${p.name}, their birthday and your notes about them? This can't be undone.`}</Text>
              <View style={[s.row, { gap: spacing[2], flexWrap: "wrap" }]}>
                <Button
                  small
                  danger
                  busy={busy}
                  onPress={() =>
                    void run(() => api.request(`/api/people/${p.id}`, undefined, "DELETE"), `Removed ${p.name}.`).then(() =>
                      setRemoving(undefined),
                    )
                  }
                >
                  {`Yes, remove ${p.name}`}
                </Button>
                <Button small disabled={busy} onPress={() => setRemoving(undefined)}>
                  Keep them
                </Button>
              </View>
            </View>
          ) : (
          <View style={[s.row, { gap: spacing[2], flexWrap: "wrap" }]}>
            <Button
              small
              disabled={busy}
              onPress={() =>
                setDraft({ id: p.id, name: p.name, relation: p.relation, birthday: p.birthday ?? "", notes: p.notes })
              }
            >
              {`Edit ${p.name}`}
            </Button>
            <Button
              small
              danger
              disabled={busy}
              onPress={() => setRemoving(p.id)}
            >
              {`Remove ${p.name}`}
            </Button>
          </View>
          )}
        </View>
      ))}
      <Text style={[s.small, { fontWeight: "600" }]}>{draft.id ? `Editing ${draft.name}` : "Add someone"}</Text>
      <Field label="Name" value={draft.name} onChangeText={(name) => setDraft({ ...draft, name })} maxLength={80} />
      <Field
        label="Who they are to you"
        value={draft.relation}
        onChangeText={(relation) => setDraft({ ...draft, relation })}
        maxLength={80}
        placeholder="For example: Mum, best friend"
      />
      <Field
        label="Birthday (month-day, or year-month-day)"
        value={draft.birthday}
        onChangeText={(birthday) => setDraft({ ...draft, birthday })}
        maxLength={10}
        placeholder="For example: 03-14"
      />
      <Field
        label="Things to remember"
        value={draft.notes}
        onChangeText={(notes) => setDraft({ ...draft, notes })}
        maxLength={1000}
        multiline
        placeholder="For example: loves jasmine tea"
      />
      <View style={s.row}>
        <Button small primary busy={busy} disabled={!draft.name.trim()} onPress={save}>
          {draft.id ? "Save changes" : "Add person"}
        </Button>
        {draft.id ? (
          <Button small disabled={busy} onPress={() => setDraft(EMPTY)}>
            Cancel editing
          </Button>
        ) : null}
      </View>
    </Card>
  );
}
