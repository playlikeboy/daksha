// One journal entry on its own page: /journal/<slug>-<id>.
//
// A written entry reads like a page. A voice note has its player, waveform and the
// words, each timed piece of which jumps the player there. A video shows large, with
// the words beside it (wide screens) or under it (phones). A voice call reads as a
// conversation. Under each: what Daksha learned from it, and similar entries.
import { ArrowLeft, AudioLines, BookOpen, FileText, Pencil, Phone, RotateCw, Trash2, Video } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, View } from "react-native";
import { Text } from "./text";
import { deboApi, errorText } from "./debo-api";
import { useAssistantName } from "./debo-character-store";
import {
  callLengthSeconds,
  type EntryView,
  entryDay,
  formatDuration,
  formatSize,
  kindName,
  type MemoryView,
  parseCallTurns,
  segmentAt,
  type SimilarView,
  timeMark,
  type TranscriptReply,
} from "./debo-data";
import { deboMood } from "./debo-mood-store";
import { EntryPlayer, type PlayerControl } from "./debo-player";
import { downloadName } from "./debo-player-types";
import { entryNameOf, pathFor, rememberEntryName, titleFor } from "./routes";
import { avatarSize, Button, Card, colors, Empty, ErrorNotice, Field, fontSize, Mascot, radius, s, screenGap, Skeleton, spacing } from "./ui";
import { useWorkspace } from "./workspace";

type Kind = EntryView["kind"];
const KIND_ICON: Record<Kind, typeof BookOpen> = { journal: BookOpen, voice: AudioLines, video: Video, call: Phone };

/** Keep the address bar and tab title in step with the entry's title, without a new history step. */
function useEntryAddress(id: string, title: string | undefined) {
  useEffect(() => {
    if (!title) return;
    rememberEntryName(id, title);
    if (Platform.OS !== "web") return;
    const path = pathFor("journal", { entryId: id });
    if (window.location.pathname !== path) window.history.replaceState(null, "", path);
    document.title = titleFor({ section: "journal", entryId: id });
  }, [id, title]);
}

