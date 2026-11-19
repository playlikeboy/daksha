// Web: "Send me reminders" on this browser is web push, so reminders and the morning
// check-in arrive even when Daksha's tab is closed. Works in Chrome, Edge and Firefox, and on
// an iPhone only once Daksha is added to the Home Screen.
//
// The service worker (/sw.js) is registered only when the person turns this on, and the
// browser asks for permission only then. A push carries a short title, never journal text.
// Same names as debo-device-reminders.native.ts, so the settings card can call either.
type Api = { request<T>(path: string, body?: unknown, method?: string): Promise<T> };

export type DeviceReminderResult = "on" | "denied" | "unsupported";

/** "web" here: the switch needs the server's push key. */
export const deviceReminderKind = "web" as const;

/** True when this browser can get pushes at all. */
export function deviceRemindersAvailable(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

async function registration(): Promise<ServiceWorkerRegistration | undefined> {
  if (!deviceRemindersAvailable()) return undefined;
  return (await navigator.serviceWorker.getRegistration("/")) ?? undefined;
}

async function subscription(): Promise<PushSubscription | null> {
  const reg = await registration().catch(() => undefined);
  return (await reg?.pushManager.getSubscription().catch(() => null)) ?? null;
}

/** True when this browser is already sending Daksha's reminders. */
export async function deviceRemindersOn(): Promise<boolean> {
  return Boolean(await subscription());
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const padded = `${base64url}${"=".repeat((4 - (base64url.length % 4)) % 4)}`.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/** The person turned "Send me reminders" on in this browser. */
export async function turnOnDeviceReminders(api: Api, publicKey?: string): Promise<DeviceReminderResult> {
  if (!deviceRemindersAvailable() || !publicKey) return "unsupported";
  const permission =
    Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
  if (permission !== "granted") return "denied";
  const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
  const json = sub.toJSON();
  await api.request("/api/push/subscriptions", { endpoint: json.endpoint, keys: json.keys });
  return "on";
}

/** The person turned it off in this browser: forget it on the server and here. */
export async function turnOffDeviceReminders(api: Api): Promise<void> {
  const sub = await subscription();
  if (!sub) return;
  await api.request("/api/push/unsubscribe", { endpoint: sub.endpoint });
  await sub.unsubscribe();
}

/** Pushes come from the server, so there is nothing to keep in step here. */
export async function syncDeviceReminders(_api: Api): Promise<void> {}

/** Signing out: this browser stops getting pushes. The server forgets it at the next send. */
export async function forgetDeviceReminders(): Promise<void> {
  await (await subscription())?.unsubscribe().catch(() => false);
}
