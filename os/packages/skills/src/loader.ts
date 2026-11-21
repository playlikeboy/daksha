/**
 * Reads skill folders from disk: each folder holds a SKILL.md with YAML frontmatter (name,
 * description) and a Markdown body, plus optional reference files.
 *
 * Adapted from deepseek-ai/deepseek-harness, packages/skill/skill-filesystem/src/index.ts and
 * packages/skill/skill/src/index.ts (isSkillName, renderSkillContent, escapeText), commit
 * 2e39e70496aa02986ca6a820c5d497e816b69d7e, MIT licence (Copyright (c) 2026 DeepSeek; see
 * third_party/deepseek-harness/). Changed for Daksha: the Cordis plugin, ctx.fs, file watchers and
 * project/user roots are gone; roots are a fixed list given by the caller; every file read is
 * checked to stay inside its root after symlinks are followed; frontmatter is checked with zod.
 */
import { readdir, readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** Skill files larger than this are skipped: a skill is a page of instructions, not a book. */
export const MAX_SKILL_BYTES = 256 * 1024;

/** Whether a string is a valid kebab-case skill name. */
export function isSkillName(name: string): boolean {
  return SKILL_NAME.test(name);
}

/** Invocation controls from frontmatter. */
export interface SkillInvocationPolicy {
  /** Whether model-facing catalogs and loaders include this skill. */
  readonly modelInvocable: boolean;
  /** Whether human-facing lists include this skill. */
  readonly userInvocable: boolean;
}

/** What the prompt and the settings screen see about a skill: never the body. */
export interface SkillSummary {
  readonly name: string;
  readonly description: string;
  readonly whenToUse?: string;
  /** The author line from the frontmatter, kept as written: the skill's credits. */
  readonly author?: string;
  /** The licence named in the frontmatter, for example MIT. */
  readonly license?: string;
  readonly invocation: SkillInvocationPolicy;
  /** Which root it came from, for example "hermes". */
  readonly source: string;
  /** Lower ranks win when two roots have a skill with the same name. */
  readonly rank: number;
  /** The skill's folder. Relative resources resolve against it. */
  readonly directory: string;
  /** The SKILL.md path, after symlinks. */
  readonly path: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** A loaded skill: the summary plus the Markdown body. */
export interface SkillDefinition extends SkillSummary {
  readonly content: string;
}

/** One folder that holds skill folders (or flat .md skills). */
export interface SkillRoot {
  readonly path: string;
  readonly source: string;
  readonly rank: number;
}

export type SkillLogger = (message: string) => void;

const frontmatterSchema = z.looseObject({
  name: z.string().min(1).max(64),
  description: z.string().min(1).max(1024),
  whenToUse: z.string().min(1).max(1024).optional(),
  author: z.string().min(1).max(300).optional().catch(undefined),
  license: z.string().min(1).max(100).optional().catch(undefined),
});

/** Find every skill in a root. Folders sort by name so the order is stable. Missing roots are empty. */
export async function discoverRoot(root: SkillRoot, log: SkillLogger = () => {}): Promise<SkillSummary[]> {
  let entries: { name: string; isDirectory(): boolean; isFile(): boolean; isSymbolicLink(): boolean }[];
  try {
    entries = await readdir(root.path, { withFileTypes: true, encoding: "utf8" });
  } catch (error) {
    if (isAbsentPathError(error)) return [];
    throw error;
  }
  const skills: SkillSummary[] = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name.startsWith(".")) continue;
    const full = join(root.path, entry.name);
    const type = await entryKind(full, entry, log);
    const locator =
      type === "directory"
        ? { path: join(full, "SKILL.md"), directory: full }
        : type === "file" && entry.name.endsWith(".md")
          ? { path: full, directory: root.path }
          : undefined;
    if (locator === undefined) continue;
    const parsed = await parseSkillFile(root, locator.path, log);
    if (parsed === undefined) continue;
    const { content: _content, ...summary } = parsed;
    skills.push({ ...summary, directory: locator.directory });
  }
  return skills;
}

