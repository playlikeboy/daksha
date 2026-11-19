// Taking private details out of chat text, and out of lines said in voice notes and calls,
// before any model reads them or they are kept. A chat export or a call holds other people's
// phone numbers, addresses, one-time codes and bank details: none of that helps Debo learn how
// someone talks, so it is replaced with a plain tag first. One scrubber for every source.
//
// This is a careful filter, not a promise: it removes the common shapes (Indian and international
// phone numbers, emails, links, codes near words like "OTP", card and account numbers, IFSC and UPI
// ids, PIN codes and street addresses). The privacy page says so in the same words.

/** Only runs of at least eight digits are phone numbers; "12-2023" is a date. */
const phone = (match: string) => ((match.match(/\d/g)?.length ?? 0) >= 8 ? "[phone]" : match);

const RULES: [RegExp, string | ((match: string) => string)][] = [
  // Links first: they can hold emails and long numbers.
  [/\b(?:https?:\/\/|www\.)\S+/gi, "[link]"],
  // Emails, and UPI ids (name@bank).
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]"],
  [/\b[A-Za-z0-9._-]{2,}@(?:ok)?[a-z]{3,12}\b/g, "[payment id]"],
  // IFSC codes (bank branch): four letters, a zero, six letters or digits.
  [/\b[A-Z]{4}0[A-Z0-9]{6}\b/g, "[bank code]"],
  // A code the message calls a code: "OTP is 482913", "code: 4829", "PIN 1234".
  [
    /\b(otp|one[- ]time (?:password|code)|verification code|security code|passcode|password|pin|code|cvv)\b([^0-9\n]{0,20})\d{3,8}\b/gi,
    "$1$2[code]",
  ],
  // Card and account numbers: 9 to 19 digits, maybe in groups.
  [/\b\d(?:[ -]?\d){8,18}\b/g, "[number]"],
  // Phone numbers: +91 98765 43210, (020) 1234 5678, 98765-43210.
  [/(?:\+\d{1,3}[\s-]?)?(?:\(\d{2,5}\)[\s-]?)?\d{2,5}[\s-]\d{3,5}(?:[\s-]\d{2,5})?\b/g, phone],
  // A lone six-digit number is most often a code or an Indian PIN code.
  [/\b\d{6}\b/g, "[code]"],
];

/**
 * Last, after addresses: any other run of 4 to 11 digits, such as account numbers and codes
 * said on their own. Years such as 1998 or 2023 stay.
 */
const LEFTOVER_DIGITS = /\b(?!(?:19|20)\d{2}\b)\d{4,11}\b/g;

// Street words in English and in common Indian addresses.
const STREET =
  /\b(?:flat|house|h\.?\s?no|apt|apartment|block|plot|sector|floor|tower|wing|road|rd|street|st|lane|marg|nagar|colony|layout|cross|main|avenue|ave|enclave|society|chs|phase|near|opp(?:osite)?)\b/i;

/** "Flat 4B, 12 MG Road, Indiranagar" and the like: a number next to street words. */
function looksLikeAddress(segment: string): boolean {
  const words = segment.match(new RegExp(STREET.source, "gi"))?.length ?? 0;
  return /\d/.test(segment) && words >= 1 && (words >= 2 || /\b\d+[A-Za-z]?\s*,/.test(segment) || /,\s*\w+.*,/.test(segment));
}

/** Replace private details with tags. Safe on any text; never throws. */
export function scrub(text: string): string {
  let out = text;
  for (const [pattern, tag] of RULES) out = typeof tag === "string" ? out.replace(pattern, tag) : out.replace(pattern, tag);
  // Addresses: judged per line, so one address does not take the whole message with it.
  return out
    .split("\n")
    .map((line) => (looksLikeAddress(line) ? "[address]" : line))
    .join("\n")
    .replace(LEFTOVER_DIGITS, "[number]");
}

/** Every tag `scrub` puts in. */
export const SCRUB_TAG = /\[(?:phone|email|code|number|address|link|payment id|bank code)\]/g;

/** One spoken line, scrubbed, on one line with single spaces. */
export function scrubLine(text: string): string {
  return scrub(text).replace(/\s+/g, " ").trim();
}

/** True when nothing but tags and punctuation is left: not worth keeping. */
export function isEmptyAfterScrub(text: string): boolean {
  return text.replace(SCRUB_TAG, "").replace(/[\s\p{P}]/gu, "") === "";
}
