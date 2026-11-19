// Phone: reminders as notifications made on this phone (expo-notifications).
//
// These are local notifications: the phone itself shows them at the time set,
// even if Daksha is closed, and nothing goes through a push server. Remote push
// (a reminder made on another device reaching this phone) needs Firebase and
// Apple push credentials the project does not have yet.
//
// Nothing here asks for permission by itself. Call allowReminders() only when
// the person turns reminders on, so the question comes with a reason.
//
// No screen calls this yet: it is ready for the reminders feature.
// Not run on a device yet.
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

const CHANNEL = "reminders";
let handlerSet = false;

/** Show a reminder that is due while Daksha is open, too (by default the phone hides it then). */
function showWhileOpen() {
  if (handlerSet) return;
  handlerSet = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/** True when this device can show reminders made here. */
export function remindersOnThisDevice(): boolean {
  return Platform.OS === "android" || Platform.OS === "ios";
}

/**
 * The person turned reminders on: ask the phone for permission (once; after
 * that the phone remembers the answer). Returns false when they said no, so the
 * screen can say how to allow it in the phone's settings.
 */
export async function allowReminders(): Promise<boolean> {
  if (Platform.OS === "android") {
    // Android 13 and later need a channel before the permission question can show.
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: "Reminders",
      description: "Reminders you asked Daksha for.",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  const current = await Notifications.getPermissionsAsync();
  const answer = current.granted || !current.canAskAgain ? current : await Notifications.requestPermissionsAsync();
  if (answer.granted) showWhileOpen();
  return answer.granted;
}

/** Show a reminder at `at`. Returns its id (to cancel it), or undefined when reminders are not allowed. */
export async function scheduleReminder(reminder: { title: string; body?: string; at: Date }): Promise<string | undefined> {
  const permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) return undefined;
  showWhileOpen();
  return Notifications.scheduleNotificationAsync({
    content: { title: reminder.title, body: reminder.body ?? "" },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: reminder.at, channelId: CHANNEL },
  });
}

export async function cancelReminder(id: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(id);
}

/** Signing out or turning reminders off: remove every reminder this phone was holding. */
export async function cancelAllReminders(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}
