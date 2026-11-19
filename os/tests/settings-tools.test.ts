import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { appScreenInfo, appScreens } from "../packages/domain/src/screens.ts";
import { createStore, type Store } from "../apps/server/src/db.ts";
import { voiceStyle } from "../apps/server/src/engine/personality.ts";
import { CompanionSettingsStore } from "../apps/server/src/reminders.ts";
import { findVoice, settingsInstructions, settingsTools } from "../apps/server/src/settings-tools.ts";
import { CONTEXT_MAX, TalkSettingsStore, VOICES } from "../apps/server/src/talk-settings.ts";

let db: Store;
before(async () => {
  db = await createStore();
});
after(async () => {
  await db.close();
});

type Tool = { name: string; execute: (args: unknown) => Promise<Record<string, unknown>> };
const toolsFor = (owner: string, channel: "chat" | "voice" = "chat") => {
  const tools = settingsTools(db, owner, { channel }) as unknown as Tool[];
  return (name: string, args: unknown) => tools.find((t) => t.name === name)!.execute(args);
};

test("the four settings tools are offered, in one block", () => {
  const names = (settingsTools(db, "x") as unknown as Tool[]).map((t) => t.name);
  assert.deepEqual(names, ["update_talk_settings", "update_identity", "update_reminders", "open_screen"]);
});

test("update_talk_settings changes voice, speed, mood, length and language for this person only", async () => {
  const run = toolsFor("talk-a");
  const robyn = VOICES.find((v) => v.name === "Robyn")!;
  const out = await run("update_talk_settings", { voice: "robyn", speed: 0.9, mood: "calm", length: "short", language: "hinglish" });
  assert.equal(out.status, "saved");
  assert.ok((out.changed as string[]).includes("Voice: Robyn"));
  const saved = await new TalkSettingsStore(db).get("talk-a");
  assert.equal(saved?.voice, robyn.id);
  assert.equal(saved?.speed, 0.9);
  assert.equal(saved?.mood, "calm");
  assert.equal(saved?.length, "short");
  assert.equal(saved?.language, "hinglish");
  assert.equal(await new TalkSettingsStore(db).get("talk-b"), null, "another person is untouched");

  // Only what is sent changes.
  await run("update_talk_settings", { mood: "playful" });
  const again = await new TalkSettingsStore(db).get("talk-a");
  assert.equal(again?.mood, "playful");
  assert.equal(again?.voice, robyn.id);
  assert.equal(again?.speed, 0.9);
});

test("update_talk_settings refuses bad values in plain words and saves nothing", async () => {
  const run = toolsFor("talk-c");
  assert.match(String((await run("update_talk_settings", { voice: "Morgan Freeman" })).error), /no voice called/);
  assert.match(String((await run("update_talk_settings", { speed: 3 })).error), /Speed goes from 0.8 to 1.3/);
  assert.ok((await run("update_talk_settings", { mood: "angry" })).error);
  assert.match(String((await run("update_talk_settings", {})).error), /Say what to change/);
  assert.equal(await new TalkSettingsStore(db).get("talk-c"), null);
});

test("update_talk_settings adds to the notes and never replaces or wipes them", async () => {
  const run = toolsFor("talk-d");
  await new TalkSettingsStore(db).set("talk-d", { context: "Call me Kunal." });
  await run("update_talk_settings", { addContext: "I live in Pune." });
  assert.equal((await new TalkSettingsStore(db).get("talk-d"))?.context, "Call me Kunal.\nI live in Pune.");
  const full = await run("update_talk_settings", { addContext: "x".repeat(CONTEXT_MAX) });
  assert.match(String(full.error), /notes are full/);
  assert.equal((await new TalkSettingsStore(db).get("talk-d"))?.context, "Call me Kunal.\nI live in Pune.");
});

test("findVoice matches a name or an id, nothing else", () => {
  assert.equal(findVoice("BLAKE")?.name, "Blake");
  assert.equal(findVoice(VOICES[0].id)?.id, VOICES[0].id);
  assert.equal(findVoice("someone famous"), undefined);
});

