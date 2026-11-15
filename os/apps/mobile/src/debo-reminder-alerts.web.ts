// Web: reminders made on this device are a phone feature (see
// debo-reminder-alerts.native.ts). Same names, so screens can call either.
export function remindersOnThisDevice(): boolean {
  return false;
}

export async function allowReminders(): Promise<boolean> {
  return false;
}

export async function scheduleReminder(_reminder: { title: string; body?: string; at: Date }): Promise<string | undefined> {
  return undefined;
}

export async function cancelReminder(_id: string): Promise<void> {}

export async function cancelAllReminders(): Promise<void> {}
