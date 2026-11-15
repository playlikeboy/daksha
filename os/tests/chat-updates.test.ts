import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { chatUpdates } from "../apps/mobile/src/chat-updates.ts";

const note = (id: string, createdAt: string, extra: { read?: boolean; taskId?: string } = {}) => ({
  id,
  title: id,
  body: "",
  createdAt,
  read: extra.read ?? false,
  ...("taskId" in extra ? { taskId: extra.taskId } : { taskId: "task-1" }),
});

test("the chat's update card shows the newest unread update first, with or without a task", () => {
  const updates = chatUpdates([
    note("old", "2026-11-10T08:00:00.000Z"),
    note("new", "2026-11-14T08:00:00.000Z"),
    note("read", "2026-11-15T08:00:00.000Z", { read: true }),
    note("reminder", "2026-11-15T09:00:00.000Z", { taskId: undefined }),
  ]);
  assert.deepEqual(
    updates.map((u) => u.id),
    ["reminder", "new", "old"],
  );
  assert.deepEqual(chatUpdates(undefined), []);
});

test("the update card offers View task only for an update from a task", () => {
  const card = readFileSync(new URL("../apps/mobile/src/background-updates.tsx", import.meta.url), "utf8");
  assert.match(card, /update\.taskId && \(\s*<Button/);
  assert.match(card, /Dismiss this update/);
});

test("the update card sits above the composer, outside the scrolling timeline", () => {
  const chat = readFileSync(new URL("../apps/mobile/src/chat.tsx", import.meta.url), "utf8");
  const card = chat.indexOf("<BackgroundUpdates />");
  assert.ok(card > 0, "the chat shows the card");
  const timelineOpens = chat.lastIndexOf("<ScrollView", card);
  const timelineCloses = chat.indexOf("</ScrollView>", timelineOpens);
  assert.ok(timelineCloses < card, "not inside the timeline, so replies land below it");
  assert.ok(chat.lastIndexOf("<KeyboardAvoidingView", card) > timelineCloses, "it is part of the composer area");
});
