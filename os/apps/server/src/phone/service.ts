// Phone calls to and from Daksha (docs/PHONE.md, decision 39).
//
// A person links their own number in the app, and proves it is theirs by calling Daksha from
// it and saying the six-digit code the app shows (there is no SMS provider). Caller ID can be
// faked, so every call also needs the person's spoken PIN before Daksha says anything
// personal. Daksha only ever calls the person's own linked number, only when they asked for
// it, and only a few times an hour, so nobody can use it to run up a phone bill.
//
// One record per person: kind "phone", id "settings". The PIN is kept as a scrypt hash.
import { createHmac, randomBytes, randomInt, scryptSync, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { Store } from "../db.ts";
import { AppError } from "../errors.ts";
import { normalizeNumber, PHONE_NOT_SET_UP, type PhoneConfig } from "./config.ts";

const KIND = "phone";
const ID = "settings";
const CODE_MINUTES = 15;
const CODE_TRIES = 5;
const PIN_TRIES = 5;
const LOCK_MINUTES = 30;
const TOKEN_MINUTES = 10;
/** Calls Daksha may place to one person. */
export const CALLS_PER_HOUR = 3;
export const CALLS_PER_DAY = 6;
/** Calls Daksha may place to everyone together, per server, per hour. */
export const ALL_CALLS_PER_HOUR = 60;

export interface PhoneRow {
  id: typeof ID;
  number?: string;
  verified: boolean;
  verifiedAt?: string;
  pin?: { salt: string; hash: string };
  reminderCalls: boolean;
  pending?: { number: string; code: string; expiresAt: string; tries: number };
  pinFails: number;
  lockedUntil?: string;
  /** When Daksha called this person, for the limits above. Kept for one day. */
  calls: string[];
  updatedAt: string;
}

export interface PhoneStatus {
  setUp: { inbound: boolean; outbound: boolean };
  /** The number to call Daksha on, when there is one. */
  callNumber?: string;
  number?: string;
  verified: boolean;
  pinSet: boolean;
  reminderCalls: boolean;
  /** While a number is being linked: the code to say, and until when it works. */
  pending?: { number: string; code: string; expiresAt: string };
  locked: boolean;
}

/** Places one call: LiveKit in production (dialer.ts), a fake in tests. */
export interface Dialer {
  call(input: { number: string; metadata: string }): Promise<void>;
}

export const numberInput = z.object({ number: z.string().trim().min(7).max(24) });
export const pinInput = z.object({ pin: z.string().regex(/^\d{4,8}$/, "A PIN is 4 to 8 digits.") });
export const settingsInput = z.object({ reminderCalls: z.boolean() });
const tokenBody = z.object({ n: z.string(), o: z.string().optional(), exp: z.number() });

const fresh = (): PhoneRow => ({ id: ID, verified: false, reminderCalls: false, pinFails: 0, calls: [], updatedAt: new Date().toISOString() });
const hashPin = (pin: string, salt: string) => scryptSync(pin, Buffer.from(salt, "base64"), 32).toString("base64");
const same = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export class PhoneService {
  #recentCalls: number[] = [];

  constructor(
    private readonly db: Store,
    private readonly deps: {
      config: () => PhoneConfig | undefined;
      /** Signs call tokens. A key made for this one job (auth.purposeKey). */
      tokenKey: string;
      dialer?: (config: PhoneConfig) => Dialer;
      /** The call ended: read it once, like an app call (decision 27). */
      ended?: (owner: string) => void;
      now?: () => Date;
    },
  ) {}

  private now() {
    return this.deps.now?.() ?? new Date();
  }

  private async row(owner: string): Promise<PhoneRow> {
    return (await this.db.get<PhoneRow>(owner, KIND, ID)) ?? fresh();
  }

  private save(owner: string, row: PhoneRow) {
    return this.db.put(owner, KIND, { ...row, updatedAt: this.now().toISOString() });
  }

  private locked(row: PhoneRow) {
    return Boolean(row.lockedUntil && Date.parse(row.lockedUntil) > this.now().getTime());
  }

  async status(owner: string): Promise<PhoneStatus> {
    const config = this.deps.config();
    const row = await this.row(owner);
    const pending = row.pending && Date.parse(row.pending.expiresAt) > this.now().getTime() ? row.pending : undefined;
    return {
      setUp: { inbound: Boolean(config?.inboundTrunkId), outbound: Boolean(config?.outboundTrunkId) },
      ...(config?.callNumber ? { callNumber: config.callNumber } : {}),
      ...(row.number ? { number: row.number } : {}),
      verified: row.verified,
      pinSet: Boolean(row.pin),
      reminderCalls: row.reminderCalls,
      ...(pending ? { pending: { number: pending.number, code: pending.code, expiresAt: pending.expiresAt } } : {}),
      locked: this.locked(row),
    };
  }

  /** Start linking a number. The person then calls Daksha from it and says the code. */
  async addNumber(owner: string, raw: unknown) {
    const config = this.deps.config();
    if (!config?.inboundTrunkId) throw new AppError(PHONE_NOT_SET_UP, 503);
    const number = normalizeNumber(numberInput.parse(raw).number);
    if (!number) throw new AppError("Type the number with its country code, like +1 415 555 0100.", 422);
    if (!config.allowedPrefixes.some((prefix) => number.startsWith(prefix)))
      throw new AppError("Daksha can't take calls from numbers in that country yet.", 422);
    // Another person's linked number cannot be linked again.
    for (const { owner: other, value } of await this.db.scan<PhoneRow>(KIND))
      if (other !== owner && value.verified && value.number === number)
        throw new AppError("That number is linked to another Daksha account.", 409);
    const row = await this.row(owner);
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const expiresAt = new Date(this.now().getTime() + CODE_MINUTES * 60_000).toISOString();
    await this.save(owner, { ...row, pending: { number, code, expiresAt, tries: 0 } });
    return this.status(owner);
  }

  async setPin(owner: string, raw: unknown) {
    const { pin } = pinInput.parse(raw);
    if (/^(\d)\1+$/.test(pin) || "0123456789".includes(pin) || "9876543210".includes(pin))
      throw new AppError("Pick a PIN that's harder to guess than repeated or counting digits.", 422);
    const salt = randomBytes(16).toString("base64");
    const row = await this.row(owner);
    await this.save(owner, { ...row, pin: { salt, hash: hashPin(pin, salt) }, pinFails: 0, lockedUntil: undefined });
    return this.status(owner);
  }

  async setSettings(owner: string, raw: unknown) {
    const { reminderCalls } = settingsInput.parse(raw);
    const row = await this.row(owner);
    if (reminderCalls && !row.verified) throw new AppError("Link your number first.", 409);
    await this.save(owner, { ...row, reminderCalls });
    return this.status(owner);
  }

  /** Forget the number, the PIN and every setting. */
  async remove(owner: string) {
    await this.db.remove(owner, KIND, ID);
    return this.status(owner);
  }

  // ---- The voice agent's side (VOICE_AGENT_SECRET) -------------------------------------

  private sign(body: z.infer<typeof tokenBody>) {
    const data = Buffer.from(JSON.stringify(body)).toString("base64url");
    return `${data}.${createHmac("sha256", this.deps.tokenKey).update(data).digest("base64url")}`;
  }

  private verify(token: string) {
    const [data, mac] = token.split(".");
    if (!data || !mac || !same(mac, createHmac("sha256", this.deps.tokenKey).update(data).digest("base64url"))) return null;
    let body: unknown;
    try {
      body = JSON.parse(Buffer.from(data, "base64url").toString());
    } catch {
      return null;
    }
    const parsed = tokenBody.safeParse(body);
    return parsed.success && parsed.data.exp > this.now().getTime() ? parsed.data : null;
  }

  private async ownerOf(number: string, pending = false) {
    for (const { owner, value } of await this.db.scan<PhoneRow>(KIND)) {
      if (pending ? value.pending?.number === number && Date.parse(value.pending.expiresAt) > this.now().getTime() : value.verified && value.number === number)
        return { owner, row: value };
    }
    return null;
  }

  /** A call came in from this number. Says what to ask for; never who it is. */
  async start(callerNumber: string) {
    if (!this.deps.config()?.inboundTrunkId) throw new AppError(PHONE_NOT_SET_UP, 503);
    const number = normalizeNumber(callerNumber);
    const callToken = this.sign({ n: number ?? "unknown", exp: this.now().getTime() + TOKEN_MINUTES * 60_000 });
    if (!number) return { callToken, ask: "unknown" as const };
    if (await this.ownerOf(number, true)) return { callToken, ask: "code" as const };
    const linked = await this.ownerOf(number);
    if (!linked) return { callToken, ask: "unknown" as const };
    return { callToken, ask: linked.row.pin ? ("pin" as const) : ("no-pin" as const) };
  }

  /** The caller said the code from the app. Only the number that asked for it is linked. */
  async checkCode(callToken: string, code: string) {
    const token = this.verify(callToken);
    if (!token) return { ok: false, locked: true };
    const found = await this.ownerOf(token.n, true);
    if (!found?.row.pending) return { ok: false, locked: true };
    const { owner, row } = found;
    const pending = row.pending!;
    if (same(code, pending.code)) {
      await this.save(owner, { ...row, number: pending.number, verified: true, verifiedAt: this.now().toISOString(), pending: undefined, reminderCalls: row.number === pending.number ? row.reminderCalls : false });
      return { ok: true, locked: false, pinSet: Boolean(row.pin) };
    }
    const tries = pending.tries + 1;
    await this.save(owner, { ...row, pending: tries >= CODE_TRIES ? undefined : { ...pending, tries } });
    return { ok: false, locked: tries >= CODE_TRIES };
  }

  /** The caller said their PIN. Only a right PIN says whose number this is. */
  async checkPin(callToken: string, pin: string) {
    const token = this.verify(callToken);
    if (!token) return { ok: false, locked: true };
    const found = token.o
      ? { owner: token.o, row: await this.row(token.o) }
      : await this.ownerOf(token.n);
    if (!found || !found.row.verified || found.row.number !== token.n || !found.row.pin) return { ok: false, locked: true };
    const { owner, row } = found;
    if (this.locked(row)) return { ok: false, locked: true };
    if (/^\d{4,8}$/.test(pin) && same(hashPin(pin, row.pin!.salt), row.pin!.hash)) {
      await this.save(owner, { ...row, pinFails: 0, lockedUntil: undefined });
      return { ok: true, locked: false, userId: owner };
    }
    const fails = row.pinFails + 1;
    const lock = fails >= PIN_TRIES;
    await this.save(owner, {
      ...row,
      pinFails: lock ? 0 : fails,
      lockedUntil: lock ? new Date(this.now().getTime() + LOCK_MINUTES * 60_000).toISOString() : row.lockedUntil,
    });
    return { ok: false, locked: lock };
  }

  ended(owner: string) {
    this.deps.ended?.(owner);
  }

  // ---- Calls from Daksha ---------------------------------------------------------------

  /**
   * Call the person's own linked number. `why` is "test" (they pressed "Call me now"),
   * or "reminder" (only when they turned reminder calls on). Never another number.
   */
  async callMe(owner: string, why: "test" | "reminder", opening: string) {
    const config = this.deps.config();
    if (!config?.outboundTrunkId || !this.deps.dialer) throw new AppError(PHONE_NOT_SET_UP, 503);
    const row = await this.row(owner);
    if (!row.verified || !row.number) throw new AppError("Link your number first.", 409);
    if (!row.pin) throw new AppError("Set a PIN first: every call asks for it.", 409);
    if (why === "reminder" && !row.reminderCalls) throw new AppError("Reminder calls are off.", 409);
    if (!config.allowedPrefixes.some((prefix) => row.number!.startsWith(prefix)))
      throw new AppError("Daksha can't call numbers in that country.", 422);
    const now = this.now().getTime();
    const calls = row.calls.filter((at) => now - Date.parse(at) < 24 * 3_600_000);
    if (calls.filter((at) => now - Date.parse(at) < 3_600_000).length >= CALLS_PER_HOUR || calls.length >= CALLS_PER_DAY)
      throw new AppError("That's a lot of calls today. Try again later.", 429);
    this.#recentCalls = this.#recentCalls.filter((at) => now - at < 3_600_000);
    if (this.#recentCalls.length >= ALL_CALLS_PER_HOUR) throw new AppError("Daksha is making too many calls right now. Try again later.", 429);
    // Counted before dialing, so a failed or repeated request still counts.
    this.#recentCalls.push(now);
    await this.save(owner, { ...row, calls: [...calls, new Date(now).toISOString()] });
    const callToken = this.sign({ n: row.number, o: owner, exp: now + TOKEN_MINUTES * 60_000 });
    const metadata = JSON.stringify({ kind: "daksha-phone", callToken, opening: opening.slice(0, 400) });
    await this.deps.dialer(config).call({ number: row.number, metadata });
    return { ok: true };
  }

  /** From the reminders loop: a call as well as the usual update, when the person asked for it. */
  async reminderCall(owner: string, title: string) {
    const config = this.deps.config();
    if (!config?.outboundTrunkId) return false;
    const row = await this.row(owner);
    if (!row.reminderCalls || !row.verified || !row.pin) return false;
    const clean = title.replace(/[\p{C}<>{}]/gu, "").trim().slice(0, 200);
    await this.callMe(owner, "reminder", `Your reminder: ${clean}.`);
    return true;
  }
}