test("update_identity renames, changes tone and character, for this person only", async () => {
  const run = toolsFor("id-a");
  const out = await run("update_identity", { name: "Riya", tone: "concise" });
  assert.equal(out.status, "saved");
  const saved = await db.get<{ name: string; tone: string }>("id-a", "agent-settings", "identity");
  assert.equal(saved?.name, "Riya");
  assert.equal(saved?.tone, "concise");
  assert.equal(await db.get("id-b", "agent-settings", "identity"), null, "another person is untouched");

  // A name the person chose is kept when only the character changes.
  const picked = await run("update_identity", { character: "kabir" });
  assert.equal(picked.keptName, "Riya");
  const later = await db.get<{ name: string; character: string }>("id-a", "agent-settings", "identity");
  assert.equal(later?.name, "Riya");
  assert.equal(later?.character, "kabir");
});

test("update_identity: a character's own name follows the new character", async () => {
  const run = toolsFor("id-c");
  await run("update_identity", { character: "diya" });
  const saved = await db.get<{ name: string; character: string }>("id-c", "agent-settings", "identity");
  assert.equal(saved?.name, "Diya", "the default name Debo is a character name, so it follows");
  assert.equal(saved?.character, "diya");
});

test("update_identity refuses bad values", async () => {
  const run = toolsFor("id-d");
  assert.ok((await run("update_identity", { name: "   " })).error);
  assert.ok((await run("update_identity", { tone: "rude" })).error);
  assert.ok((await run("update_identity", { character: "batman" })).error);
  assert.match(String((await run("update_identity", {})).error), /Say what to change/);
  assert.equal(await db.get("id-d", "agent-settings", "identity"), null, "nothing is written on a bad ask");
});

test("update_reminders changes birthday reminders and the check-in, for this person only", async () => {
  const run = toolsFor("rem-a");
  const out = await run("update_reminders", { specialDays: false, checkin: true, checkinAt: "07:30" });
  assert.equal(out.status, "saved");
  const saved = await new CompanionSettingsStore(db).get("rem-a");
  assert.equal(saved.specialDays, false);
  assert.equal(saved.checkin, true);
  assert.equal(saved.checkinAt, "07:30");
  const other = await new CompanionSettingsStore(db).get("rem-b");
  assert.equal(other.specialDays, true, "another person keeps the defaults");
  // Only what is sent changes.
  await run("update_reminders", { checkin: false });
  const again = await new CompanionSettingsStore(db).get("rem-a");
  assert.equal(again.checkinAt, "07:30");
  assert.equal(again.specialDays, false);
});

test("update_reminders refuses night times and bad times in plain words", async () => {
  const run = toolsFor("rem-c");
  assert.match(String((await run("update_reminders", { checkinAt: "23:00" })).error), /between 07:00 and 22:00/);
  assert.match(String((await run("update_reminders", { checkinAt: "8am" })).error), /hours and minutes/);
  assert.equal((await new CompanionSettingsStore(db).get("rem-c")).checkinAt, "08:00");
});

test("open_screen only knows the typed screens, and says where to look on a call", async () => {
  const chat = toolsFor("scr-a");
  const out = await chat("open_screen", { screen: "talk-settings", reason: "to pick a voice" });
  assert.equal(out.status, "ready");
  assert.equal(out.title, appScreenInfo["talk-settings"].title);
  assert.ok((await chat("open_screen", { screen: "secret-admin" })).error);
  const voice = toolsFor("scr-a", "voice");
  const spoken = await voice("open_screen", { screen: "avatar-builder" });
  assert.match(String(spoken.note), /can't tap/);
  for (const id of appScreens) assert.ok(appScreenInfo[id].title && appScreenInfo[id].where);
});

test("the prompt tells her to change settings at once, and the voice line matches", () => {
  assert.match(settingsInstructions, /update_talk_settings/);
  assert.match(settingsInstructions, /open_screen/);
  assert.match(voiceStyle, /changing your name, voice/);
  const conversation = readFileSync(new URL("../apps/server/src/engine/conversation.ts", import.meta.url), "utf8");
  assert.match(conversation, /\.\.\.settingsTools\(/);
  assert.match(conversation, /settingsInstructions/);
});
