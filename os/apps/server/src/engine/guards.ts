/**
 * Guards around every tool call in a model run: a reminder when the model repeats the exact same
 * call, and a time limit per tool.
 *
 * Adapted from deepseek-ai/deepseek-harness, packages/guard/repeat-tool-reminder/src/index.ts and
 * packages/guard/timeout-policy/src/index.ts, commit 2e39e70496aa02986ca6a820c5d497e816b69d7e,
 * MIT licence (Copyright (c) 2026 DeepSeek; see third_party/deepseek-harness/). Changed for
 * Daksha: no Cordis plugin or session; one guard object per run (a new user message starts a new
 * run, which is the upstream reset); the reminder rides on the tool result instead of an extra
 * user message; Daksha's tools do not take a per-call signal, so a timed-out call is left to
 * finish on its own and the model is told not to repeat it blindly.
 */

/** Consecutive-repeat counts that trigger a reminder, as upstream. */
export const DEFAULT_THRESHOLDS = [3, 5, 8] as const;
export const DEFAULT_ARGUMENTS_PREVIEW_CHARS = 500;

const GENTLE_REMINDER =
  "You are repeating the exact same tool call with identical arguments. " +
  "Carefully analyze the previous result before calling again: if the task is " +
  "not complete, try a different approach or different arguments instead of " +
  "repeating the call.";

/** The detailed later-threshold reminder naming the tool, the run length, and the arguments. */
function detailedReminder(toolName: string, count: number, canonicalArguments: string): string {
  return (
    "Repeated tool call detected:\n" +
    `- tool: ${toolName}\n` +
    `- consecutive_calls: ${count}\n` +
    `- arguments: ${canonicalArguments}\n` +
    "The repeated calls are not making progress. Do not call this tool with " +
    "these exact arguments again. Inspect the latest result and choose a " +
    "different action, different arguments, or finish the task if enough " +
    "evidence has been gathered."
  );
}

/** Deep key-sort of a parsed-JSON value so property order does not matter. */
function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) sorted[key] = sortJsonValue(record[key]);
    return sorted;
  }
  return value;
}

/** Canonical string form of a call's arguments: deep key-sort, then stringify. */
export function canonicalize(argumentsValue: unknown): string {
  return JSON.stringify(sortJsonValue(argumentsValue ?? {})) ?? "null";
}

/** Compile one `*`-wildcard pattern to an anchored RegExp. */
function wildcardToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[|\\{}()[\]^$+?.]/g, String.raw`\$&`);
  return new RegExp(`^${escaped.replaceAll("*", ".*")}$`);
}

function previewArguments(canonical: string, cap: number): string {
  if (canonical.length <= cap) return canonical;
  return `${canonical.slice(0, cap)}… (+${canonical.length - cap} more chars)`;
}

function validateThresholds(values: readonly number[]): number[] {
  if (values.length === 0) throw new Error("repeat-tool-reminder: `thresholds` must not be empty");
  for (const value of values)
    if (!Number.isInteger(value) || value < 2)
      throw new Error(`repeat-tool-reminder: invalid threshold ${value} — every threshold must be an integer >= 2`);
  if (new Set(values).size !== values.length) throw new Error("repeat-tool-reminder: `thresholds` must not contain duplicates");
  return [...values].sort((a, b) => a - b);
}

export interface RepeatGuardConfig {
  thresholds?: readonly number[];
  /** Tool-name patterns to track; empty means every tool. */
  include?: readonly string[];
  /** Tool-name patterns that neither count nor reset the chain. */
  exclude?: readonly string[];
  argumentsPreviewChars?: number;
}

/** One run's consecutive-repeat chain. Advisory: it never blocks a call. */
export class RepeatToolGuard {
  private readonly thresholds: number[];
  private readonly thresholdSet: Set<number>;
  private readonly include: RegExp[];
  private readonly exclude: RegExp[];
  private readonly previewChars: number;
  private chain: { key: string; count: number } | undefined;

  constructor(config: RepeatGuardConfig = {}) {
    this.thresholds = validateThresholds(config.thresholds ?? DEFAULT_THRESHOLDS);
    this.thresholdSet = new Set(this.thresholds);
    this.include = (config.include ?? []).map(wildcardToRegExp);
    this.exclude = (config.exclude ?? []).map(wildcardToRegExp);
    this.previewChars = config.argumentsPreviewChars ?? DEFAULT_ARGUMENTS_PREVIEW_CHARS;
    if (!Number.isInteger(this.previewChars) || this.previewChars < 1)
      throw new Error(`repeat-tool-reminder: invalid argumentsPreviewChars ${this.previewChars} — must be an integer >= 1`);
  }

