import type { AgentNotification } from "../../../packages/domain/src/agent";

/** The updates the chat card shows: unread, from a task, newest first. */
export function chatUpdates(notifications: readonly AgentNotification[] = []): AgentNotification[] {
  return notifications
    .filter((item) => !item.read && item.taskId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
