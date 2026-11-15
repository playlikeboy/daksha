import type { AgentNotification } from "../../../packages/domain/src/agent";

/**
 * The updates the chat card shows: unread, newest first. That is task results, and also
 * updates with no task: reminders, birthdays and the morning check-in.
 */
export function chatUpdates(notifications: readonly AgentNotification[] = []): AgentNotification[] {
  return notifications.filter((item) => !item.read).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
