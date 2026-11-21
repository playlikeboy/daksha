// Phone calls are off unless the LiveKit SIP trunks are set (docs/PHONE.md). Read on each
// request, like the voice settings, so the rest of Daksha runs without them.
import { readVoiceConfig, type VoiceConfig } from "../voice/config.ts";

type Env = Record<string, string | undefined>;

export interface PhoneConfig {
  voice: VoiceConfig;
  /** Calls to Daksha: the inbound trunk's id. Its dispatch rule sends the "debo-voice" agent. */
  inboundTrunkId?: string;
  /** Calls from Daksha to the person's own number. */
  outboundTrunkId?: string;
  /** The number people call, shown in the app. */
  callNumber?: string;
  /** Country codes Daksha may call, e.g. ["+1", "+91"]. Anything else is refused (toll fraud). */
  allowedPrefixes: string[];
}

export const PHONE_NOT_SET_UP = "Phone calls aren't set up yet.";

export function readPhoneConfig(env: Env = process.env): PhoneConfig | undefined {
  const voice = readVoiceConfig(env);
  if (!voice) return undefined;
  const inboundTrunkId = env.LIVEKIT_SIP_TRUNK_ID?.trim() || undefined;
  const outboundTrunkId = env.LIVEKIT_SIP_OUTBOUND_TRUNK_ID?.trim() || undefined;
  if (!inboundTrunkId && !outboundTrunkId) return undefined;
  const callNumber = normalizeNumber(env.LIVEKIT_SIP_PHONE_NUMBER ?? "") ?? undefined;
  const allowedPrefixes = (env.PHONE_ALLOWED_COUNTRY_CODES ?? "+1")
    .split(",")
    .map((code) => code.trim().replace(/^(?=\d)/, "+"))
    .filter((code) => /^\+\d{1,3}$/.test(code));
  return { voice, inboundTrunkId, outboundTrunkId, callNumber, allowedPrefixes };
}

/** A phone number as +<country><number> (E.164), or null when it cannot be one. */
export function normalizeNumber(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("+")) return null;
  const digits = trimmed.slice(1).replace(/[\s().-]/g, "");
  return /^[1-9]\d{6,14}$/.test(digits) ? `+${digits}` : null;
}