export function EntryPage({ id }: { id: string }) {
  const { api, navigate, notify } = useWorkspace();
  const debo = useMemo(() => deboApi(api), [api]);
  const [entry, setEntry] = useState<EntryView>();
  const [state, setState] = useState<"loading" | "ready" | "gone" | "error">("loading");
  const [error, setError] = useState("");
  const [width, setWidth] = useState(0);

  const load = useCallback(
    async (quiet = false) => {
      if (!quiet) {
        setState((s) => (s === "ready" ? s : "loading"));
        setError("");
      }
      try {
        setEntry(await debo.entry(id));
        setState("ready");
      } catch (e) {
        if (quiet) return;
        const message = errorText(e);
        if (/couldn't find that entry/i.test(message)) setState("gone");
        else {
          setError(message);
          setState("error");
        }
      }
    },
    [debo, id],
  );
  useEffect(() => {
    setEntry(undefined);
    void load();
  }, [load]);
  useEntryAddress(id, entry?.title);

  // While the words are being written out, look again every few seconds.
  const writing = entry?.media?.transcript.status === "waiting" || entry?.media?.transcript.status === "working";
  useEffect(() => {
    if (!writing) return;
    const timer = setInterval(() => void load(true), 4000);
    return () => clearInterval(timer);
  }, [writing, load]);

  const back = () => navigate("journal");
  const backLink = (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel="Back to all entries"
      onPress={back}
      style={({ pressed }) => [s.row, { gap: spacing[2], minHeight: spacing[11], alignSelf: "flex-start", opacity: pressed ? 0.6 : 1 }]}
    >
      <ArrowLeft size={18} color={colors.text} />
      <Text style={[s.text, { fontWeight: "600" }]}>All entries</Text>
    </Pressable>
  );

  if (state === "loading") return <EntryPageSkeleton hint={entryNameOf(id)} />;
  if (state === "gone" || (state === "ready" && !entry))
    return (
      <View style={{ gap: screenGap }}>
        {backLink}
        <Empty
          icon={BookOpen}
          title="That entry is gone"
          detail="It may have been deleted, or the link is not quite right. Your other entries are in your journal."
        >
          <Button onPress={back}>Show all entries</Button>
        </Empty>
      </View>
    );
  if (state === "error" || !entry)
    return (
      <View style={{ gap: screenGap }}>
        {backLink}
        <ErrorNotice
          error={error || "This entry did not load. Check your connection, then try again. Your entries are safe."}
          onRetry={() => void load()}
        />
      </View>
    );

  const Icon = KIND_ICON[entry.kind] ?? FileText;
  const day = entryDay(entry.happenedAt);
  const media = entry.media;
  const length =
    entry.kind === "call"
      ? entry.minutes
        ? `${entry.minutes} ${entry.minutes === 1 ? "minute" : "minutes"}`
        : ""
      : media?.durationMs
        ? formatDuration(media.durationMs)
        : "";
  const onDeleted = () => {
    notify(entry.kind === "call" ? "Call deleted." : entry.media ? "Recording deleted." : "Entry deleted.");
    deboMood.emit({ type: "deleted" });
    navigate("journal");
  };

  return (
    <View style={{ gap: screenGap }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {backLink}
      <View style={{ gap: spacing[2] }}>
        <View style={[s.row, { gap: spacing[2], flexWrap: "wrap" }]}>
          <View style={[s.iconBox, { width: spacing[8], height: spacing[8], borderRadius: radius.element }]}>
            <Icon size={16} color={colors.blueText} />
          </View>
          <Text style={[s.small, { fontWeight: "600", color: colors.text }]}>{kindName(entry.kind) === "Entry" ? "Written entry" : kindName(entry.kind)}</Text>
          {!!length && <Text style={s.small}>· {length}</Text>}
          {media && <Text style={s.small}>· {formatSize(media.sizeBytes)}</Text>}
        </View>
        <Text accessibilityRole="header" style={s.pageTitle}>
          {entry.title || kindName(entry.kind)}
        </Text>
        <Text style={s.muted}>Happened on {day}</Text>
      </View>

      {entry.kind === "journal" && <WrittenBody entry={entry} onChanged={() => load(true)} onDeleted={onDeleted} />}
      {(entry.kind === "voice" || entry.kind === "video") && media && (
        <RecordingBody entry={entry} wide={width >= 700} onChanged={() => load(true)} onDeleted={onDeleted} />
      )}
      {entry.kind === "call" && <CallBody entry={entry} onDeleted={onDeleted} />}
      {(entry.kind === "voice" || entry.kind === "video") && !media && (
        // A recording whose file record is missing: still show its words.
        <WrittenBody entry={entry} onChanged={() => load(true)} onDeleted={onDeleted} />
      )}

      <LearnedFrom entry={entry} />
      <SimilarEntries id={entry.id} />
    </View>
  );
}

// ---- Written entry ----

/** Paragraphs split at blank lines, as the person wrote them. */
/** The page already shows the title as its heading, so the text below starts after it. */
function bodyAfterTitle(text: string, title: string): string {
  const [first = "", ...rest] = text.split("\n");
  const body = rest.join("\n").trim();
  return body && first.trim() === title.trim() ? body : text;
}

function Reading({ text }: { text: string }) {
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  return (
    <View style={{ gap: spacing[4], maxWidth: 640 }}>
      {paragraphs.map((p, i) => (
        <Text
          // biome-ignore lint/suspicious/noArrayIndexKey: paragraphs have no ids
          key={i}
          selectable
          style={[s.text, { fontSize: fontSize.lg, lineHeight: fontSize.lg + spacing[3] }]}
        >
          {p}
        </Text>
      ))}
    </View>
  );
}

function useEntryActions(entry: EntryView, onChanged: () => Promise<void>, onDeleted: () => void) {
  const { api, notify } = useWorkspace();
  const debo = useMemo(() => deboApi(api), [api]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return {
    busy,
    error,
    save: (text: string, done: () => void) =>
      run(async () => {
        await debo.editEntry(entry.id, text);
        notify("Changes saved.");
        done();
        await onChanged();
      }),
    remove: () =>
      run(async () => {
        await debo.deleteEntry(entry.id);
        onDeleted();
      }),
    retry: () =>
      run(async () => {
        await debo.retryTranscript(entry.id);
        notify("Trying again.");
        await onChanged();
      }),
  };
}

function Editor({ label, initial, busy, onSave, onCancel }: { label: string; initial: string; busy: boolean; onSave: (text: string) => void; onCancel: () => void }) {
  const [text, setText] = useState(initial);
  return (
    <View>
      <Field label={label} value={text} onChangeText={setText} multiline maxLength={20000} style={{ minHeight: spacing[12] * 5 }} />
      <View style={[s.row, { gap: spacing[2], flexWrap: "wrap" }]}>
        <Button primary busy={busy} disabled={!text.trim()} onPress={() => onSave(text)}>
          Save changes
        </Button>
        <Button disabled={busy} onPress={onCancel}>
          Not now
        </Button>
      </View>
    </View>
  );
}

function DeleteConfirm({ what, detail, busy, onYes, onNo }: { what: string; detail: string; busy: boolean; onYes: () => void; onNo: () => void }) {
  return (
    <View accessibilityRole="alert" style={{ gap: spacing[3], padding: spacing[4], borderRadius: radius.page, backgroundColor: colors.dangerBg }}>
      <Text style={s.text}>{detail}</Text>
      <View style={[s.row, { gap: spacing[2], flexWrap: "wrap" }]}>
        <Button danger busy={busy} icon={Trash2} onPress={onYes}>
          {`Yes, delete this ${what}`}
        </Button>
        <Button disabled={busy} onPress={onNo}>
          Keep it
        </Button>
      </View>
    </View>
  );
}

function WrittenBody({ entry, onChanged, onDeleted }: { entry: EntryView; onChanged: () => Promise<void>; onDeleted: () => void }) {
  const actions = useEntryActions(entry, onChanged, onDeleted);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  return (
    <View style={{ gap: spacing[4] }}>
      {editing ? (
        <Editor
          label="Change this entry"
          initial={entry.text}
          busy={actions.busy}
          onSave={(text) => void actions.save(text, () => setEditing(false))}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <Card style={{ padding: spacing[6] }}>
          <Reading text={bodyAfterTitle(entry.text, entry.title)} />
        </Card>
      )}
      <ErrorNotice error={actions.error} />
      {!editing && !confirming && (
        <View style={[s.row, { gap: spacing[2], flexWrap: "wrap" }]}>
          <Button icon={Pencil} onPress={() => setEditing(true)}>
            Change entry
          </Button>
          <Button danger icon={Trash2} onPress={() => setConfirming(true)}>
            Delete entry
          </Button>
        </View>
      )}
      {confirming && (
        <DeleteConfirm
          what="entry"
          detail="Delete this entry for good? Daksha will also forget what it learned from it. This can't be undone."
          busy={actions.busy}
          onYes={() => void actions.remove()}
          onNo={() => setConfirming(false)}
        />
      )}
    </View>
  );
}

// ---- Voice note and video ----

function RecordingBody({ entry, wide, onChanged, onDeleted }: { entry: EntryView; wide: boolean; onChanged: () => Promise<void>; onDeleted: () => void }) {
  const { api } = useWorkspace();
  const debo = useMemo(() => deboApi(api), [api]);
  const media = entry.media;
  const actions = useEntryActions(entry, onChanged, onDeleted);
  const control = useRef<PlayerControl | null>(null);
  const [now, setNow] = useState(0);
  const [transcript, setTranscript] = useState<TranscriptReply>();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const status = media?.transcript.status;

  useEffect(() => {
    if (status !== "ready") return;
    let live = true;
    debo
      .transcript(entry.id)
      .then((t) => live && setTranscript(t))
      .catch(() => live && setTranscript(undefined));
    return () => {
      live = false;
    };
  }, [debo, entry.id, status, entry.text]);

  const onTime = useCallback((seconds: number) => setNow(seconds), []);
  if (!media) return null;
  const video = media.kind === "video";
  const segments = transcript?.segments ?? [];
  const label = `${kindName(entry.kind)} from ${entryDay(entry.happenedAt)}`;

  const player = (
    <EntryPlayer
      kind={media.kind}
      load={() => debo.playbackUrl(entry.id)}
      label={label}
      segments={segments}
      durationMs={media.durationMs}
      fileName={downloadName(`${entry.title || kindName(entry.kind)} ${entry.happenedAt.slice(0, 10)}`, media.mimeType)}
      mimeType={media.mimeType}
      control={control}
      onTime={onTime}
    />
  );

  const words = (
    <View style={{ gap: spacing[3], flex: 1, minWidth: 0 }}>
      <Text style={s.heading}>What was said</Text>
      {(status === "waiting" || status === "working") && (
        <View style={[s.row, { gap: spacing[2] }]} accessibilityLiveRegion="polite">
          <ActivityIndicator size="small" color={colors.blueDark} />
          <Text style={[s.muted, { flex: 1 }]}>Writing out what was said. This can take a minute. You can leave this page.</Text>
        </View>
      )}
      {status === "failed" && (
        <View accessibilityRole="alert" style={{ gap: spacing[2] }}>
          <Text style={s.text}>{media.transcript.message ?? "I couldn't write out this recording yet."}</Text>
          <Button small icon={RotateCw} busy={actions.busy} style={{ alignSelf: "flex-start" }} onPress={() => void actions.retry()}>
            Try again
          </Button>
        </View>
      )}
      {status === "ready" && !entry.text.trim() && <Text style={s.muted}>I didn't hear any words in this recording.</Text>}
      {status === "ready" && editing && (
        <Editor
          label="Fix the words"
          initial={entry.text}
          busy={actions.busy}
          onSave={(text) => void actions.save(text, () => setEditing(false))}
          onCancel={() => setEditing(false)}
        />
      )}
      {status === "ready" && !editing && !!entry.text.trim() &&
        (segments.length > 0 && segmentsMatch(segments, entry.text) ? (
          <Segments segments={segments} now={now} onSeek={(t) => control.current?.seek(t)} scroll={video && wide} />
        ) : (
          <Reading text={entry.text} />
        ))}
    </View>
  );

  return (
    <View style={{ gap: spacing[5] }}>
      {video && wide ? (
        <View style={{ flexDirection: "row", gap: spacing[5], alignItems: "flex-start" }}>
          <View style={{ flex: 3, minWidth: 0 }}>{player}</View>
          <View style={[s.card, { flex: 2, minWidth: 0, maxHeight: 460, padding: spacing[4] }]}>{words}</View>
        </View>
      ) : (
        <>
          <Card style={{ padding: video ? spacing[3] : spacing[5] }}>{player}</Card>
          <Card style={{ padding: spacing[5] }}>{words}</Card>
        </>
      )}
      <ErrorNotice error={actions.error} />
      {!editing && !confirming && (
        <View style={[s.row, { gap: spacing[2], flexWrap: "wrap" }]}>
          {status === "ready" && !!entry.text.trim() && (
            <Button icon={Pencil} onPress={() => setEditing(true)}>
              Fix the words
            </Button>
          )}
          <Button danger icon={Trash2} onPress={() => setConfirming(true)}>
            Delete recording
          </Button>
        </View>
      )}
      {confirming && (
        <DeleteConfirm
          what="recording"
          detail="Delete this recording and its words for good? The file is removed from storage and Daksha forgets what it learned from it. This can't be undone."
          busy={actions.busy}
          onYes={() => void actions.remove()}
          onNo={() => setConfirming(false)}
        />
      )}
    </View>
  );
}

/** Timed pieces are only shown while they still match the words (a fixed transcript has no times). */
function segmentsMatch(segments: TranscriptReply["segments"], text: string): boolean {
  const flat = (t: string) => t.replace(/\s+/g, " ").trim();
  return flat(segments.map((s) => s.text).join(" ")) === flat(text);
}

/** Each timed piece of the words. Pressing one plays from there; the one playing now is marked. */
function Segments({ segments, now, onSeek, scroll }: { segments: TranscriptReply["segments"]; now: number; onSeek: (t: number) => void; scroll: boolean }) {
  const current = segmentAt(segments, now);
  const list = (
    <View accessibilityRole="list" style={{ gap: spacing[1] }}>
      {segments.map((segment, i) => {
        const on = i === current;
        return (
          <Pressable
            // biome-ignore lint/suspicious/noArrayIndexKey: segments have no ids; their order is fixed
            key={i}
            accessibilityRole="button"
            accessibilityLabel={`Play from ${timeMark(segment.start)}: ${segment.text}`}
            accessibilityState={{ selected: on }}
            onPress={() => onSeek(segment.start)}
            style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({
              flexDirection: "row",
              gap: spacing[3],
              paddingVertical: spacing[2],
              paddingHorizontal: spacing[3],
              borderRadius: radius.container,
              backgroundColor: on ? colors.blue : pressed || hovered ? colors.subtle : "transparent",
            })}
          >
            <Text style={[s.small, { minWidth: spacing[10], fontVariant: ["tabular-nums"], color: on ? colors.blueText : colors.muted, paddingTop: spacing[0.5] }]}>
              {timeMark(segment.start)}
            </Text>
            <Text style={[s.text, { flex: 1, color: on ? colors.blueText : colors.text }]}>{segment.text.trim()}</Text>
          </Pressable>
        );
      })}
    </View>
  );
  return scroll ? <ScrollView style={{ flexGrow: 0 }}>{list}</ScrollView> : list;
}

// ---- Voice call ----

function CallBody({ entry, onDeleted }: { entry: EntryView; onDeleted: () => void }) {
  const actions = useEntryActions(entry, async () => {}, onDeleted);
  const name = useAssistantName();
  const [confirming, setConfirming] = useState(false);
  const turns = parseCallTurns(entry.text);
  const seconds = callLengthSeconds(turns);
  return (
    <View style={{ gap: spacing[4] }}>
      <View style={[s.card, { gap: spacing[3], padding: spacing[5] }]}>
        <Text style={s.small}>
          {turns.length} {turns.length === 1 ? "turn" : "turns"}
          {seconds > 0 ? ` over ${formatDuration(seconds * 1000)}` : ""}. Only your own words become memories.
        </Text>
        {turns.length === 0 ? (
          <Reading text={entry.text} />
        ) : (
          <View accessibilityRole="list" style={{ gap: spacing[3] }}>
            {turns.map((turn, i) => {
              const mine = turn.who === "person";
              const firstOfRun = turns[i - 1]?.who !== turn.who;
              return (
                <View
                  // biome-ignore lint/suspicious/noArrayIndexKey: turns have no ids; their order is fixed
                  key={i}
                  accessibilityLabel={`${mine ? "You" : name}, at ${timeMark(turn.seconds)}: ${turn.text}`}
                  style={{ flexDirection: "row", gap: spacing[2], justifyContent: mine ? "flex-end" : "flex-start", alignItems: "flex-end" }}
                >
                  {!mine && (
                    <View style={{ width: avatarSize.sm }}>{firstOfRun && <Mascot size={avatarSize.sm} mood="idle" />}</View>
                  )}
                  <View style={{ maxWidth: "80%", gap: spacing[1], alignItems: mine ? "flex-end" : "flex-start" }}>
                    {firstOfRun && (
                      <Text style={[s.small, { fontWeight: "600", color: colors.text }]}>
                        {mine ? "You" : name} <Text style={{ fontWeight: "400", color: colors.muted, fontVariant: ["tabular-nums"] }}>{timeMark(turn.seconds)}</Text>
                      </Text>
                    )}
                    <View
                      style={{
                        paddingHorizontal: spacing[4],
                        paddingVertical: spacing[3],
                        borderRadius: radius.page,
                        backgroundColor: mine ? colors.accent : colors.subtle,
                      }}
                    >
                      <Text selectable style={[s.text, { color: mine ? colors.onAccent : colors.text }]}>
                        {turn.text}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>
      <ErrorNotice error={actions.error} />
      {confirming ? (
        <DeleteConfirm
          what="call"
          detail="Delete this call for good? Daksha forgets what it learned from it, and the copy in Chat is deleted too. This can't be undone."
          busy={actions.busy}
          onYes={() => void actions.remove()}
          onNo={() => setConfirming(false)}
        />
      ) : (
        <Button danger icon={Trash2} style={{ alignSelf: "flex-start" }} onPress={() => setConfirming(true)}>
          Delete call
        </Button>
      )}
    </View>
  );
}

// ---- What Daksha learned, and similar entries ----

function LearnedFrom({ entry }: { entry: EntryView }) {
  const { api, notify } = useWorkspace();
  const debo = useMemo(() => deboApi(api), [api]);
  const [memories, setMemories] = useState<MemoryView[]>();
  const [off, setOff] = useState("");
  const [error, setError] = useState("");
  const [fixing, setFixing] = useState<string>();
  /** The memory waiting for a second yes before it is forgotten, as on What Daksha knows. */
  const [forgetting, setForgetting] = useState<string>();
  const [busy, setBusy] = useState("");
  const load = useCallback(async () => {
    setError("");
    try {
      const all = await debo.memories();
      setMemories(all.filter((m) => m.source.id === entry.id));
    } catch (e) {
      const message = errorText(e);
      if (/not keeping memories/i.test(message)) setOff(message);
      else setError("What Daksha learned from this did not load.");
    }
  }, [debo, entry.id]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the words changing means new memories
  useEffect(() => {
    void load();
  }, [load, entry.text]);

  const heading = entry.kind === "call" ? "Saved from this call" : "What Daksha learned from this";
  if (off) return null;
  return (
    <View style={{ gap: spacing[3] }}>
      <Text accessibilityRole="header" style={s.heading}>{heading}</Text>
      <ErrorNotice error={error} onRetry={() => void load()} />
      {!memories && !error && <Skeleton label={`Loading ${heading.toLowerCase()}`} rows={1} heading={false} />}
      {memories?.length === 0 && (
        <Text style={s.muted}>
          {entry.kind === "call"
            ? "Nothing from this call has been kept as a memory yet."
            : "Nothing yet. Daksha reads new entries in the background, so this can take a minute."}
        </Text>
      )}
      {memories?.map((m) =>
        fixing === m.id ? (
          <Editor
            key={m.id}
            label="Fix this memory"
            initial={m.text}
            busy={busy === m.id}
            onSave={(text) => {
              setBusy(m.id);
              debo
                .fixMemory(m.id, text)
                .then(() => {
                  notify("Memory fixed.");
                  setFixing(undefined);
                  return load();
                })
                .catch((e) => setError(errorText(e)))
                .finally(() => setBusy(""));
            }}
            onCancel={() => setFixing(undefined)}
          />
        ) : (
          <View key={m.id} style={[s.card, { gap: spacing[3], padding: spacing[4], backgroundColor: colors.green }]}>
            <Text style={[s.text, { color: colors.success }]}>{m.text}</Text>
            {forgetting === m.id && (
              <Text style={[s.text, { color: colors.success }]}>Forget this for good? Daksha won't use it in answers any more.</Text>
            )}
            <View style={[s.row, { gap: spacing[2], flexWrap: "wrap" }]}>
              {forgetting !== m.id && (
                <Button small icon={Pencil} onPress={() => setFixing(m.id)}>
                  Fix this
                </Button>
              )}
              <Button
                small
                danger
                icon={Trash2}
                busy={busy === m.id}
                onPress={() => {
                  if (forgetting !== m.id) {
                    setForgetting(m.id);
                    return;
                  }
                  setBusy(m.id);
                  debo
                    .forgetMemory(m.id)
                    .then(() => {
                      notify("Forgotten.");
                      setForgetting(undefined);
                      return load();
                    })
                    .catch((e) => setError(errorText(e)))
                    .finally(() => setBusy(""));
                }}
              >
                {forgetting === m.id ? "Yes, forget it" : "Forget this"}
              </Button>
              {forgetting === m.id && (
                <Button small disabled={busy === m.id} onPress={() => setForgetting(undefined)}>
                  Keep it
                </Button>
              )}
            </View>
          </View>
        ),
      )}
    </View>
  );
}

function SimilarEntries({ id }: { id: string }) {
  const { api, navigate } = useWorkspace();
  const debo = useMemo(() => deboApi(api), [api]);
  const [similar, setSimilar] = useState<SimilarView[]>();
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setError("");
    setSimilar(undefined);
    try {
      setSimilar(await debo.similar(id));
    } catch {
      setError("Similar entries did not load. Check your connection, then try again.");
    }
  }, [debo, id]);
  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View style={{ gap: spacing[3] }}>
      <Text style={s.heading}>Similar entries</Text>
      <ErrorNotice error={error} onRetry={() => void load()} />
      {!similar && !error && (
        <View accessible accessibilityRole="progressbar" accessibilityLabel="Loading similar entries" style={{ gap: spacing[2] }}>
          {[0, 1].map((i) => (
            <View key={i} style={[s.card, { gap: spacing[2], padding: spacing[4] }]}>
              <View style={{ width: "35%", height: spacing[3], borderRadius: radius.inner, backgroundColor: colors.line }} />
              <View style={{ width: "85%", height: spacing[3], borderRadius: radius.inner, backgroundColor: colors.subtle }} />
            </View>
          ))}
        </View>
      )}
      {similar?.length === 0 && (
        <Text style={s.muted}>Nothing else in your journal is close to this one yet.</Text>
      )}
      {!!similar?.length && (
        <View accessibilityRole="list" style={{ gap: spacing[2] }}>
          {similar.map((item) => {
            const Icon = KIND_ICON[item.kind] ?? FileText;
            return (
              <Pressable
                key={item.id}
                accessibilityRole="link"
                accessibilityLabel={`Open ${item.label}: ${item.title}`}
                onPress={() => {
                  rememberEntryName(item.id, item.title);
                  navigate("journal", { entryId: item.id });
                }}
                style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
                  s.card,
                  { flexDirection: "row", gap: spacing[3], padding: spacing[4], backgroundColor: pressed || hovered ? colors.subtle : colors.card },
                ]}
              >
                <View style={[s.iconBox, { width: spacing[9], height: spacing[9], borderRadius: radius.element }]}>
                  <Icon size={16} color={colors.blueText} />
                </View>
                <View style={{ flex: 1, gap: spacing[0.5], minWidth: 0 }}>
                  <Text style={s.small}>{item.label}</Text>
                  <Text numberOfLines={1} style={[s.text, { fontWeight: "600" }]}>
                    {item.title}
                  </Text>
                  {!!item.snippet && item.snippet !== item.title && (
                    <Text numberOfLines={2} style={s.small}>
                      {item.snippet}
                    </Text>
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

/** Grey blocks in the shape of the page, so nothing jumps when it arrives. */
function EntryPageSkeleton({ hint }: { hint?: string }) {
  const bar = (width: `${number}%`, height: number, color: string = colors.line) => (
    <View style={{ width, height, borderRadius: radius.inner, backgroundColor: color }} />
  );
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel={hint ? `Loading ${hint}` : "Loading this entry"} style={{ gap: screenGap }}>
      {bar("22%", spacing[5])}
      <View style={{ gap: spacing[3] }}>
        {bar("18%", spacing[4])}
        {bar("70%", spacing[8])}
        {bar("40%", spacing[4], colors.subtle)}
      </View>
      <View style={[s.card, { gap: spacing[3], padding: spacing[6] }]}>
        {bar("95%", spacing[3], colors.subtle)}
        {bar("90%", spacing[3], colors.subtle)}
        {bar("82%", spacing[3], colors.subtle)}
        {bar("60%", spacing[3], colors.subtle)}
      </View>
      {bar("30%", spacing[5])}
      <View style={[s.card, { gap: spacing[2], padding: spacing[4] }]}>
        {bar("35%", spacing[3])}
        {bar("85%", spacing[3], colors.subtle)}
      </View>
    </View>
  );
}
