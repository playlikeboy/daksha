/**
 * Keeps a long chat small enough for the model, without a model call:
 *   1. old tool results (from earlier turns) over 8,192 characters keep their head and tail;
 *   2. a chat still over its budget drops its oldest turns, cutting only where no tool call is
 *      waiting for its result, and puts a short note in their place.
 * Only what is sent to the model changes. The saved conversation (threads.ts) keeps everything,
 * so the app still shows every message and card.
 *
 * Adapted from deepseek-ai/deepseek-harness, commit 2e39e70496aa02986ca6a820c5d497e816b69d7e,
 * MIT licence (Copyright (c) 2026 DeepSeek; see third_party/deepseek-harness/):
 *   packages/compaction/compaction-tool-result-pruner/src/{config,index}.ts (budgets, marker,
 *     code-point head/tail pruning),
 *   packages/compaction/compaction/src/tool-pairing.ts (balanced cuts),
 *   packages/compaction/compaction-basic/src/config.ts (threshold and retain ratios).
 * Changed for Daksha: it works on the message list of one request instead of a session log;
 * there is no token meter (characters stand in for tokens); and the dropped turns get a fixed
 * note listing the person's own first words instead of a model-written summary, because only
 * @debo/llm may call a model and a summary call on every long chat costs money and time.
 */
import type { ModelMessage } from "@tanstack/ai";

/** Fixed marker substituted for every removed middle span, as upstream. */
export const PRUNE_MARKER = "\n\n[... tool result middle pruned ...]\n\n";

export interface PruneConfig {
  thresholdChars: number;
  headChars: number;
  tailChars: number;
}
/** Upstream defaults. */
export const PRUNE_DEFAULTS: PruneConfig = Object.freeze({ thresholdChars: 8192, headChars: 4096, tailChars: 1024 });

/** Count Unicode code points without splitting surrogate pairs. */
export function codePointLength(text: string): number {
  return Array.from(text).length;
}

/** Validate pruning budgets: head + marker + tail must fit under the threshold. */
export function resolvePruneConfig(config: Partial<PruneConfig> = {}): PruneConfig {
  const resolved = { ...PRUNE_DEFAULTS, ...config };
  if (!Number.isInteger(resolved.thresholdChars) || resolved.thresholdChars <= 0)
    throw new Error(`thresholdChars (${resolved.thresholdChars}) must be a positive integer`);
  for (const key of ["headChars", "tailChars"] as const)
    if (!Number.isInteger(resolved[key]) || resolved[key] < 0) throw new Error(`${key} (${resolved[key]}) must be a non-negative integer`);
  const emitted = resolved.headChars + codePointLength(PRUNE_MARKER) + resolved.tailChars;
  if (emitted > resolved.thresholdChars)
    throw new Error(`headChars + marker + tailChars (${emitted}) must be at most thresholdChars (${resolved.thresholdChars})`);
  return resolved;
}

/**
 * Replace an over-budget middle with the marker, slicing by code point so a surrogate pair is
 * never split. Null when the text is within budget.
 */
export function pruneText(text: string, config: PruneConfig = PRUNE_DEFAULTS): string | null {
  const points = Array.from(text);
  if (points.length <= config.thresholdChars) return null;
  return points.slice(0, config.headChars).join("") + PRUNE_MARKER + points.slice(points.length - config.tailChars).join("");
}

/** How one message changes the number of tool calls still waiting for a result. */
function delta(message: ModelMessage): number {
  if (message.role === "assistant") return message.toolCalls?.length ?? 0;
  if (message.role === "tool") return -1;
  return 0;
}

/**
 * For each cut (before message i, and after the last), whether no tool call crosses it.
 * A tool result with no open call leaves later cuts unbalanced rather than throwing.
 */
export function balancedCuts(messages: readonly ModelMessage[]): boolean[] {
  const cuts = [true];
  let open = 0;
  let broken = false;
  for (const message of messages) {
    open += delta(message);
    if (open < 0) broken = true;
    cuts.push(!broken && open === 0);
  }
  return cuts;
}

const textOf = (message: ModelMessage) =>
  typeof message.content === "string"
    ? message.content
    : Array.isArray(message.content)
      ? message.content.map((part) => ("content" in part && typeof part.content === "string" ? part.content : "")).join("")
      : "";
