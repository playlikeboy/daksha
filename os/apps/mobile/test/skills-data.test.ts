import assert from "node:assert/strict";
import test from "node:test";
import { creditLine, loadSkills, setSkill, type SkillView, sortSkills } from "../src/skills-data.ts";

const api = (answer: (path: string, body?: unknown, method?: string) => unknown) => ({
  request: async <T,>(path: string, body?: unknown, method?: string) => answer(path, body, method) as T,
});
const skill = (over: Partial<SkillView>): SkillView => ({
  name: "a",
  label: "A",
  description: "d",
  source: "hermes",
  enabled: false,
  available: true,
  ...over,
});

test("an API without skills reads as none; other errors are errors", async () => {
  assert.equal(await loadSkills(api(() => { throw new Error("Request failed (404)"); })), null);
  await assert.rejects(loadSkills(api(() => { throw new Error("The server is busy"); })), /busy/);
});

test("skills that don't parse are dropped; turning one on sends the name and the switch", async () => {
  const listed = await loadSkills(api(() => ({ skills: [skill({}), { name: "broken" }] })));
  assert.equal(listed?.length, 1);
  let sent: unknown[] = [];
  const next = await setSkill(
    api((path, body, method) => {
      sent = [path, body, method];
      return { skills: [skill({ enabled: true })] };
    }),
    "weekly review",
    true,
  );
  assert.deepEqual(sent, ["/api/skills/weekly%20review", { enabled: true }, "PUT"]);
  assert.equal(next[0]?.enabled, true);
});

test("turned-on skills come first, then those that work here", () => {
  const sorted = sortSkills([
    skill({ name: "c", label: "C", available: false }),
    skill({ name: "b", label: "B" }),
    skill({ name: "a", label: "Z", enabled: true }),
  ]);
  assert.deepEqual(sorted.map((s) => s.name), ["a", "b", "c"]);
  assert.equal(creditLine(skill({ credit: "Siqi Chen" })), "By Siqi Chen");
  assert.equal(creditLine(skill({})), "");
});
