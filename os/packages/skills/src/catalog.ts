/**
 * The skills on this server: found once from a fixed list of roots, then kept in memory.
 * Skills are content folders shared by everyone. Whether a person has a skill turned on is
 * their own record (os/apps/server/src/skills/store.ts), never part of the folder.
 */
import { extname, resolve } from "node:path";
import {
  discoverRoot,
  isInside,
  parseSkillFile,
  readContained,
  type SkillDefinition,
  type SkillLogger,
  type SkillRoot,
  type SkillSummary,
} from "./loader.ts";

/** Reference files a skill may point to. Only Markdown and plain text are read; scripts never are. */
const RESOURCE_EXTENSIONS = new Set([".md", ".txt"]);

export class SkillCatalog {
  private summaries?: Promise<Map<string, { summary: SkillSummary; root: SkillRoot }>>;
  constructor(
    private readonly roots: readonly SkillRoot[],
    private readonly log: SkillLogger = () => {},
  ) {}

  /** Every skill, one per name (the lowest rank wins), sorted by name. */
  async list(): Promise<SkillSummary[]> {
    return [...(await this.load()).values()].map((entry) => entry.summary).sort((a, b) => a.name.localeCompare(b.name));
  }

  /** The summary for one name, or undefined. */
  async summary(name: string): Promise<SkillSummary | undefined> {
    return (await this.load()).get(name)?.summary;
  }

  /** The full skill, read fresh from disk, or undefined when it is gone. */
  async get(name: string): Promise<SkillDefinition | undefined> {
    const entry = (await this.load()).get(name);
    if (!entry) return undefined;
    return parseSkillFile(entry.root, entry.summary.path, this.log);
  }

  /**
   * A reference file inside a skill's folder, such as `references/forms.md`. Only .md and .txt,
   * only inside the folder (after symlinks), never a script.
   */
  async resource(name: string, relativePath: string): Promise<string | undefined> {
    const summary = await this.summary(name);
    if (!summary) return undefined;
    if (!RESOURCE_EXTENSIONS.has(extname(relativePath).toLowerCase())) return undefined;
    const full = resolve(summary.directory, relativePath);
    if (!isInside(resolve(summary.directory), full)) return undefined;
    return (await readContained(summary.directory, full, this.log))?.content;
  }

  private load(): Promise<Map<string, { summary: SkillSummary; root: SkillRoot }>> {
    this.summaries ??= (async () => {
      const byName = new Map<string, { summary: SkillSummary; root: SkillRoot }>();
      const ordered = [...this.roots].sort((a, b) => a.rank - b.rank);
      for (const root of ordered) {
        let found: SkillSummary[];
        try {
          found = await discoverRoot(root, this.log);
        } catch (error) {
          this.log(`skill root "${root.path}" skipped: ${String(error)}`);
          continue;
        }
        for (const skill of found) if (!byName.has(skill.name)) byName.set(skill.name, { summary: skill, root });
      }
      return byName;
    })();
    return this.summaries;
  }
}
