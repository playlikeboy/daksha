// A voice call written out as text. Pure functions, no database.
//
// The call is one source (kind voice_call). Its text is one line per turn:
//   [00:00] You: what did I do last weekend
//   [00:07] Daksha: You went hiking with Arun.
// "[mm:ss]" is how far into the call the turn was said. The same text is what
// the person reads, what search finds and what is exported. Never log it.
import { createHash } from "node:crypto";

export type CallSpeaker = "person" | "debo";
export type CallTurn = { who: CallSpeaker; text: string; at: string };

const LABEL: Record<CallSpeaker, string> = { person: "You", debo: "Daksha" };
/** One turn is cut here, so a runaway reply cannot fill the database. */
export const MAX_TURN_CHARS = 4000;
/** A call stops growing here (about an hour of fast talk). */
export const MAX_CALL_CHARS = 200_000;
/** Fewer words from the person than this and the call is not kept: there is nothing to learn. */
export const MIN_PERSON_WORDS = 3;

/** The same call (this person, this session) always has the same source id. */
export function callSourceId(userId: string, sessionId: string): string {
  const hex = createHash("sha256").update(`debo-call:${userId}:${sessionId}`).digest("hex");
  const variant = ((Number.parseInt(hex.slice(16, 17), 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** One turn on one line: no line breaks, no stray spaces, never too long. */
export function cleanTurn(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, MAX_TURN_CHARS);
}

export function speakerLabel(who: CallSpeaker): string {
  return LABEL[who];
}

export function offsetLabel(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function formatTurn(who: CallSpeaker, text: string, offsetSeconds: number): string {
  return `[${offsetLabel(offsetSeconds)}] ${LABEL[who]}: ${cleanTurn(text)}`;
}

// Calls saved before the rename say "Debo:" instead of "Daksha:". brand-check: keep
const LINE = /^\[(\d+):(\d{2})\] (You|Daksha|Debo): (.*)$/; // brand-check: keep

/** The turns of a call, in order. `at` is the "mm:ss" mark. Lines that do not fit are skipped. */
export function parseCall(text: string): (CallTurn & { seconds: number })[] {
  const turns: (CallTurn & { seconds: number })[] = [];
  for (const line of text.split("\n")) {
    const m = LINE.exec(line);
    if (!m) continue;
    const seconds = Number(m[1]) * 60 + Number(m[2]);
    turns.push({ who: m[3] === "You" ? "person" : "debo", text: m[4] ?? "", at: `${m[1]}:${m[2]}`, seconds });
  }
  return turns;
}

export function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/** How many words the person said, not counting Daksha. */
export function personWords(text: string): number {
  return parseCall(text)
    .filter((t) => t.who === "person")
    .reduce((n, t) => n + wordCount(t.text), 0);
}

/** Whole minutes the call lasted, at least 1. */
export function callMinutes(text: string): number {
  const last = parseCall(text).at(-1)?.seconds ?? 0;
  return Math.max(1, Math.ceil(last / 60));
}

export function callTitle(text: string): string {
  const m = callMinutes(text);
  return `Voice call · ${m} ${m === 1 ? "minute" : "minutes"}`;
}

/** Pieces for search: whole turns grouped to about 1,200 characters, in order. */
export function splitCallIntoChunks(text: string, size = 1200): string[] {
  const pieces: string[] = [];
  let current = "";
  const push = () => {
    if (current.trim()) pieces.push(current.trim());
    current = "";
  };
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    if (current && current.length + line.length + 1 > size) push();
    if (line.length > size) {
      push();
      for (let i = 0; i < line.length; i += size) pieces.push(line.slice(i, i + size));
    } else current += `${line}\n`;
  }
  push();
  return pieces;
}
