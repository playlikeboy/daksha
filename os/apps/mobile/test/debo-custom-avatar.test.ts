import assert from "node:assert/strict";
import test from "node:test";
import {
  accessoryKinds,
  type AvatarConfig,
  avatarBases,
  avatarConfigSchema,
  defaultAvatarConfig,
  earStyles,
  hairStyles,
} from "../../../packages/domain/src/avatar.ts";
import { characters, missingMoods, poseFor } from "../src/debo-characters.ts";
import { customDrawing, geometry, randomAvatar, type Shape, shade, tint, withBase } from "../src/debo-custom-shape.ts";
import { basePose } from "../src/debo-face-poses.ts";
import { allMoods } from "../src/debo-mood.ts";
import { customSwatches } from "../src/debo-paint-custom.ts";

// The layers have 24 spare units on every side of the 240 x 240 drawing.
const MIN = -24;
const MAX = 264;

function numbersIn(shape: Shape): number[] {
  if (shape.kind === "path") {
    assert.ok(!/NaN|undefined|Infinity/.test(shape.d), `bad path ${shape.d}`);
    return (shape.d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
  }
  if (shape.kind === "circle") return [shape.cx - shape.r, shape.cx + shape.r, shape.cy - shape.r, shape.cy + shape.r];
  return [shape.cx - shape.rx, shape.cx + shape.rx, shape.cy - shape.ry, shape.cy + shape.ry];
}

function allShapes(config: AvatarConfig): Shape[] {
  const d = customDrawing(config);
  return [
    ...d.shoulders,
    ...d.back,
    ...d.earL.shapes,
    ...d.earR.shapes,
    ...d.body,
    ...d.hair,
    ...d.tufts.left,
    ...d.tufts.right,
    ...d.accessories,
    ...d.face,
  ];
}

function checkDrawing(config: AvatarConfig) {
  const label = JSON.stringify({ base: config.base, hair: config.hair, ears: config.ears, acc: config.accessories });
  for (const shape of allShapes(config)) {
    for (const n of numbersIn(shape)) {
      assert.ok(Number.isFinite(n), `${label}: not a number`);
      assert.ok(n >= MIN && n <= MAX, `${label}: ${n} is outside the picture`);
    }
    assert.ok(shape.fill === "none" || /^#[0-9a-f]{6}$/.test(shape.fill), `${label}: odd colour ${shape.fill}`);
  }
}

test("a made face describes every mood, like the built-in characters", () => {
  assert.deepEqual(missingMoods("custom"), []);
  assert.deepEqual(Object.keys(characters.custom.expresses).sort(), [...allMoods].sort());
});

test("every mood has real numbers on every base, and every part lands inside the picture", () => {
  for (const base of avatarBases) {
    const g = geometry[base];
    for (const value of Object.values(g).flat()) assert.ok(Number.isFinite(value), `${base}: geometry`);
    assert.ok(g.eyeL < g.cx && g.eyeR > g.cx, `${base}: eyes either side`);
    assert.ok(g.mouthY > g.eyeY, `${base}: mouth below eyes`);
    for (const mood of allMoods) {
      const pose = poseFor("custom", mood);
      for (const key of Object.keys(basePose) as (keyof typeof basePose)[])
        assert.ok(Number.isFinite(pose[key]), `${base}/${mood}/${key}`);
      // The face is drawn the same in every mood; only the rig's numbers change.
      checkDrawing({ ...defaultAvatarConfig, base });
    }
  }
});

test("every base, hair style, pair of ears and accessory draws with real numbers", () => {
  for (const base of avatarBases)
    for (const hair of hairStyles)
      for (const ears of earStyles) {
        checkDrawing({ ...defaultAvatarConfig, base, hair, ears, accessories: [] });
        checkDrawing({ ...defaultAvatarConfig, base, hair, ears, accessories: [...accessoryKinds] });
      }
});

test("parts show only when picked", () => {
  const plain = customDrawing({ ...defaultAvatarConfig, base: "blob", hair: "none", ears: "none", accessories: [] });
  assert.equal(plain.hair.length, 0);
  assert.equal(plain.earL.shapes.length, 0);
  assert.equal(plain.accessories.length, 0);
  assert.equal(plain.face.length, 0);
  assert.equal(plain.shoulders.length, 0, "only the round human has shoulders");
  const dressed = customDrawing({ ...defaultAvatarConfig, base: "human", hair: "long", ears: "leaves", accessories: ["glasses", "scarf"] });
  assert.ok(dressed.shoulders.length > 0);
  assert.ok(dressed.back.length > 0, "long hair falls behind the head");
  assert.ok(dressed.earsInFront, "leaves sit in front");
  assert.ok(dressed.face.some((s) => s.kind === "circle" && s.stroke), "glasses ride on the face");
  assert.equal(customDrawing({ ...defaultAvatarConfig, hair: "tuft" }).tufts.left.length, 1);
});

test("Randomise always makes a valid face, keeps the name and pronoun, and stays tidy", () => {
  let seed = 7;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const start: AvatarConfig = { ...defaultAvatarConfig, name: "Rani", pronoun: "she" };
  const bases = new Set<string>();
  for (let i = 0; i < 300; i++) {
    const face = randomAvatar(start, random);
    assert.ok(avatarConfigSchema.safeParse(face).success, JSON.stringify(face));
    assert.equal(face.name, "Rani");
    assert.equal(face.pronoun, "she");
    assert.ok(face.accessories.length <= 2);
    bases.add(face.base);
    checkDrawing(face);
  }
  assert.equal(bases.size, avatarBases.length, "every base comes up");
});

test("changing the base brings that base's own ears and colours", () => {
  assert.equal(withBase(defaultAvatarConfig, "cat").ears, "pointed");
  assert.equal(withBase(defaultAvatarConfig, "fruit").ears, "leaves");
  assert.equal(withBase(defaultAvatarConfig, "human").hair, "short");
  const kept = withBase({ ...defaultAvatarConfig, name: "Bittu", accessories: ["cap"] }, "cat");
  assert.equal(kept.name, "Bittu");
  assert.deepEqual(kept.accessories, ["cap"]);
});

test("the colours on offer are real colours, and the starting face uses them", () => {
  for (const [part, list] of Object.entries(customSwatches)) {
    assert.ok(list.length >= 3, part);
    for (const hex of list) assert.match(hex, /^#[0-9a-f]{6}$/);
    assert.ok((list as readonly string[]).includes(defaultAvatarConfig.colours[part as keyof typeof customSwatches]), `${part} default`);
  }
  assert.equal(shade("#ffffff", 0.5), "#808080");
  assert.equal(tint("#000000", 0.5), "#808080");
});
