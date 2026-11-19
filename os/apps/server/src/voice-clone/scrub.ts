// Taking private details out of spoken lines before they are kept: phone
// numbers, email addresses, one-time codes, card and account numbers, and
// street addresses. A line is kept for how the person talks, never for these.
//
// MERGE NOTE: Workstream A (custom-people) has its own scrubber for chat
// exports. When both are merged, keep one and import it from both places.

const RULES: { pattern: RegExp; label: string }[] = [
  // Email addresses.
  { pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, label: "[email]" },
  // Web links can carry names, codes and addresses.
  { pattern: /\bhttps?:\/\/\S+/gi, label: "[link]" },
  // Card numbers: 13 to 19 digits, maybe in groups.
  { pattern: /\b(?:\d[ -]?){12,18}\d\b/g, label: "[number]" },
  // One-time codes and PINs said as a code: "OTP is 482913", "code 4829", "pin: 1234".
  { pattern: /\b(otp|code|pin|password|passcode)\b(\s*(is|:|-))?\s*[A-Za-z0-9]{3,10}\b/gi, label: "$1 [code]" },
  // Phone numbers: an optional +country code, then at least 8 digits with spaces, dashes or brackets.
  { pattern: /(?:\+\d{1,3}[\s-]?)?(?:\(?\d{2,5}\)?[\s-]?){2,4}\d{2,5}/g, label: "[phone]" },
  // Any other run of 4 to 11 digits: account numbers, codes said on their own. Years such as 1998 stay.
  { pattern: /\b(?!(?:19|20)\d{2}\b)\d{4,11}\b/g, label: "[number]" },
  // Street addresses: a house number then a street word.
  {
    pattern:
      /\b\d{1,5}[A-Za-z]?,?\s+(?:[A-Za-z]+\s){0,4}(street|st|road|rd|lane|ln|avenue|ave|marg|nagar|colony|sector|block|flat|apartment|apt)\b\.?/gi,
    label: "[address]",
  },
  // Indian postal codes after a city name or on their own.
  { pattern: /\b\d{3}\s?\d{3}\b/g, label: "[number]" },
];

/** The line with private details replaced by a plain label such as "[phone]". */
export function scrubLine(text: string): string {
  let out = text;
  for (const rule of RULES) out = out.replace(rule.pattern, rule.label);
  return out.replace(/\s+/g, " ").trim();
}

/** True when nothing but labels and punctuation is left: not worth keeping. */
export function isEmptyAfterScrub(text: string): boolean {
  return text.replace(/\[(email|link|number|phone|code|address)\]/g, "").replace(/[\s\p{P}]/gu, "") === "";
}
