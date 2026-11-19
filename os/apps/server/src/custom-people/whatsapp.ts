// Reading a WhatsApp chat export ("Export chat" in WhatsApp, as a .txt or a .zip with _chat.txt).
//
// The two phone apps write it differently, and the format follows the phone's language settings:
//   Android: 31/12/2023, 21:41 - Asha: see you soon
//            12/31/23, 9:41 PM - Asha: see you soon
//   iPhone:  [31/12/2023, 21:41:05] Asha: see you soon
//            [12/31/23, 9:41:05 PM] Asha: see you soon
// Dates use "/", "." or "-"; years have two or four digits; times are 12 or 24 hour, sometimes
// with a narrow space before AM/PM. Day and month order is worked out from the whole file.
// A message can run over several lines: a line that does not start with a date belongs to the
// message before it.
//
// Dropped: "<Media omitted>", "image omitted" and other attachments, deleted messages, and system
// lines (encryption notices, "joined", "changed the group name" and so on). The file is the
// person's data: nothing here is logged.

import { unzipSync } from "fflate";

/** The largest chat text read out of a zip. */
const CHAT_TEXT_MAX_BYTES = 60 * 1024 * 1024;

/** A problem with the file, in words the person sees. */
const readError = (message: string) => Object.assign(new Error(message), { name: "ReadError" });

export interface ChatMessage {
  /** ISO time, or null when the date could not be read. */
  at: string | null;
  sender: string;
  text: string;
}

export interface ParsedChat {
  messages: ChatMessage[];
  /** Everyone who wrote, most messages first. */
  senders: { name: string; count: number }[];
}

