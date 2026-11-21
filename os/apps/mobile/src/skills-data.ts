// Skills from the API (apps/server/src/skills): ready-made methods Daksha can follow, such as a
// weekly review. Each person turns them on or off. An older API without skills answers 404,
// which reads as "no skills here".
import { z } from "zod";

export const skillView = z.object({
  name: z.string(),
  label: z.string(),
  description: z.string(),
  credit: z.string().optional(),
  source: z.string(),
  enabled: z.boolean(),
  available: z.boolean(),
  reason: z.string().optional(),
});
export type SkillView = z.infer<typeof skillView>;

const skillList = z.object({
  skills: z.array(z.unknown()).transform((list) =>
    list.flatMap((item) => {
      const parsed = skillView.safeParse(item);
      return parsed.success ? [parsed.data] : [];
    }),
  ),
});

type Api = { request<T>(path: string, body?: unknown, method?: string): Promise<T> };
const notFound = (error: unknown) => error instanceof Error && /\(404\)|not found/i.test(error.message);

/** The skills, or null when this API has none. */
export async function loadSkills(api: Api): Promise<SkillView[] | null> {
  try {
    return skillList.parse(await api.request("/api/skills")).skills;
  } catch (error) {
    if (notFound(error)) return null;
    throw error;
  }
}

export async function setSkill(api: Api, name: string, enabled: boolean): Promise<SkillView[]> {
  return skillList.parse(await api.request(`/api/skills/${encodeURIComponent(name)}`, { enabled }, "PUT")).skills;
}

/** Turned-on skills first, then the ones that work here, then the rest; by label inside each. */
export function sortSkills(skills: readonly SkillView[]): SkillView[] {
  const rank = (s: SkillView) => (s.enabled ? 0 : s.available ? 1 : 2);
  return [...skills].sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label));
}

/** "by Ben Barclay (benbarclay), Hermes Agent": who wrote a skill, as its authors wrote it. */
export const creditLine = (skill: SkillView) => (skill.credit ? `By ${skill.credit}` : "");
