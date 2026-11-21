// Secret redaction and skill-text warnings, rewritten in TypeScript from suparagent
// (https://github.com/Anil-matcha/suparagent, Apache-2.0, at f2ae9d0f5cc40e9acca9133be1b7abe9cb9af4fc):
// redact_secrets and its patterns from backend/app/services/agent_memory.py, and the warnings
// from backend/app/services/agent_skills.py. The patterns are the same; Python's (?i) became
// the "i" flag. See third_party/suparagent/SOURCE.md.

export const REDACTION = "[redacted]";

/** Well-known key shapes. Each matches the whole secret. */
const KEY_SHAPES = [
  /\bsk-[A-Za-z0-9_-]{16,}/g, // Anthropic, OpenAI and similar
  /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}/g, // GitHub tokens
  /\bgithub_pat_[A-Za-z0-9_]{20,}/g,
  /\bxox[abposr]-[A-Za-z0-9-]{10,}/g, // Slack
  /\bAKIA[0-9A-Z]{16}\b/g, // AWS access key id
  /\bAIza[0-9A-Za-z_-]{30,}/g, // Google API key
  /\bhf_[A-Za-z0-9]{30,}/g, // Hugging Face
  /\bnpm_[A-Za-z0-9]{20,}/g,
  /\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{16,}/g, // Stripe
  /\bASIA[0-9A-Z]{16}\b/g, // AWS temporary key id
  /\bglpat-[A-Za-z0-9_-]{20,}/g, // GitLab
  /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}/g, // SendGrid
  /\bgsk_[A-Za-z0-9]{30,}/g, // Groq
  /\bxapp-[A-Za-z0-9-]{10,}/g, // Slack app token
  /\b\d{8,10}:[A-Za-z0-9_-]{35}\b/g, // Telegram bot token
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, // JWT
];

/** Shapes where only the value after a label is secret; group 1 is kept. */
const LABELLED = [
  /(\bauthorization\s*[:=]\s*(?:basic|token|digest)\s+)[A-Za-z0-9._~+/-]{8,}=*/gi,
  /(\b(?:x-api-key|api-key|x-auth-token|cookie|set-cookie)\s*:\s*)[^\r\n]{8,}/gi,
  /(\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:)[^\s/@]{3,}(?=@)/g, // user:password@host
  /(\bbearer\s+)[A-Za-z0-9._~+/-]{12,}=*/gi,
  /(\b[A-Za-z0-9_.-]*(?:api[_-]?key|secret|token|passw(?:or)?d|passphrase)[A-Za-z0-9_.-]*\s*[:=]\s*)(?:"[^"\n]{6,}"|'[^'\n]{6,}'|[^\s,;]{6,})/gi,
];

const PRIVATE_KEY = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g;

/** The text with anything that looks like a credential replaced, and how many replacements were made. */
export function redactSecrets(input: string): { text: string; count: number } {
  let count = 0;
  const whole = () => {
    count += 1;
    return REDACTION;
  };
  let text = input.replace(PRIVATE_KEY, whole);
  for (const pattern of KEY_SHAPES) text = text.replace(pattern, whole);
  for (const pattern of LABELLED)
    text = text.replace(pattern, (match: string, kept: string) => {
      if (match.slice(kept.length) === REDACTION) return match; // already redacted
      count += 1;
      return kept + REDACTION;
    });
  return { text, count };
}

const WARNINGS: [RegExp, string][] = [
  [
    /\b(ignore|disregard|forget)\b.{0,30}\b(previous|prior|above|earlier)\b.{0,20}\binstructions?\b/i,
    "It tells the assistant to ignore its earlier instructions.",
  ],
  [
    /\b(skip|bypass|disable|turn off|without)\b.{0,30}\b(approvals?|permissions?|confirmation)\b/i,
    "It mentions skipping approvals. Approvals still apply to every action.",
  ],
  [
    /\b(curl|wget)\b[^\n]*\|\s*(ba|z)?sh\b|\brm\s+-rf\b/i,
    "It contains a shell command that downloads and runs code or deletes files. Skills are text only and are never run.",
  ],
];

export function skillWarnings(text: string): string[] {
  return WARNINGS.filter(([pattern]) => pattern.test(text)).map(([, message]) => message);
}
