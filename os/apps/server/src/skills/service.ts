import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  HERMES_SKILLS,
  hermesAvailability,
  hermesPreface,
  hermesRoots,
  isSkillName,
  renderSkillContent,
  SkillCatalog,
  type SkillSummary,
} from "../../../../packages/skills/src/index.ts";
import type { Store } from "../db.ts";
import { AppError } from "../errors.ts";

/**
 * Skills a person can turn on. The skills themselves are shared content folders
 * (third_party/hermes-skills). Which ones a person turned on is one record per person, kind
 * `skill-settings`: only skill names and when they changed. Like every record it is in the
 * person's download and deleted with the account. Skills start off; nothing is pre-ticked.
 */
export interface SkillSettings {
  id: "enabled";
  names: string[];
  updatedAt: string;
}

const KIND = "skill-settings";
export const MAX_ENABLED = 30;
export const skillNameSchema = z.string().max(64).refine(isSkillName, "That is not a skill name");
const settingsSchema = z.object({
  id: z.literal("enabled"),
  names: z.array(skillNameSchema).max(MAX_ENABLED),
  updatedAt: z.string(),
});
export const setSkillInput = z.object({ enabled: z.boolean() });

/** One skill as the settings screen shows it. */
export interface SkillView {
  name: string;
  /** Plain-English line for people. */
  label: string;
  /** The skill's own one-line description, in its author's words. */
  description: string;
  /** Who wrote it, from the skill's own frontmatter. */
  credit?: string;
  source: string;
  enabled: boolean;
  /** Daksha can use it now. False when a tool it needs is missing. */
  available: boolean;
  /** Why it is not available, when it is not. */
  reason?: string;
}

/** Where the skill folders are: DAKSHA_SKILLS_DIR, or third_party/hermes-skills above this file. */
export function defaultSkillsDir(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const fromEnv = env.DAKSHA_SKILLS_DIR?.trim();
  if (fromEnv) return resolve(fromEnv);
  let dir = dirname(fileURLToPath(import.meta.url));
  for (;;) {
    const candidate = join(dir, "third_party", "hermes-skills");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

export async function hermesCatalog(dir = defaultSkillsDir()): Promise<SkillCatalog> {
  return new SkillCatalog(dir ? await hermesRoots(dir) : []);
}

export class SkillsService {
  constructor(
    private readonly db: Store,
    readonly catalog: SkillCatalog,
    /** The tools this person's chat has (from the server's setup and their connections). */
    private readonly toolsOf: (owner: string) => Promise<string[]> = async () => [],
  ) {}

  /** Offered skills only. Copied skills that Daksha does not offer are never listed. */
  private async offered(): Promise<SkillSummary[]> {
    return (await this.catalog.list()).filter(
      (skill) => skill.invocation.modelInvocable && hermesAvailability(skill.name, []).offered,
    );
  }

  async enabledNames(owner: string): Promise<string[]> {
    const row = await this.db.get<SkillSettings>(owner, KIND, "enabled");
    const parsed = settingsSchema.safeParse(row);
    return parsed.success ? parsed.data.names : [];
  }

  async list(owner: string): Promise<SkillView[]> {
    const [skills, enabled, tools] = await Promise.all([
      this.offered(),
      this.enabledNames(owner),
      this.toolsOf(owner).catch(() => [] as string[]),
    ]);
    const on = new Set(enabled);
    return skills.map((skill) => {
      const availability = hermesAvailability(skill.name, tools);
      return {
        name: skill.name,
        label: labelOf(skill),
        description: skill.description,
        ...(skill.author ? { credit: skill.author } : {}),
        source: skill.source,
        enabled: on.has(skill.name),
        available: availability.available,
        ...(availability.reason && !availability.available ? { reason: availability.reason } : {}),
      };
    });
  }

  /** Turn one skill on or off for this person. Only offered skills can be turned on. */
  async set(owner: string, name: string, input: unknown): Promise<SkillView[]> {
    const skillName = skillNameSchema.safeParse(name);
    if (!skillName.success) throw new AppError("That skill does not exist", 404);
    const { enabled } = setSkillInput.parse(input);
    const known = (await this.offered()).some((skill) => skill.name === skillName.data);
    if (!known) throw new AppError("That skill does not exist", 404);
    const names = new Set(await this.enabledNames(owner));
    if (enabled) names.add(skillName.data);
    else names.delete(skillName.data);
    if (names.size > MAX_ENABLED) throw new AppError(`You can turn on up to ${MAX_ENABLED} skills`, 422);
    await this.db.put<SkillSettings>(owner, KIND, {
      id: "enabled",
      names: [...names].sort(),
      updatedAt: new Date().toISOString(),
    });
    return this.list(owner);
  }

  /** The offered skills this person turned on: name and description only, never the text. */
  async enabled(owner: string): Promise<SkillSummary[]> {
    const on = new Set(await this.enabledNames(owner));
    if (!on.size) return [];
    return (await this.offered()).filter((skill) => on.has(skill.name));
  }

  /** The skills this person turned on that work with these tools. */
  async active(owner: string, tools: readonly string[]): Promise<SkillSummary[]> {
    return usable(await this.enabled(owner), tools);
  }

  /**
   * The full text of one active skill, with Daksha's adapter note in front. With `file`, one of
   * the skill's own reference files (.md or .txt inside its folder) instead.
   */
  async load(owner: string, name: string, tools: readonly string[], file?: string): Promise<string> {
    const active = await this.active(owner, tools);
    if (!active.some((skill) => skill.name === name))
      throw new AppError(`The skill "${name}" is not turned on for this person`, 404);
    if (file) {
      const text = await this.catalog.resource(name, file);
      if (text === undefined) throw new AppError(`The skill "${name}" has no readable file "${file}"`, 404);
      return renderSkillContent({ name: `${name}/${file}`, content: text });
    }
    const skill = await this.catalog.get(name);
    if (!skill) throw new AppError(`The skill "${name}" could not be read`, 404);
    return renderSkillContent(skill, skill.source === "hermes" ? hermesPreface(tools) : "");
  }
}

/** The skills whose needed tools are in this chat. */
export function usable(skills: readonly SkillSummary[], tools: readonly string[]): SkillSummary[] {
  return skills.filter((skill) => hermesAvailability(skill.name, tools).available);
}

/** The plain-English line for people, or the skill's own description. */
function labelOf(skill: SkillSummary): string {
  const policy = HERMES_SKILLS[skill.name];
  return skill.source === "hermes" && policy?.offered ? policy.label : skill.description;
}
