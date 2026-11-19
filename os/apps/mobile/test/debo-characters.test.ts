import assert from "node:assert/strict";
import test from "node:test";
import { agentCharacters, type AgentIdentity } from "../../../packages/domain/src/agent.ts";
import { planPick, planRename } from "../src/debo-character-pick.ts";
import {
  builtInCharacterIds,
  characterIds,
  characterOrDefault,
  characters,
  defaultCharacter,
  isCharacterId,
  missingMoods,
  poseFor,
  pronounsFor,
  suggestedName,
} from "../src/debo-characters.ts";
import { basePose } from "../src/debo-face-poses.ts";
import { allMoods } from "../src/debo-mood.ts";

test("the app and the shared domain package know the same five characters, plus a made face", () => {
  assert.deepEqual([...characterIds].sort(), [...agentCharacters].sort());
  assert.equal(characterIds.length, 6);
  assert.equal(builtInCharacterIds.length, 5);
  assert.ok(!(builtInCharacterIds as string[]).includes("custom"), "the picker lists made faces apart");
  assert.equal(defaultCharacter, "debo");
});

test("every character defines every mood", () => {
  for (const id of characterIds) {
    assert.deepEqual(missingMoods(id), [], `${id} is missing moods`);
    for (const mood of allMoods) {
      assert.ok(characters[id].expresses[mood].length > 10, `${id} does not say how it shows ${mood}`);
      const pose = poseFor(id, mood);
      // The full set of mood numbers, every one a real number.
      for (const key of Object.keys(basePose) as (keyof typeof basePose)[])
        assert.ok(Number.isFinite(pose[key]), `${id}/${mood}/${key} is not a number`);
    }
    // Nothing describes a mood that does not exist.
    assert.deepEqual(Object.keys(characters[id].expresses).sort(), [...allMoods].sort());
    for (const mood of Object.keys(characters[id].poseTweaks)) assert.ok(allMoods.includes(mood as never));
  }
});

test("characters have different names, and none clashes with the sample people", () => {
  const names = builtInCharacterIds.map((id) => characters[id].name);
  assert.deepEqual(names, ["Daksha", "Diya", "Anaya", "Mishti", "Kabir"]);
  assert.equal(new Set(names).size, names.length);
  for (const taken of ["Neha", "Aarav", "Meera"]) assert.ok(!names.includes(taken));
});

test("labels say he for Kabir, she for the other characters, and they for a made face by default", () => {
  assert.equal(pronounsFor("kabir").subject, "he");
  assert.equal(pronounsFor("kabir").Possessive, "His");
  assert.equal(pronounsFor("kabir").object, "him");
  for (const id of builtInCharacterIds.filter((id) => id !== "kabir")) assert.equal(pronounsFor(id).subject, "she");
  assert.equal(pronounsFor("custom").subject, "they");
});

test("a missing or unknown character means the default, so old accounts get Daksha", () => {
  assert.equal(characterOrDefault(undefined), "debo");
  assert.equal(characterOrDefault(null), "debo");
  assert.equal(characterOrDefault("tomato"), "debo");
  assert.equal(characterOrDefault("diya"), "diya");
  assert.ok(isCharacterId("anaya"));
  assert.ok(!isCharacterId("Anaya"));
});

test("a name the person typed is never replaced without asking", () => {
  // Their own name: keep it, and ask.
  assert.deepEqual(suggestedName("Nova", "diya"), { rename: false, ask: true });
  assert.deepEqual(suggestedName("  Sunny ", "mishti"), { rename: false, ask: true });
  // The factory name or another character's name just follows the pick.
  assert.deepEqual(suggestedName("Daksha", "diya"), { rename: true, ask: false });
  assert.deepEqual(suggestedName("Diya", "anaya"), { rename: true, ask: false });
  assert.deepEqual(suggestedName("", "mishti"), { rename: true, ask: false });
  // Already the right name: nothing to do.
  assert.deepEqual(suggestedName("Anaya", "anaya"), { rename: false, ask: false });
  // A made face offers the name the person gave it.
  assert.deepEqual(suggestedName("Daksha", "custom", "Rani"), { rename: true, ask: false });
  assert.deepEqual(suggestedName("Nova", "custom", "Rani"), { rename: false, ask: true });
});

const saved: AgentIdentity = { name: "Daksha", tone: "warm" };

test("picking a character builds the save, and keeps old fields", () => {
  const plan = planPick(saved, "diya");
  assert.deepEqual(plan.save, { name: "Diya", tone: "warm", avatar: "sky", character: "diya", showChatUpdates: true });
  assert.equal(plan.offer, undefined);

  const old = planPick({ name: "Daksha", tone: "concise", avatar: "lilac", showChatUpdates: false }, "anaya");
  assert.equal(old.save.tone, "concise");
  assert.equal(old.save.avatar, "lilac");
  assert.equal(old.save.showChatUpdates, false);
  assert.equal(old.save.character, "anaya");
});

test("picking with a custom name keeps the name and offers the new one", () => {
  const plan = planPick({ ...saved, name: "Nova" }, "mishti");
  assert.equal(plan.save.name, "Nova");
  assert.equal(plan.save.character, "mishti");
  assert.deepEqual(plan.offer, { name: "Mishti", keep: "Nova" });
  // Saying yes changes only the name.
  const renamed = planRename({ ...saved, name: "Nova", character: "mishti" }, " Mishti ");
  assert.equal(renamed.name, "Mishti");
  assert.equal(renamed.character, "mishti");
});

test("picking a made face saves its id and offers its name", () => {
  const plan = planPick(saved, "custom", { id: "face-1", name: "Rani" });
  assert.deepEqual(plan.save, { name: "Rani", tone: "warm", avatar: "sky", character: "custom", customAvatar: "face-1", showChatUpdates: true });
  const kept = planPick({ ...saved, name: "Nova" }, "custom", { id: "face-1", name: "Rani" });
  assert.equal(kept.save.name, "Nova");
  assert.deepEqual(kept.offer, { name: "Rani", keep: "Nova" });
  // A built-in pick never carries a face id.
  assert.equal(planPick(saved, "diya").save.customAvatar, undefined);
});
