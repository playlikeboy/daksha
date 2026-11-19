import { BookOpen, ChevronRight, Mic, Pencil, RotateCw, Search, Trash2, Video } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { Text } from "./text";
import { deboApi, errorText } from "./debo-api";
import { Composer } from "./debo-composer";
import {
  type DeboStatus,
  type EntryView,
  entryDay,
  formatDuration,
  formatSize,
  kindName,
  preview,
} from "./debo-data";
import { deboMood } from "./debo-mood-store";
import { EntryPage } from "./debo-entry-page";
import { RecordingPlayer } from "./debo-player";
import { rememberEntryName } from "./routes";
import { Button, Card, colors, Empty, ErrorNotice, Field, s, screenGap, Skeleton, spacing } from "./ui";
import { useWorkspace } from "./workspace";

/** Shown when there is no Daksha database, a plain "not set up" instead of a failure. */
export function NotSetUp({ status, what }: { status?: DeboStatus; what: string }) {
  return (
    <Empty
      icon={BookOpen}
      title={`${what} is not set up yet`}
      detail={
        status?.message ??
        "Your journal is not set up yet. Whoever runs this Daksha needs to turn it on. Until then, nothing can be saved here."
      }
    />
  );
}

/** Write, read, find, edit and delete journal entries. /journal/<slug>-<id> opens one entry on its own page. */
export function JournalScreen() {
  const { route } = useWorkspace();
  const entryId = route?.section === "journal" ? route.entryId : undefined;
  return entryId ? <EntryPage key={entryId} id={entryId} /> : <JournalList />;
}

function JournalList() {
  const { api } = useWorkspace();
  const debo = useMemo(() => deboApi(api), [api]);
  const [status, setStatus] = useState<DeboStatus>();
  const [entries, setEntries] = useState<EntryView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [find, setFind] = useState("");
  const [finding, setFinding] = useState("");

  const load = useCallback(
    async (query?: string, quiet = false) => {
      if (!quiet) setError("");
      try {
        const next = await debo.status();
        setStatus(next);
        if (next.configured) setEntries(await debo.entries(query));
      } catch (e) {
        if (!quiet) setError(errorText(e));
      } finally {
        setLoading(false);
      }
    },
    [debo],
  );
  useEffect(() => {
    void load(finding);
  }, [load, finding]);

  // While a recording is being written out, look again every few seconds.
  const writingOut = entries.some((e) => e.media?.transcript.status === "waiting" || e.media?.transcript.status === "working");
  useEffect(() => {
    if (!writingOut) return;
    const timer = setInterval(() => void load(finding, true), 4000);
    return () => clearInterval(timer);
  }, [writingOut, load, finding]);

  const retry = () => {
    setLoading(true);
    void load(finding);
  };
  if (loading) return <Skeleton label="Loading your journal" />;
  // The first load failed, so there is nothing to show yet except the error and a way back.
  if (!status)
    return (
      <ErrorNotice
        error="Your journal did not load. Check your connection, then try again. Your entries are safe."
        onRetry={retry}
      />
    );
  if (!status.configured) return <NotSetUp status={status} what="Your journal" />;


  return (
    <View style={{ gap: screenGap }}>
      <Text style={s.muted}>
        Write, speak or record. Only you can read your entries. Daksha uses them to answer your questions, and shows which
        entry each answer came from.
      </Text>
      <ErrorNotice error={error} onRetry={retry} />
      <Composer status={status} onSaved={() => {
          deboMood.emit({ type: "journal_saved" });
          return load(finding);
        }} />

      <View style={{ gap: spacing[2] }} accessibilityRole="search">
        <Field
          label="Find an entry"
          value={find}
          onChangeText={setFind}
          maxLength={200}
          returnKeyType="search"
          onSubmitEditing={() => setFinding(find.trim())}
          placeholder="A word or a name"
        />
        <View style={[s.row, { gap: spacing[2], flexWrap: "wrap" }]}>
          <Button icon={Search} onPress={() => setFinding(find.trim())}>
            Find
          </Button>
          {!!finding && (
            <Button
              onPress={() => {
                setFind("");
                setFinding("");
              }}
            >
              Show all entries
            </Button>
          )}
        </View>
        {!!finding && (
          <Text style={s.muted} accessibilityLiveRegion="polite">
            {entries.length === 0
              ? `No entries have “${finding}”. Try a shorter word.`
              : `${entries.length === 1 ? "1 entry has" : `${entries.length} entries have`} “${finding}”.`}
          </Text>
        )}
      </View>


      {!finding && entries.length === 0 ? (
        <Empty
          icon={BookOpen}
          title="Nothing here yet"
          detail="Start small: write one line about today, like who you saw or what you ate, or record a short voice note. Then you can ask Daksha about it."
        />
      ) : (
        <View accessibilityRole="list" style={{ gap: spacing[3] }}>
          {entries.map((entry) => (
            <EntryCard key={entry.id} entry={entry} onChanged={() => load(finding)} />
          ))}
        </View>
      )}
    </View>
  );
}