/** Read and parse one SKILL.md. Undefined when missing, too big, or not a valid skill. */
export async function parseSkillFile(
  root: SkillRoot,
  path: string,
  log: SkillLogger = () => {},
): Promise<SkillDefinition | undefined> {
  const raw = await readContained(root.path, path, log);
  if (raw === undefined) return undefined;
  let parsed: { data: Record<string, unknown>; body: string } | undefined;
  try {
    parsed = parseFrontmatter(raw.content);
  } catch (error) {
    log(`skill file ${path} ignored: invalid YAML frontmatter: ${errorMessage(error)}`);
    return undefined;
  }
  if (!parsed) {
    log(`skill file ${path} ignored: missing YAML frontmatter`);
    return undefined;
  }
  const fields = frontmatterSchema.safeParse(parsed.data);
  if (!fields.success) {
    log(`skill file ${path} ignored: frontmatter requires a name and a description`);
    return undefined;
  }
  if (!isSkillName(fields.data.name)) {
    log(`skill file ${path} ignored: invalid skill name "${fields.data.name}"`);
    return undefined;
  }
  let invocation: SkillInvocationPolicy;
  try {
    invocation = parseInvocationPolicy(parsed.data);
  } catch (error) {
    log(`skill file ${path} ignored: invalid invocation frontmatter: ${errorMessage(error)}`);
    return undefined;
  }
  return {
    name: fields.data.name,
    description: fields.data.description,
    ...(fields.data.whenToUse !== undefined ? { whenToUse: fields.data.whenToUse } : {}),
    ...(fields.data.author !== undefined ? { author: fields.data.author } : {}),
    ...(fields.data.license !== undefined ? { license: fields.data.license } : {}),
    invocation,
    source: root.source,
    rank: root.rank,
    directory: resolve(path, ".."),
    path: raw.path,
    ...optionalMetadata(parsed.data),
    content: parsed.body.trim(),
  };
}

/**
 * Read a text file only if, after symlinks, it is still inside `rootPath`.
 * Undefined when it is missing, outside the root, not a file, or too big.
 */
export async function readContained(
  rootPath: string,
  path: string,
  log: SkillLogger = () => {},
): Promise<{ path: string; content: string } | undefined> {
  try {
    const realRoot = await realpath(rootPath);
    const resolvedPath = await realpath(path);
    if (!isInside(realRoot, resolvedPath)) {
      log(`skill file ${path} ignored: it points outside its folder`);
      return undefined;
    }
    const info = await stat(resolvedPath);
    if (!info.isFile()) return undefined;
    if (info.size > MAX_SKILL_BYTES) {
      log(`skill file ${path} ignored: larger than ${MAX_SKILL_BYTES} bytes`);
      return undefined;
    }
    return { path: resolvedPath, content: await readFile(resolvedPath, { encoding: "utf8" }) };
  } catch (error) {
    if (isAbsentPathError(error)) return undefined;
    throw error;
  }
}

/** Whether `child` is `parent` or inside it. Both must already be resolved. */
export function isInside(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}

/**
 * The model-facing block for a loaded skill. `preface` (Daksha's adapter note) comes before the
 * skill's own instructions. The skill text is kept as written, except that it cannot open or close
 * the framing tags.
 */
export function renderSkillContent(skill: Pick<SkillDefinition, "name" | "content">, preface = ""): string {
  return [
    `<skill_content name="${escapeAttr(skill.name)}">`,
    ...(preface ? ["<daksha_notes>", escapeText(preface), "</daksha_notes>", ""] : []),
    "<skill_instructions>",
    unframed(skill.content),
    "</skill_instructions>",
    "</skill_content>",
  ].join("\n");
}

function escapeAttr(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}

/** Neutralise only the framing tags inside skill text, so Markdown and code stay readable. */
export function unframed(value: string): string {
  return value.replace(/<(\/?)(skill_|daksha_)/gi, "&lt;$1$2");
}

