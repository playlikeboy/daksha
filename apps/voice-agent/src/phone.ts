// Phone calls to and from Daksha (docs/PHONE.md). A phone caller joins the LiveKit room as a
// SIP participant, with no Daksha sign-in. Caller ID can be faked, so it is never enough:
//
//   1. The agent tells Daksha's server which number is calling (POST /api/voice/phone/start).
//      The server answers with a short-lived signed call token and what to ask for.
//   2. A number being linked: the caller says the six-digit code the app shows. The server
//      marks the number verified only if it is the same number that asked for that code.
//   3. A linked number: the caller says their PIN, every call. Only then does the server say
//      whose number it is, and the call goes on with Daksha's brain as that person.
//
// The server counts wrong tries and locks the number for a while after too many. Digits are
// never logged. Every route here needs VOICE_AGENT_SECRET, like the brain route.
import { z } from "zod";

export type PhoneApi = { deboUrl: string; secret: string; fetchImpl?: typeof fetch };

/** Set by Daksha's server when it places a call to the person's own number (outbound only). */
export const PhoneJob = z.object({
  kind: z.literal("daksha-phone"),
  callToken: z.string().min(20).max(2000),
  /** Said after the PIN is right, e.g. "Your reminder: call the bank." */
  opening: z.string().min(1).max(400),
});
export type PhoneJob = z.infer<typeof PhoneJob>;

export function readPhoneJob(metadata: string | undefined): PhoneJob | null {
  if (!metadata) return null;
  try {
    const parsed = PhoneJob.safeParse(JSON.parse(metadata));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export const StartAnswer = z.object({
  callToken: z.string().min(20).max(2000),
  /** "pin": a linked number; "code": a number being linked; "unknown": neither; "no-pin": linked, PIN not set yet. */
  ask: z.enum(["pin", "code", "unknown", "no-pin"]),
});
export type StartAnswer = z.infer<typeof StartAnswer>;

export const CheckAnswer = z.object({
  ok: z.boolean(),
  /** After too many wrong tries the server stops listening for a while. */
  locked: z.boolean().default(false),
  /** Only on a right PIN. */
  userId: z.string().uuid().optional(),
  /** After a right code: whether a PIN is set, so the call can go on to ask for it. */
  pinSet: z.boolean().optional(),
});
export type CheckAnswer = z.infer<typeof CheckAnswer>;

async function post<T>(api: PhoneApi, path: string, body: unknown, schema: z.ZodType<T>): Promise<T | null> {
  try {
    const response = await (api.fetchImpl ?? fetch)(new URL(path, api.deboUrl), {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${api.secret}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return null;
    const parsed = schema.safeParse(await response.json().catch(() => null));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export const phoneApi = {
  /** Inbound: the caller's number from the SIP trunk. */
  start: (api: PhoneApi, callerNumber: string) => post(api, "/api/voice/phone/start", { callerNumber }, StartAnswer),
  code: (api: PhoneApi, callToken: string, code: string) => post(api, "/api/voice/phone/code", { callToken, code }, CheckAnswer),
  pin: (api: PhoneApi, callToken: string, pin: string) => post(api, "/api/voice/phone/pin", { callToken, pin }, CheckAnswer),
  ended: (api: PhoneApi, userId: string) => post(api, "/api/voice/phone/ended", { userId }, z.object({ ok: z.boolean() })),
};

const WORDS: Record<string, string> = {
  zero: "0", oh: "0", one: "1", two: "2", three: "3", four: "4",
  five: "5", six: "6", seven: "7", eight: "8", nine: "9",
  // Hindi, as Deepgram writes it in Latin letters.
  // "do" (two) is left out: it is also an English word.
  shunya: "0", ek: "1", teen: "3", char: "4", chaar: "4", paanch: "5", panch: "5",
  chhe: "6", chhah: "6", saat: "7", aath: "8", nau: "9",
};

/**
 * The digits someone said: "1 2 3 4", "one two three four", "12 34" or "ek do teen char".
 * Other words are skipped. Returns "" when no digit was heard.
 */
export function spokenDigits(text: string): string {
  let out = "";
  for (const token of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (!token) continue;
    if (/^\d+$/.test(token)) out += token;
    else if (WORDS[token]) out += WORDS[token];
  }
  return out;
}

/** The caller's number from a SIP participant's attributes, if it looks like one. */
export function callerNumberOf(attributes: Record<string, string> | undefined): string | null {
  const raw = attributes?.["sip.phoneNumber"]?.trim();
  if (!raw) return null;
  const digits = raw.replace(/[^\d+]/g, "");
  return /^\+?\d{6,15}$/.test(digits) ? digits : null;
}
