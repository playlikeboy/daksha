// Changing the app by asking: the person says "talk slower", "call yourself Riya" or "turn on
// my morning check-in" in chat or on a call, and it changes at once.
//
//   update_talk_settings  write  Voice, speed, mood, length, language, and adding a line to the
//                                person's notes. Uses the talk settings store and its checks.
//   update_identity       write  The assistant's name, tone and character (the "About Debo" row).
//   update_reminders      write  Birthday reminders, the morning check-in and its time. Uses the
//                                companion settings store and its checks (no quiet-hours times).
//   open_screen           read   Returns a card that opens a screen or sheet in the app, for things
//                                only the app can do (build a face, add files, connect an app).
//
// All of these change only the person's own settings inside Debo, so they save at once with
// no review (decision 28). None of them deletes anything: wiping the notes, removing people or
// reminders, and deleting data stay in the app, behind a tap.
import { defineTool } from "@copilotkit/runtime/v2";
import { z } from "zod";
import { type AgentIdentity, agentCharacters } from "../../../packages/domain/src/agent.ts";
import { appScreenInfo, appScreens } from "../../../packages/domain/src/screens.ts";
import type { Store } from "./db.ts";
import { AppError } from "./errors.ts";
import { CompanionSettingsStore } from "./reminders.ts";
import {
  CONTEXT_MAX,
  languages,
  lengths,
  moods,
  SPEED_MAX,
  SPEED_MIN,
  type TalkSettings,
  TalkSettingsStore,
  VOICES,
} from "./talk-settings.ts";

export const settingsInstructions =
  " CHANGING SETTINGS BY ASKING: when the person asks you to change how you talk (voice, speed, mood, how much you say, language), your name, your tone or which character you are, or their birthday reminders and morning check-in, change it at once with update_talk_settings, update_identity or update_reminders. Change only what they asked for, then say in one short sentence what changed. If a tool returns an error, say what went wrong in plain words. Never say a setting changed unless the tool returned status saved. " +
  "When they want something only the app can do (build a face, add chats, photos or recordings, connect an app, see what you know, tidy their notes, delete something), or ask where a setting is, call open_screen with the closest screen. In chat a card with a button appears. On a call they can't tap it, so tell them where to find it in a few words.";

/** The name each built-in character offers. Any other character keeps the person's name. */
const characterNames: Partial<Record<string, string>> = {
  debo: "Debo",
  diya: "Diya",
  anaya: "Anaya",
  mishti: "Mishti",
  kabir: "Kabir",
};
const tones = ["warm", "concise", "thoughtful"] as const;
const toneWords: Record<(typeof tones)[number], string> = {
  warm: "warm",
  concise: "short and clear",
  thoughtful: "thoughtful",
};
const lengthWords: Record<(typeof lengths)[number], string> = {
  short: "talks less",
  balanced: "in between",
  detailed: "talks more",
};
const languageWords: Record<(typeof languages)[number], string> = {
  match: "matches yours",
  english: "English",
  hindi: "Hindi",
  hinglish: "Hinglish",
};

const plain = (error: unknown, fallback: string) =>
  error instanceof AppError
    ? error.message
    : error instanceof z.ZodError
      ? error.issues.map((i) => i.message).join("; ")
      : fallback;

/** Drops keys whose value is undefined, so a merge never wipes a saved field. */
function defined<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;
}

/** Finds a voice by its id or its name ("Robyn", "robyn"). */
export function findVoice(text: string) {
  const wanted = text.trim().toLowerCase();
  return VOICES.find((v) => v.id === text.trim() || v.name.toLowerCase() === wanted);
}

export const talkChangeInput = z
  .object({
    voice: z.string().trim().min(1).max(80).optional(),
    speed: z
      .number()
      .min(SPEED_MIN, `Speed goes from ${SPEED_MIN} to ${SPEED_MAX}.`)
      .max(SPEED_MAX, `Speed goes from ${SPEED_MIN} to ${SPEED_MAX}.`)
      .optional(),
    mood: z.enum(moods).optional(),
    length: z.enum(lengths).optional(),
    language: z.enum(languages).optional(),
    addContext: z.string().trim().min(1).max(CONTEXT_MAX).optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), "Say what to change.");