/** Escape prose embedded inside skill markup so it cannot open or close framing tags. */
export function escapeText(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

type DirEntry = { isDirectory(): boolean; isFile(): boolean; isSymbolicLink(): boolean };
async function entryKind(fullPath: string, entry: DirEntry, log: SkillLogger): Promise<"directory" | "file" | undefined> {
  if (entry.isDirectory()) return "directory";
  if (entry.isFile()) return "file";
  if (!entry.isSymbolicLink()) return undefined;
  try {
    const info = await stat(fullPath);
    if (info.isDirectory()) return "directory";
    if (info.isFile()) return "file";
    return undefined;
  } catch (error) {
    log(`skill entry ${fullPath} ignored: failed to follow symbolic link: ${errorMessage(error)}`);
    return undefined;
  }
}

export function parseFrontmatter(raw: string): { data: Record<string, unknown>; body: string } | undefined {
  const firstLineEnd = raw.indexOf("\n");
  if (firstLineEnd < 0) return undefined;
  const firstLine = raw.slice(0, firstLineEnd).replace(/\r$/, "");
  if (firstLine !== "---") return undefined;
  const start = firstLineEnd + 1;
  const closing = findClosingFrontmatter(raw, start);
  if (closing === undefined) return undefined;
  const yaml = raw.slice(start, closing.start);
  const parsed: unknown = parseYaml(yaml);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return undefined;
  return { data: parsed as Record<string, unknown>, body: raw.slice(closing.bodyStart) };
}

function findClosingFrontmatter(raw: string, start: number): { start: number; bodyStart: number } | undefined {
  let lineStart = start;
  while (lineStart <= raw.length) {
    const nextNewline = raw.indexOf("\n", lineStart);
    const lineEnd = nextNewline < 0 ? raw.length : nextNewline;
    const line = raw.slice(lineStart, lineEnd).replace(/\r$/, "");
    if (line === "---") return { start: lineStart, bodyStart: nextNewline < 0 ? raw.length : nextNewline + 1 };
    if (nextNewline < 0) return undefined;
    lineStart = nextNewline + 1;
  }
  return undefined;
}

function parseInvocationPolicy(data: Record<string, unknown>): SkillInvocationPolicy {
  rejectLegacyInvocationKey(data, "disableModelInvocation", "disable-model-invocation");
  rejectLegacyInvocationKey(data, "modelInvocable", "disable-model-invocation");
  rejectLegacyInvocationKey(data, "userInvocable", "user-invocable");
  const disableModelInvocation = frontmatterBoolean(data, "disable-model-invocation");
  const userInvocable = frontmatterBoolean(data, "user-invocable");
  return { modelInvocable: disableModelInvocation !== true, userInvocable: userInvocable !== false };
}

function rejectLegacyInvocationKey(data: Record<string, unknown>, legacy: string, canonical: string): void {
  if (Object.hasOwn(data, legacy)) throw new Error(`frontmatter field "${legacy}" is unsupported; use "${canonical}"`);
}

function frontmatterBoolean(data: Record<string, unknown>, key: string): boolean | undefined {
  if (!Object.hasOwn(data, key)) return undefined;
  const value = data[key];
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1") return true;
  if (value === 0 || value === "0") return false;
  if (typeof value === "string") {
    switch (value.toLowerCase()) {
      case "true":
      case "yes":
      case "on":
        return true;
      case "false":
      case "no":
      case "off":
        return false;
    }
  }
  throw new TypeError(`frontmatter field "${key}" must be a boolean`);
}

function optionalMetadata(data: Record<string, unknown>): { metadata?: Record<string, unknown> } {
  const value = data.metadata;
  if (typeof value === "object" && value !== null && !Array.isArray(value)) return { metadata: value as Record<string, unknown> };
  return {};
}

function isAbsentPathError(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === "ENOENT" || code === "ENOTDIR";
}

function errorMessage(error: unknown): string {
  return String(error);
}