// Invisible marks WhatsApp puts around names and before system lines.
const MARKS = /[\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g;

const LINE =
  /^\[?(\d{1,4})[/.\-](\d{1,2})[/.\-](\d{1,4}),?\s+(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?\s*([aApP]\.?\s?[mM]\.?)?\]?\s*(?:-\s+|\s)(.*)$/;

const MEDIA = [
  /^<media omitted>$/i,
  /^<attached: .*>$/i,
  /^(image|video|audio|sticker|gif|document|contact card|voice message) omitted$/i,
  /^.+ \(file attached\)$/i,
  /^null$/i,
  /^this message was deleted\.?$/i,
  /^you deleted this message\.?$/i,
  /^waiting for this message\.?.*$/i,
  /^<this message was edited>$/i,
  /^missed (voice|video) call/i,
  /^(voice|video) call, /i,
  /^location: https?:\/\//i,
  /^live location shared$/i,
  /^poll:$/i,
];

// Only phrases no person would type as a whole message. iPhone system lines are also caught by
// the invisible mark WhatsApp puts before them.
const SYSTEM = [
  /^messages and calls are end-to-end encrypted/i,
  /^messages to this (group|chat) are now secured/i,
  /^.{1,80} created (the )?group /i,
  /^.{1,80} joined using this group's invite link$/i,
  /^.{1,80} changed (the subject|this group's|the group)/i,
  /^.{1,80} changed their phone number/i,
  /^your security code with .* changed/i,
  /turned (on|off) disappearing messages/i,
  /^you (blocked|unblocked) this contact/i,
];

type Raw = {
  a: number;
  b: number;
  year: number;
  hour: number;
  minute: number;
  second: number;
  half?: "am" | "pm";
  rest: string;
  /** iPhone: an invisible mark right after "Name: " means an attachment or a system line. */
  marked: boolean;
};

function readLine(line: string): Raw | null {
  const m = line.replace(MARKS, "").replace(/\u202f|\u00a0/g, " ").match(LINE);
  if (!m) return null;
  const [, first = "", second = "", third = ""] = m;
  // A year first (2023-12-31) is year, month, day: kept as day then month, like the usual order.
  const yearFirst = first.length === 4;
  const year = Number(yearFirst ? first : third);
  const half = m[7]?.toLowerCase().replace(/[.\s]/g, "");
  return {
    a: Number(yearFirst ? third : first),
    b: Number(second),
    year: year < 100 ? 2000 + year : year,
    hour: Number(m[4]),
    minute: Number(m[5]),
    second: Number(m[6] ?? 0),
    ...(half === "am" || half === "pm" ? { half } : {}),
    rest: m[8] ?? "",
    marked: /: \u200e/.test(line),
  };
}

/** Day first unless a line proves the month comes first. Ambiguous files are read day first. */
function dayFirst(rows: Raw[]): boolean {
  let dayFirstProof = 0;
  let monthFirstProof = 0;
  for (const r of rows) {
    if (r.a > 12) dayFirstProof++;
    if (r.b > 12) monthFirstProof++;
  }
  return !(monthFirstProof > dayFirstProof);
}

function when(r: Raw, dmy: boolean): string | null {
  const day = dmy ? r.a : r.b;
  const month = dmy ? r.b : r.a;
  let hour = r.hour;
  if (r.half === "pm" && hour < 12) hour += 12;
  if (r.half === "am" && hour === 12) hour = 0;
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || r.minute > 59) return null;
  const date = new Date(Date.UTC(r.year, month - 1, day, hour, r.minute, r.second));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function splitSender(rest: string): { sender: string; text: string } | null {
  // "Name: text". A system line has no colon after a name. Names are short.
  const at = rest.indexOf(": ");
  const bare = rest.endsWith(":") && !rest.slice(0, -1).includes(": ");
  if (at <= 0 && !bare) return null;
  const sender = (bare ? rest.slice(0, -1) : rest.slice(0, at)).replace(MARKS, "").trim();
  if (!sender || sender.length > 80) return null;
  return { sender, text: bare ? "" : rest.slice(at + 2) };
}

/** True for lines that are not something a person wrote. */
export function isNoise(text: string): boolean {
  const raw = text.trim();
  // iPhone marks attachments and system messages with an invisible left-to-right mark first.
  if (/^\u200e/.test(raw)) return true;
  const clean = raw.replace(MARKS, "").replace(/<This message was edited>$/i, "").trim();
  if (!clean) return true;
  return MEDIA.some((r) => r.test(clean));
}

/** Read a whole export. Never throws on odd text: lines it cannot place are left out. */
export function parseWhatsApp(text: string): ParsedChat {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const heads: { index: number; raw: Raw }[] = [];
  lines.forEach((line, index) => {
    const raw = readLine(line);
    if (raw) heads.push({ index, raw });
  });
  const dmy = dayFirst(heads.map((h) => h.raw));
  const messages: ChatMessage[] = [];
  for (let i = 0; i < heads.length; i++) {
    const head = heads[i];
    if (!head) continue;
    const end = heads[i + 1]?.index ?? lines.length;
    const split = splitSender(head.raw.rest);
    if (!split) continue; // a system line with no sender
    const continuation = lines.slice(head.index + 1, end).join("\n");
    const firstLine = split.text;
    const dropFirst = head.raw.marked || isNoise(firstLine) || SYSTEM.some((r) => r.test(firstLine.trim()));
    const body = (dropFirst ? continuation : continuation ? `${firstLine}\n${continuation}` : firstLine)
      .replace(MARKS, "")
      .replace(/<This message was edited>/gi, "")
      .trim();
    if (!body) continue;
    messages.push({ at: when(head.raw, dmy), sender: split.sender, text: body });
  }
  const counts = new Map<string, number>();
  for (const m of messages) counts.set(m.sender, (counts.get(m.sender) ?? 0) + 1);
  const senders = [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((x, y) => y.count - x.count || x.name.localeCompare(y.name));
  return { messages, senders };
}

/** Only the last `limit` messages are read: recent words say most about how someone talks now. */
export function lastMessages(chat: ParsedChat, limit = 5000): ChatMessage[] {
  return chat.messages.slice(-limit);
}

/** The chat text from the bytes of a .txt or a .zip (WhatsApp puts `_chat.txt` or "WhatsApp Chat with ….txt" inside). */
export function chatTextFrom(bytes: Uint8Array): string {
  const zip = bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
  if (!zip) return new TextDecoder("utf-8").decode(bytes);
  let total = 0;
  const files = unzipSync(bytes, {
    // Only text files, and never more than the limit, so a crafted zip can't fill the disk.
    filter: (f) => {
      if (!/\.txt$/i.test(f.name) || f.name.includes("__MACOSX")) return false;
      total += f.originalSize;
      return f.originalSize <= CHAT_TEXT_MAX_BYTES && total <= CHAT_TEXT_MAX_BYTES;
    },
  });
  const names = Object.keys(files);
  const pick =
    names.find((n) => /(^|\/)_chat\.txt$/i.test(n)) ??
    names.sort((a, b) => (files[b]?.length ?? 0) - (files[a]?.length ?? 0))[0];
  if (!pick) throw readError("I couldn't find the chat inside that zip. Export it again from WhatsApp and add the .zip it makes.");
  return new TextDecoder("utf-8").decode(files[pick]);
}
