// Settings card: what Debo sends on her own. Birthday and special-day reminders (on until
// the person turns them off), the morning check-in (off until turned on, with a time), the
// reminders the person asked for, and "Send me reminders" on this device (web push in a
// browser, notifications the phone holds itself in the app). Nothing between 22:00 and 07:00.
import { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";
import { errorText } from "./debo-api";
import {
  deviceReminderKind,
  deviceRemindersAvailable,
  deviceRemindersOn,
  syncDeviceReminders,
  turnOffDeviceReminders,
  turnOnDeviceReminders,
} from "./debo-device-reminders";
import { Button, Card, CheckRow, ErrorNotice, Field, s, spacing } from "./ui";
import { useWorkspace } from "./workspace";

type Settings = { specialDays: boolean; checkin: boolean; checkinAt: string };
type Reminder = { id: string; title: string; at: string; status: "scheduled" | "sent" };

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function RemindersSetting() {
  const { api } = useWorkspace();
  const [settings, setSettings] = useState<Settings>();
  const [time, setTime] = useState("08:00");
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [push, setPush] = useState<{ configured: boolean; publicKey: string | null }>({ configured: false, publicKey: null });
  const [deviceOn, setDeviceOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  const load = useCallback(async () => {
    try {
      const [chosen, mine, pushInfo] = await Promise.all([
        api.request<{ settings: Settings }>("/api/companion/settings"),
        api.request<{ reminders: Reminder[] }>("/api/companion/reminders"),
        api.request<{ configured: boolean; publicKey: string | null }>("/api/push"),
      ]);
      setSettings(chosen.settings);
      setTime(chosen.settings.checkinAt);
      setReminders(mine.reminders.filter((r) => r.status === "scheduled"));
      setPush(pushInfo);
      const on = await deviceRemindersOn();
      setDeviceOn(on);
      if (on) await syncDeviceReminders(api);
      setError("");
    } catch (e) {
      setError(errorText(e));
    }
  }, [api]);
  useEffect(() => {
    void load();
  }, [load]);

  const run = async (work: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setError("");
    setStatus("");
    try {
      await work();
      await load();
      setStatus(done);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const save = (patch: Partial<Settings>, done: string) =>
    run(() => api.request("/api/companion/settings", patch, "PUT"), done);

  // In a browser this needs the server's push key; the phone app makes its own notifications.
  const canUseDevice = deviceRemindersAvailable() && (deviceReminderKind === "phone" || push.configured);
  const toggleDevice = () =>
    run(async () => {
      if (deviceOn) return turnOffDeviceReminders(api);
      const result = await turnOnDeviceReminders(api, push.publicKey ?? undefined);
      if (result === "denied")
        throw new Error("Notifications are blocked for Debo. Allow them in your browser or phone settings, then try again.");
      if (result === "unsupported") throw new Error("This device can't show Debo's reminders. They still show in the app.");
    }, deviceOn ? "Reminders on this device are off." : "Reminders on this device are on.");

  if (!settings)
    return (
      <Card style={{ gap: spacing[3] }}>
        <Text style={s.heading}>Reminders and check-in</Text>
        {error ? <ErrorNotice error={error} /> : <Text style={s.muted}>Loading…</Text>}
        {!!error && (
          <Button small onPress={() => void load()}>
            Try again
          </Button>
        )}
      </Card>
    );

  return (
    <Card style={{ gap: spacing[3] }}>
      <Text style={s.heading}>Reminders and check-in</Text>
      <CheckRow
        label="Birthdays and special days: a reminder the day before and on the morning"
        checked={settings.specialDays}
        onPress={() =>
          void save({ specialDays: !settings.specialDays }, settings.specialDays ? "Birthday reminders are off." : "Birthday reminders are on.")
        }
      />
      <CheckRow
        label="Morning check-in: a short 'Good morning' with what's coming up"
        checked={settings.checkin}
        onPress={() =>
          void save({ checkin: !settings.checkin, checkinAt: time }, settings.checkin ? "The morning check-in is off." : "The morning check-in is on.")
        }
      />
      {settings.checkin && (
        <View style={{ flexDirection: "row", gap: spacing[2], alignItems: "flex-end" }}>
          <View style={{ flex: 1 }}>
            <Field label="Check-in time (24-hour, for example 08:00)" value={time} onChangeText={setTime} />
          </View>
          <Button
            small
            busy={busy}
            disabled={time.trim() === settings.checkinAt}
            onPress={() => void save({ checkinAt: time.trim() }, `The check-in comes at ${time.trim()}.`)}
          >
            Save time
          </Button>
        </View>
      )}
      {canUseDevice && (
        <CheckRow
          label={deviceReminderKind === "phone" ? "Send me reminders on this phone" : "Send me reminders in this browser"}
          checked={deviceOn}
          onPress={() => void toggleDevice()}
        />
      )}
      {reminders.length > 0 && (
        <View style={{ gap: spacing[2] }}>
          <Text style={s.small}>Reminders you asked for</Text>
          {reminders.map((r) => (
            <View key={r.id} style={[s.between, { gap: spacing[2] }]}>
              <Text style={[s.text, { flex: 1 }]}>
                {r.title} · {when(r.at)}
              </Text>
              <Button
                small
                disabled={busy}
                onPress={() => void run(() => api.request(`/api/companion/reminders/${r.id}`, undefined, "DELETE"), "Reminder deleted.")}
              >
                Delete
              </Button>
            </View>
          ))}
        </View>
      )}
      <ErrorNotice error={error} />
      {!!status && (
        <Text style={s.muted} accessibilityLiveRegion="polite">
          {status}
        </Text>
      )}
      <Text style={s.muted}>
        These show as updates in Chat. Nothing is sent between 22:00 and 07:00 your time. A notification on your
        device shows only a short title, like "Good morning", "Call Mum" or "Tomorrow is Riya's birthday", never what
        you wrote.
      </Text>
    </Card>
  );
}