  private tracked(toolName: string): boolean {
    if (this.include.length > 0 && !this.include.some((pattern) => pattern.test(toolName))) return false;
    return !this.exclude.some((pattern) => pattern.test(toolName));
  }

  /** Count one call. Returns the reminder at a threshold, otherwise undefined. */
  observe(toolName: string, args: unknown): string | undefined {
    if (!this.tracked(toolName)) return undefined;
    const canonical = canonicalize(args);
    const key = JSON.stringify([toolName, canonical]);
    const count = this.chain !== undefined && this.chain.key === key ? this.chain.count + 1 : 1;
    this.chain = { key, count };
    if (!this.thresholdSet.has(count)) return undefined;
    return count === this.thresholds[0]
      ? GENTLE_REMINDER
      : detailedReminder(toolName, count, previewArguments(canonical, this.previewChars));
  }

  /** A user message changes the context; repetition across it is not a loop. */
  reset(): void {
    this.chain = undefined;
  }
}

/** The code on a timed-out result, as upstream. */
export const TOOL_TIMEOUT = "TOOL_TIMEOUT";

/** Time limits per tool, in milliseconds. A tool not listed gets the default; `null` means none. */
export const TOOL_TIMEOUTS: Readonly<Record<string, number | null>> = {
  // The computer has its own limits (30 second commands) and its start can take minutes.
  "computer_*": null,
  "*_computer*": null,
  use_desktop: null,
  // Reading a page or making a picture can be slow; a search should not be.
  browse_web: 90_000,
  make_image: 90_000,
  search_web: 30_000,
  get_news: 30_000,
  load_skill: 15_000,
  read_tool_result: 15_000,
};
export const DEFAULT_TOOL_TIMEOUT_MS = 120_000;

/** The time limit for one tool, or undefined for none. */
export function timeoutFor(
  toolName: string,
  table: Readonly<Record<string, number | null>> = TOOL_TIMEOUTS,
  fallback = DEFAULT_TOOL_TIMEOUT_MS,
): number | undefined {
  if (Object.hasOwn(table, toolName)) return table[toolName] ?? undefined;
  for (const [pattern, ms] of Object.entries(table))
    if (pattern.includes("*") && wildcardToRegExp(pattern).test(toolName)) return ms ?? undefined;
  return fallback;
}

/** The result the model sees when a tool ran out of time. */
export function toolTimeoutResult(toolName: string, timeoutMs: number) {
  const seconds = Math.round(timeoutMs / 1000);
  return {
    error: `${toolName} took longer than ${seconds} seconds, so I stopped waiting for it.`,
    code: TOOL_TIMEOUT,
    note: "It may still finish in the background. Do not repeat it straight away: check its result or status first, or tell the person it timed out.",
  };
}

/**
 * Run a tool with a time limit. Daksha's tools do not take a per-call signal, so on expiry the
 * call is left to settle on its own (its late error is swallowed) and a timeout result is
 * returned instead.
 */
export async function withTimeout<T>(
  toolName: string,
  run: () => Promise<T>,
  timeoutMs: number | undefined,
): Promise<T | ReturnType<typeof toolTimeoutResult>> {
  if (timeoutMs === undefined) return run();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const call = run();
  const expired = new Promise<"expired">((resolve) => {
    timer = setTimeout(() => resolve("expired"), timeoutMs);
  });
  try {
    const winner = await Promise.race([call, expired]);
    if (winner === "expired") {
      call.catch(() => undefined);
      return toolTimeoutResult(toolName, timeoutMs);
    }
    return winner as T;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Put a guard notice on a tool result without changing what the tool returned. */
export function withNotice(result: unknown, notice: string): unknown {
  if (Array.isArray(result) && result.every((part) => typeof part === "object" && part !== null && "type" in part))
    return [...result, { type: "text", content: `\n[Daksha guard] ${notice}` }];
  if (result !== null && typeof result === "object" && !Array.isArray(result))
    return { ...(result as Record<string, unknown>), guardNotice: notice };
  return { result, guardNotice: notice };
}