const sizeOf = (message: ModelMessage) =>
  codePointLength(textOf(message)) + (message.toolCalls?.reduce((n, call) => n + call.function.arguments.length, 0) ?? 0);

/** Prune tool results before the latest user message. The current turn's results stay whole. */
export function pruneOldToolResults(messages: readonly ModelMessage[], config: PruneConfig = PRUNE_DEFAULTS) {
  const lastUser = messages.findLastIndex((message) => message.role === "user");
  let charsRemoved = 0;
  const out = messages.map((message, index) => {
    if (index >= lastUser || message.role !== "tool" || typeof message.content !== "string") return message;
    const pruned = pruneText(message.content, config);
    if (pruned === null) return message;
    charsRemoved += codePointLength(message.content) - codePointLength(pruned);
    return { ...message, content: pruned };
  });
  return { messages: out, charsRemoved };
}

export interface CompactConfig {
  /** Chat size, in characters, the model may be sent. About four characters make a token. */
  budgetChars: number;
  /** Compact once the chat passes this share of the budget (upstream default 0.8). */
  thresholdRatio: number;
  /** Keep at least this share of the budget as the latest turns, word for word (upstream 0.16). */
  retainRatio: number;
}
export const COMPACT_DEFAULTS: CompactConfig = Object.freeze({ budgetChars: 200_000, thresholdRatio: 0.8, retainRatio: 0.16 });

/** The note that stands in for the dropped turns. Built from the person's own words only. */
export function droppedNote(dropped: readonly ModelMessage[]): ModelMessage {
  const asked = dropped
    .filter((message) => message.role === "user")
    .map((message) => textOf(message).replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .map((text) => (codePointLength(text) > 120 ? `${Array.from(text).slice(0, 117).join("")}...` : text));
  const shown = asked.slice(-12);
  return {
    role: "user",
    content:
      `[Note from Daksha, not from the person: ${dropped.length} earlier messages of this chat were left out to keep it short. ` +
      `The person can still see them in the app. If they refer to something you no longer have, ask them or look it up again.` +
      (shown.length ? ` What they asked then, oldest first:\n${shown.map((text) => `- ${text}`).join("\n")}` : "") +
      "]",
  };
}

/**
 * Prune old tool results, then, if the chat is still over the threshold, drop the oldest turns.
 * The cut is the latest balanced point before a user message that still leaves at least the
 * retained share; the kept part always starts with a user message.
 */
export function compactMessages(
  messages: readonly ModelMessage[],
  options: { prune?: PruneConfig; compact?: CompactConfig } = {},
): { messages: ModelMessage[]; pruned: number; dropped: number } {
  const compact = options.compact ?? COMPACT_DEFAULTS;
  const { messages: prunedMessages, charsRemoved } = pruneOldToolResults(messages, options.prune ?? PRUNE_DEFAULTS);
  const sizes = prunedMessages.map(sizeOf);
  const total = sizes.reduce((a, b) => a + b, 0);
  if (total <= compact.budgetChars * compact.thresholdRatio) return { messages: prunedMessages, pruned: charsRemoved, dropped: 0 };
  const retain = compact.budgetChars * compact.retainRatio;
  const cuts = balancedCuts(prunedMessages);
  let tail = 0;
  let cut = -1;
  for (let i = prunedMessages.length - 1; i > 0; i--) {
    tail += sizes[i] ?? 0;
    if (prunedMessages[i]?.role === "user" && cuts[i]) {
      cut = i;
      if (tail >= retain) break;
    }
  }
  if (cut <= 0) return { messages: prunedMessages, pruned: charsRemoved, dropped: 0 };
  const dropped = prunedMessages.slice(0, cut);
  const [first, ...rest] = prunedMessages.slice(cut);
  const note = droppedNote(dropped);
  // The note joins the first kept user message, so two user messages never sit side by side.
  const joined: ModelMessage =
    first && typeof first.content === "string"
      ? { ...first, content: `${note.content}\n\n${first.content}` }
      : first && Array.isArray(first.content)
        ? { ...first, content: [{ type: "text", content: `${note.content}\n\n` }, ...first.content] }
        : note;
  return {
    messages: first && joined !== note ? [joined, ...rest] : [note, ...(first ? [first] : []), ...rest],
    pruned: charsRemoved,
    dropped: dropped.length,
  };
}