function EntryCard({
  entry,
  highlighted,
  startOpen,
  onChanged,
  onClose,
}: {
  entry: EntryView;
  highlighted?: boolean;
  startOpen?: boolean;
  onChanged: () => Promise<void>;
  onClose?: () => void;
}) {
  const { api, notify, navigate } = useWorkspace();
  const debo = useMemo(() => deboApi(api), [api]);
  const [open, setOpen] = useState(!!startOpen);
  const openPage = () => {
    rememberEntryName(entry.id, entry.title);
    navigate("journal", { entryId: entry.id });
  };
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(entry.text);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const day = entryDay(entry.happenedAt);
  const media = entry.media;
  const status = media?.transcript.status;
  const recording = entry.kind === "voice" || entry.kind === "video";
  const call = entry.kind === "call";
  // A written entry's first line is its title: show it on its own, in bold, above the rest,
  // instead of running it into the first sentence.
  const [firstLine = "", ...restLines] = entry.text.split("\n");
  const headline =
    !recording && !call && restLines.join("").trim() && firstLine.trim() === entry.title.trim()
      ? firstLine.trim()
      : "";
  const body = headline ? restLines.join("\n").trim() : entry.text;

  async function run(work: () => Promise<void>, done: string) {
    setBusy(true);
    setError("");
    try {
      await work();
      notify(done);
      if (done === "Entry deleted." || done === "Recording deleted." || done === "Call deleted.") deboMood.emit({ type: "deleted" });
      await onChanged();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      style={{
        gap: spacing[2],
        padding: spacing[4],
        ...(highlighted ? { borderWidth: 2, borderColor: colors.blueDark } : {}),
      }}
    >
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`Open ${recording || call ? `${kindName(entry.kind)}, ${day}` : `entry from ${day}`}: ${entry.title}`}
        onPress={openPage}
        style={({ pressed }) => [s.row, { gap: spacing[2], flexWrap: "wrap", minHeight: spacing[11], opacity: pressed ? 0.6 : 1 }]}
      >
        {(recording || call) && (entry.kind === "video" ? <Video size={16} color={colors.blueDark} /> : <Mic size={16} color={colors.blueDark} />)}
        <Text style={[s.small, { fontWeight: "600", color: colors.text }]}>
          {recording || call ? `${kindName(entry.kind)}, ${day}` : day}
        </Text>
        {call && entry.minutes ? (
          <Text style={s.small}>
            {entry.minutes} {entry.minutes === 1 ? "minute" : "minutes"}
          </Text>
        ) : null}
        {media && (
          <Text style={s.small}>
            {media.durationMs ? `${formatDuration(media.durationMs)} · ` : ""}
            {formatSize(media.sizeBytes)}
          </Text>
        )}
        <View style={{ flex: 1 }} />
        <Text style={[s.small, { color: colors.text, fontWeight: "600" }]}>Open</Text>
        <ChevronRight size={16} color={colors.text} />
      </Pressable>

      {media && (
        <RecordingPlayer
          kind={media.kind}
          label={`${kindName(entry.kind)} from ${day}`}
          load={() => debo.playbackUrl(entry.id)}
        />
      )}

      {media && (status === "waiting" || status === "working") && (
        <View style={[s.row, { gap: spacing[2] }]} accessibilityLiveRegion="polite">
          <ActivityIndicator size="small" color={colors.blueDark} />
          <Text style={[s.muted, { flex: 1 }]}>Writing out what was said. This can take a minute. You can leave this page.</Text>
        </View>
      )}
      {media && status === "failed" && (
        <View accessibilityRole="alert" style={{ gap: spacing[2] }}>
          <Text style={s.text}>{media.transcript.message ?? "I couldn't write out this recording yet."}</Text>
          <Button
            small
            icon={RotateCw}
            busy={busy}
            style={{ alignSelf: "flex-start" }}
            onPress={() => void run(() => debo.retryTranscript(entry.id), "Trying again.")}
          >
            Try again
          </Button>
        </View>
      )}
      {media && status === "ready" && !entry.text.trim() && !editing && (
        <Text style={s.muted}>I didn't hear any words in this recording.</Text>
      )}

      {editing ? (
        <>
          <Field
            label={recording ? "Fix the words" : "Change this entry"}
            value={text}
            onChangeText={setText}
            multiline
            maxLength={20000}
          />
          <View style={[s.row, { gap: spacing[2], flexWrap: "wrap" }]}>
            <Button
              primary
              busy={busy}
              disabled={!text.trim()}
              onPress={() =>
                void run(async () => {
                  await debo.editEntry(entry.id, text);
                  setEditing(false);
                }, "Changes saved.")
              }
            >
              Save changes
            </Button>
            <Button
              disabled={busy}
              onPress={() => {
                setText(entry.text);
                setEditing(false);
              }}
            >
              Not now
            </Button>
          </View>
        </>
      ) : (
        !!entry.text.trim() && (
          <>
          {!!headline && <Text style={[s.text, { fontWeight: "600" }]}>{headline}</Text>}
          <Text
            selectable
            numberOfLines={open ? undefined : 3}
            accessibilityLabel={`${recording ? `${kindName(entry.kind)} words` : call ? "Voice call words" : "Entry"} from ${day}. ${open ? entry.text : preview(entry.text)}`}
            style={s.text}
          >
            {open ? body : preview(body, 220)}
          </Text>
          </>
        )
      )}
      <ErrorNotice error={error} />
      {!editing && !confirming && (
        <View style={[s.row, { gap: spacing[2], flexWrap: "wrap" }]}>
          {entry.text.length > 220 && (
            <Button small onPress={() => setOpen(!open)}>
              {open ? "Show less" : call ? "Read the whole call" : recording ? "Read all the words" : "Read all"}
            </Button>
          )}
          {!call && (!recording || status === "ready") && (
            <Button
              small
              icon={Pencil}
              onPress={() => {
                setText(entry.text);
                setOpen(true);
                setEditing(true);
              }}
            >
              {recording ? "Fix the words" : "Change entry"}
            </Button>
          )}
          <Button small danger icon={Trash2} onPress={() => setConfirming(true)}>
            {call ? "Delete call" : recording ? "Delete recording" : "Delete entry"}
          </Button>
          {onClose && (
            <Button small onPress={onClose}>
              Done
            </Button>
          )}
        </View>
      )}
      {confirming && (
        <View accessibilityRole="alert" style={{ gap: spacing[2] }}>
          <Text style={s.text}>
            {call
              ? "Delete this call for good? Daksha forgets what it learned from it, and the copy in Chat is deleted too. This can't be undone."
              : recording
              ? "Delete this recording and its words for good? The file is removed from storage and Daksha forgets what it learned from it. This can't be undone."
              : "Delete this entry for good? Daksha will also forget what it learned from it. This can't be undone."}
          </Text>
          <View style={[s.row, { gap: spacing[2], flexWrap: "wrap" }]}>
            <Button
              danger
              busy={busy}
              icon={Trash2}
              onPress={() => void run(() => debo.deleteEntry(entry.id), call ? "Call deleted." : recording ? "Recording deleted." : "Entry deleted.")}
            >
              {call ? "Yes, delete this call" : recording ? "Yes, delete this recording" : "Yes, delete this entry"}
            </Button>
            <Button disabled={busy} onPress={() => setConfirming(false)}>
              Keep it
            </Button>
          </View>
        </View>
      )}
    </Card>
  );
}
