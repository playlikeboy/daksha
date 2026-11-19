// The upload sheet for a custom person: pick a WhatsApp chat export (.zip or .txt), photos and
// videos, tick the consent box, send them, and follow the steps while Debo reads them. If the
// chat has several people, the person picks which one is "them". The files are deleted once
// they are read, on success and on failure; the sheet says so.
import { Check, Circle, CircleAlert, CircleDashed, FileUp, Loader } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { Text } from "./text";
import {
  type CustomPerson,
  type PickedFile,
  sendPersonFiles,
  type Step,
  type UploadView,
  UploadViewSchema,
} from "./custom-people-data";
import { pickPersonFiles, sendPersonRange } from "./custom-people-pick";
import { errorText } from "./debo-api";
import { Button, CheckRow, colors, ErrorNotice, s, Sheet, spacing } from "./ui";
import { useWorkspace } from "./workspace";

const MB = 1024 * 1024;
const sizeText = (bytes: number) => (bytes >= MB ? `${(bytes / MB).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
const FINISHED = new Set(["done", "failed"]);

function StepRow({ step }: { step: Step }) {
  const Icon =
    step.state === "done" ? Check : step.state === "working" ? Loader : step.state === "failed" ? CircleAlert : step.state === "skipped" ? CircleDashed : Circle;
  const color = step.state === "failed" ? colors.danger : step.state === "waiting" || step.state === "skipped" ? colors.muted : colors.text;
  const said = { done: "done", working: "working on it", failed: "did not work", skipped: "not needed", waiting: "waiting" }[step.state];
  return (
    <View accessible accessibilityLabel={`${step.label}: ${said}${step.detail ? `, ${step.detail}` : ""}`} style={[s.row, { gap: spacing[2] }]}>
      <Icon size={16} color={color} />
      <Text style={[s.text, { color, flex: 1 }]}>
        {step.label}
        {step.detail ? <Text style={s.muted}> · {step.detail}</Text> : null}
      </Text>
    </View>
  );
}

export function CustomPersonUploadSheet({
  person,
  consentText,
  onClose,
  onDone,
}: {
  person: Pick<CustomPerson, "id" | "name">;
  consentText: string;
  onClose: () => void;
  /** The profile was built: refresh the list. */
  onDone?: () => void;
}) {
  const { api } = useWorkspace();
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [skipped, setSkipped] = useState(0);
  const [agreed, setAgreed] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [upload, setUpload] = useState<UploadView | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const live = useRef(true);
  useEffect(
    () => () => {
      live.current = false;
    },
    [],
  );

  const base = `/api/custom-people/${encodeURIComponent(person.id)}`;
  const refresh = useCallback(async () => {
    const reply = await api.request<{ upload: unknown }>(`${base}/status`);
    const parsed = reply.upload ? UploadViewSchema.safeParse(reply.upload) : null;
    if (live.current && parsed?.success) setUpload(parsed.data);
    return parsed?.success ? parsed.data : null;
  }, [api, base]);

  // While Debo reads, look again every two seconds. Stops when it is done, failed or waiting for a pick.
  useEffect(() => {
    if (!upload || FINISHED.has(upload.status) || upload.status === "needs-sender") return;
    const timer = setTimeout(() => {
      refresh()
        .then((next) => next?.status === "done" && onDone?.())
        .catch((e) => live.current && setError(errorText(e)));
    }, 2000);
    return () => clearTimeout(timer);
  }, [upload, refresh, onDone]);

  const pick = async () => {
    setError("");
    try {
      const picked = await pickPersonFiles();
      setFiles((now) => [...now, ...picked.files].slice(0, 26));
      setSkipped(picked.skipped);
    } catch (e) {
      setError(errorText(e));
    }
  };

  const send = async () => {
    setBusy(true);
    setError("");
    setProgress(0);
    try {
      setUpload(await sendPersonFiles(api, sendPersonRange, person.id, files, (f) => live.current && setProgress(f)));
    } catch (e) {
      setError(errorText(e));
    } finally {
      if (live.current) {
        setBusy(false);
        setProgress(null);
      }
    }
  };

  const chooseSender = async (sender: string) => {
    if (!upload) return;
    setBusy(true);
    setError("");
    try {
      const reply = await api.request<{ upload: unknown }>(`${base}/sources/${encodeURIComponent(upload.id)}/sender`, { sender }, "POST");
      setUpload(UploadViewSchema.parse(reply.upload));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const counts = { chat: 0, photo: 0, video: 0 };
  for (const f of files) counts[f.kind] += 1;

  return (
    <Sheet title={`Add files for ${person.name}`} subtitle="A WhatsApp chat, photos and videos, so Debo can learn how they talk." onClose={onClose}>
      <View style={{ gap: spacing[4] }}>
        {!upload && (
          <>
            <Text style={s.muted}>
              In WhatsApp, open the chat, tap the name, then Export chat. "Without media" is fine. Add the .zip or .txt it makes.
              You can also add up to 20 photos (JPEG, PNG or WebP, under 5 MB each) and 5 videos.
            </Text>
            <Text style={s.small}>
              Debo reads the files once, takes out phone numbers, emails, codes and addresses, builds a short profile, then
              deletes the files. Text and photos go to Anthropic (Claude) to be read, using your own key if you set one; the
              sound of videos goes to Cloudflare to be written out. Nothing is used to train any AI.
            </Text>
            <Button icon={FileUp} onPress={() => void pick()} disabled={busy}>
              {files.length ? "Add more files" : "Choose files"}
            </Button>
            {files.length > 0 && (
              <View style={{ gap: spacing[1] }}>
                <Text style={s.text}>
                  {[counts.chat && `${counts.chat} chat`, counts.photo && `${counts.photo} photos`, counts.video && `${counts.video} videos`]
                    .filter(Boolean)
                    .join(", ")}
                </Text>
                {files.map((f, i) => (
                  <Text key={`${f.name}-${i}`} style={s.small} numberOfLines={1}>
                    {f.name} · {sizeText(f.sizeBytes)}
                  </Text>
                ))}
                <Button small onPress={() => setFiles([])} disabled={busy}>
                  Clear the list
                </Button>
              </View>
            )}
            {skipped > 0 && (
              <Text style={s.small} accessibilityLiveRegion="polite">
                {skipped === 1 ? "One file was left out:" : `${skipped} files were left out:`} Debo can use .zip and .txt chats,
                photos and videos.
              </Text>
            )}
            <CheckRow label={consentText} checked={agreed} onPress={() => setAgreed((v) => !v)} />
            <Button primary busy={busy} disabled={!agreed || files.length === 0} onPress={() => void send()}>
              Send and read the files
            </Button>
            {progress !== null && (
              <Text style={s.small} accessibilityLiveRegion="polite">
                Sending… {Math.round(progress * 100)}%
              </Text>
            )}
          </>
        )}

        {upload && (
          <View style={{ gap: spacing[2] }} accessibilityLiveRegion="polite">
            {upload.steps.map((step) => (
              <StepRow key={step.id} step={step} />
            ))}
          </View>
        )}

        {upload?.status === "needs-sender" && upload.senders && (
          <View style={{ gap: spacing[2] }}>
            <Text style={s.heading}>Which one is {person.name}?</Text>
            <Text style={s.muted}>Only their messages are used. Everyone else's are left out.</Text>
            <View style={[s.row, { gap: spacing[2], flexWrap: "wrap" }]}>
              {upload.senders.map((sender) => (
                <Button key={sender.name} small busy={busy} onPress={() => void chooseSender(sender.name)}>
                  {`${sender.name} (${sender.count})`}
                </Button>
              ))}
            </View>
          </View>
        )}

        {upload?.status === "done" && (
          <Text style={s.text} accessibilityLiveRegion="polite">
            Done. {person.name}'s profile is ready{upload.filesDeleted ? ", and your files are deleted" : ""}. You can see and fix
            it in People you made.
          </Text>
        )}
        {upload?.status === "failed" && <ErrorNotice error={upload.error ?? "Something went wrong while reading the files."} />}
        <ErrorNotice error={error} />
        {upload && FINISHED.has(upload.status) && (
          <Button onPress={onClose}>Close</Button>
        )}
      </View>
    </Sheet>
  );
}