export const identityChangeInput = z
  .object({
    name: z.string().trim().min(1, "A name needs at least one letter.").max(80).optional(),
    tone: z.enum(tones).optional(),
    character: z.enum(agentCharacters).optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), "Say what to change.");

export const remindersChangeInput = z
  .object({
    specialDays: z.boolean().optional(),
    checkin: z.boolean().optional(),
    checkinAt: z.string().trim().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), "Say what to change.");

export const openScreenInput = z.object({
  screen: z.enum(appScreens),
  reason: z.string().trim().max(200).optional(),
});

/** Chat and voice tools that change the person's own settings. Every read and write is this owner's. */
export function settingsTools(
  db: Store,
  owner: string,
  options: { channel?: "chat" | "voice"; signal?: AbortSignal } = {},
) {
  const { signal, channel = "chat" } = options;
  const talk = new TalkSettingsStore(db);
  const companion = new CompanionSettingsStore(db);
  return [
    defineTool({
      name: "update_talk_settings",
      description: `Change how you talk, for this person, at once. Only the fields sent change. voice: a voice name (${VOICES.map((v) => v.name).join(", ")}). speed: for calls, ${SPEED_MIN} (slowest) to ${SPEED_MAX} (fastest), 1 is normal, 0.9 is a bit slower, 1.15 a bit faster. mood: ${moods.join(", ")}. length (how much you say): ${lengths.join(", ")}. language: ${languages.join(", ")} (match means reply in the person's own language). addContext: one short thing to add to the person's notes about themselves (what to call them, their city); it never replaces or deletes the notes.`,
      parameters: talkChangeInput,
      execute: async (args) => {
        signal?.throwIfAborted();
        try {
          const ask = talkChangeInput.parse(args);
          const voice = ask.voice === undefined ? undefined : findVoice(ask.voice);
          if (ask.voice !== undefined && !voice)
            return { error: `There is no voice called "${ask.voice}". The voices are ${VOICES.map((v) => v.name).join(", ")}.` };
          let context: string | undefined;
          if (ask.addContext) {
            const old = (await talk.get(owner))?.context?.trim();
            context = old ? `${old}\n${ask.addContext}` : ask.addContext;
            if (context.length > CONTEXT_MAX)
              return { error: "Your notes are full. Open Voice, personality and notes to make room, then try again." };
          }
          const saved = await talk.set(
            owner,
            defined({ voice: voice?.id, speed: ask.speed, mood: ask.mood, length: ask.length, language: ask.language, context }),
          );
          return {
            status: "saved",
            kind: "talk-settings",
            changed: talkChanges(ask, voice?.name),
            settings: shownTalk(saved),
            screen: "talk-settings",
            note: "Saved. Voice and speed apply from the next call. Tell the person what changed in one short sentence.",
          };
        } catch (error) {
          signal?.throwIfAborted();
          return { error: plain(error, "I couldn't change that setting just now. Try again in a moment.") };
        }
      },
    }),
    defineTool({
      name: "update_identity",
      description: `Change your own name, tone or character for this person, at once. name: what they want to call you. tone: ${tones.join(", ")} (concise means short and clear). character: who they talk to (${agentCharacters.join(", ")}). When only the character changes and your name is empty or another character's name, your name follows the new character; a name the person chose themselves is kept.`,
      parameters: identityChangeInput,
      execute: async (args) => {
        signal?.throwIfAborted();
        try {
          const ask = identityChangeInput.parse(args);
          await db.insertIfAbsent(owner, "agent-settings", { id: "identity", name: "Debo", tone: "warm" });
          const before = await db.get<AgentIdentity>(owner, "agent-settings", "identity");
          let name = ask.name;
          let keptName: string | undefined;
          if (ask.character && name === undefined) {
            const current = before?.name?.trim() ?? "";
            const offered = characterNames[ask.character];
            const isCharacterName = Object.values(characterNames).includes(current);
            if (offered && (!current || isCharacterName)) name = offered;
            else if (offered && current !== offered) keptName = current;
          }
          const patch = defined({ name, tone: ask.tone, character: ask.character });
          const identity = await db.compareAndSwap<AgentIdentity>(owner, "agent-settings", "identity", {}, patch);
          if (!identity) return { error: "I couldn't save that just now. Try again in a moment." };
          const changed = [
            ...(patch.name !== undefined ? [`Name: ${patch.name}`] : []),
            ...(ask.tone ? [`Tone: ${toneWords[ask.tone]}`] : []),
            ...(ask.character ? [`Character: ${characterNames[ask.character] ?? ask.character}`] : []),
          ];
          return {
            status: "saved",
            kind: "identity",
            changed,
            identity: { name: identity.name, tone: identity.tone, character: identity.character ?? "debo" },
            ...(keptName ? { keptName } : {}),
            screen: "apps",
            note: keptName
              ? `Saved. The name the person chose (${keptName}) is kept; you may ask once if they want the character's name instead. Use the new name from now on.`
              : "Saved. Use the new name and tone from now on. Tell the person what changed in one short sentence.",
          };
        } catch (error) {
          signal?.throwIfAborted();
          return { error: plain(error, "I couldn't change that just now. Try again in a moment.") };
        }
      },
    }),
    defineTool({
      name: "update_reminders",
      description:
        "Change what Debo sends the person on her own, at once. specialDays: birthday and special-day reminders from People in your life, on or off. checkin: the morning check-in, on or off. checkinAt: its time as HH:MM in 24 hours, between 07:00 and 22:00 (nothing is sent at night). Adding or removing a single reminder is not done here.",
      parameters: remindersChangeInput,
      execute: async (args) => {
        signal?.throwIfAborted();
        try {
          const ask = remindersChangeInput.parse(args);
          const saved = await companion.set(owner, defined(ask));
          const changed = [
            ...(ask.specialDays !== undefined ? [`Birthday reminders: ${ask.specialDays ? "on" : "off"}`] : []),
            ...(ask.checkin !== undefined ? [`Morning check-in: ${ask.checkin ? "on" : "off"}`] : []),
            ...(ask.checkinAt !== undefined ? [`Check-in time: ${saved.checkinAt}`] : []),
          ];
          return {
            status: "saved",
            kind: "reminders",
            changed,
            settings: { specialDays: saved.specialDays, checkin: saved.checkin, checkinAt: saved.checkinAt },
            screen: "reminders",
            note: "Saved. These come as updates in the app, and as notifications on devices where the person turned reminders on. Nothing is sent between 22:00 and 07:00.",
          };
        } catch (error) {
          signal?.throwIfAborted();
          return { error: plain(error, "I couldn't change your reminders just now. Try again in a moment.") };
        }
      },
    }),
    defineTool({
      name: "open_screen",
      description: `Show the person a button that opens a screen or sheet in the app. Use for things only the app can do, or when they ask where something is. screen: ${appScreens.map((id) => `${id} (${appScreenInfo[id].title})`).join(", ")}. reason: a few words on why, shown on the card.`,
      parameters: openScreenInput,
      execute: async (args) => {
        signal?.throwIfAborted();
        try {
          const { screen, reason } = openScreenInput.parse(args);
          const info = appScreenInfo[screen];
          return {
            status: "ready",
            screen,
            title: info.title,
            where: info.where,
            ...(reason ? { reason } : {}),
            note:
              channel === "voice"
                ? `The person is on a call and can't tap a card. Tell them where to find it: ${info.where}.`
                : "A card with a button to open it is shown. Say so in a few words.",
          };
        } catch (error) {
          return { error: plain(error, "I couldn't find that screen.") };
        }
      },
    }),
  ];
}

function talkChanges(ask: z.infer<typeof talkChangeInput>, voiceName?: string): string[] {
  return [
    ...(voiceName ? [`Voice: ${voiceName}`] : []),
    ...(ask.speed !== undefined ? [`Speed: ${ask.speed === 1 ? "normal" : ask.speed < 1 ? "slower" : "faster"} (${ask.speed})`] : []),
    ...(ask.mood ? [`Mood: ${ask.mood}`] : []),
    ...(ask.length ? [`How much I say: ${lengthWords[ask.length]}`] : []),
    ...(ask.language ? [`Language: ${languageWords[ask.language]}`] : []),
    ...(ask.addContext ? ["Added a line to your notes"] : []),
  ];
}

/** The saved talk settings without the notes text, which the model already has in its prompt. */
function shownTalk(s: TalkSettings) {
  const voice = VOICES.find((v) => v.id === s.voice);
  return defined({ voice: voice?.name, speed: s.speed, mood: s.mood, length: s.length, language: s.language });
}
