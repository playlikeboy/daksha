// Phone: "Send me reminders" on this phone means the phone holds the next reminders itself,
// as local notifications (debo-reminder-alerts.native.ts), so they show even when Daksha is
// closed. No push server is involved. The phone asks for permission only when the person
// turns this on. The list is refreshed when the setting opens, when it is turned on, and
// when the person accepts a promise; a reminder made elsewhere shows once the app opens.
//
// Whether it is on is a small file in the app's own folder. Signing out removes it and
// every reminder the phone holds. Not run on a device yet.
import * as FileSystem from "expo-file-system/legacy";
import { allowReminders, cancelAllReminders, remindersOnThisDevice, scheduleReminder } from "./debo-reminder-alerts";

type Api = { request<T>(path: string, body?: unknown, method?: string): Promise<T> };

export type DeviceReminderResult = "on" | "denied" | "unsupported";

export const deviceReminderKind = "phone" as const;

/** iOS keeps at most 64 waiting notifications per app; stay under it. */
const PHONE_MAX = 50;

const flag = () => (FileSystem.documentDirectory ? `${FileSystem.documentDirectory}reminders-on.txt` : undefined);

export function deviceRemindersAvailable(): boolean {
  return remindersOnThisDevice();
}

export async function deviceRemindersOn(): Promise<boolean> {
  const path = flag();
  if (!path) return false;
  try {
    return (await FileSystem.getInfoAsync(path)).exists;
  } catch {
    return false;
  }
}

/** Puts the next reminders on the phone, replacing whatever it held before. */
export async function syncDeviceReminders(api: Api): Promise<void> {
  if (!(await deviceRemindersOn())) return;
  const { upcoming } = await api.request<{ upcoming: { id: string; title: string; at: string }[] }>(
    "/api/companion/upcoming",
  );
  await cancelAllReminders();
  for (const item of upcoming.slice(0, PHONE_MAX))
    await scheduleReminder({ title: item.title, at: new Date(item.at) });
}

export async function turnOnDeviceReminders(api: Api, _publicKey?: string): Promise<DeviceReminderResult> {
  if (!remindersOnThisDevice()) return "unsupported";
  if (!(await allowReminders())) return "denied";
  const path = flag();
  if (path) await FileSystem.writeAsStringAsync(path, "on");
  await syncDeviceReminders(api);
  return "on";
}

export async function turnOffDeviceReminders(_api?: Api): Promise<void> {
  await forgetDeviceReminders();
}

export async function forgetDeviceReminders(): Promise<void> {
  const path = flag();
  if (path) await FileSystem.deleteAsync(path, { idempotent: true }).catch(() => {});
  await cancelAllReminders().catch(() => {});
}
