// The five characters a person can talk to, plus a face they make themselves ("custom",
// drawn from their own saved avatar: debo-art-custom.tsx), and how each one shows every mood.
//
// This file has no drawing code, so tests can read it. The drawings live in
// debo-art-*.tsx, and each character's colours in debo-paint-*.ts.
//
// Every character reuses the same mood numbers (debo-face-poses.ts) so every place that
// shows a face just works. `poseTweaks` lets one character bend a mood to suit its body
// (a cat has ears, a girl has hair, a boy has tufts), and `expresses` says in plain words how that
// character shows each mood. A test fails if any character misses any mood.
import { type Pose, poses } from "./debo-face-poses";
import { allMoods, type Mood } from "./debo-mood";

export type CharacterId = "debo" | "diya" | "anaya" | "mishti" | "kabir" | "custom";

/** The same list as `agentCharacters` in the shared domain package (a test checks it). */
export const characterIds: CharacterId[] = ["debo", "diya", "anaya", "mishti", "kabir", "custom"];

/** The ready-made characters the picker shows. A face the person made is listed apart. */
export const builtInCharacterIds = characterIds.filter((id) => id !== "custom");

/** Everyone who never chose gets this one. */
export const defaultCharacter: CharacterId = "debo";

export interface CharacterInfo {
  id: CharacterId;
  /** The name offered as the assistant's name when this character is picked. */
  name: string;
  /** One short line for the picker. */
  blurb: string;
  /** For screen readers: what the picture is. */
  looks: string;
  /** How labels talk about this character: "How she talks" or "How he talks". A made face uses its own. */
  pronoun: "she" | "he" | "they";
  /** Extra mood numbers on top of the shared ones. */
  poseTweaks: Partial<Record<Mood, Partial<Pose>>>;
  /** How this character shows each mood, in a few plain words. */
  expresses: Record<Mood, string>;
}

export const characters: Record<CharacterId, CharacterInfo> = {
  debo: {
    id: "debo",
    name: "Daksha",
    blurb: "A soft blue creature",
    looks: "a small round blue creature with two little ears",
    pronoun: "she",
    // Pale pink on blue turns lilac, so the cheeks stay pink even when a mood fades them.
    poseTweaks: { worried: { blush: 0.85 }, sleepy: { blush: 0.85 } },
    expresses: {
      idle: "Breathes slowly and blinks. Ears sway a little.",
      listening: "Grows a bit taller. Ears perk up. Eyes go wide.",
      thinking: "Looks up and to the side. Flat mouth. Three dots float up.",
      speaking: "Mouth opens and closes with the voice.",
      happy: "Eyes turn into happy arcs. Big open smile. Bounces twice.",
      proud: "Happy arcs, sparkles, chest out, ears high.",
      shy: "Looks down and away. Cheeks turn deep pink. Ears droop.",
      curious: "Tilts to one side. Small round mouth. One ear up.",
      sleepy: "Eyes almost shut. Ears droop. Yawns now and then.",
      worried: "Brows bend up in the middle. Wobbly mouth. A drop of sweat.",
      pouty: "Turns away with eyes shut and a puffed cheek. Peeks with one eye.",
      angry: "Brows cross. Small frown. Little puffs of steam. Trembles.",
    },
  },
  diya: {
    id: "diya",
    name: "Diya",
    blurb: "A cheerful red tomato",
    looks: "a round red tomato with a green leaf crown",
    pronoun: "she",
    poseTweaks: {},
    expresses: {
      idle: "Breathes slowly and blinks. Leaves sway.",
      listening: "Grows a bit taller. Leaves lift. Eyes go wide.",
      thinking: "Looks up and to the side. Flat mouth. Three dots float up.",
      speaking: "Mouth opens and closes with the voice.",
      happy: "Eyes turn into happy arcs. Big open smile. Bounces twice.",
      proud: "Happy arcs, sparkles, leaves high.",
      shy: "Looks down and away. Cheeks turn deep pink. Leaves droop.",
      curious: "Tilts to one side. Small round mouth. One leaf up.",
      sleepy: "Eyes almost shut. Leaves droop. Yawns now and then.",
      worried: "Brows bend up in the middle. Wobbly mouth. A drop of sweat.",
      pouty: "Turns away with eyes shut and a puffed cheek. Peeks with one eye.",
      angry: "Brows cross. Small frown. Little puffs of steam. Trembles.",
    },
  },
  anaya: {
    id: "anaya",
    name: "Anaya",
    blurb: "A warm young woman in a kurta",
    looks: "a young woman of about twenty with long dark hair and a teal kurta",
    pronoun: "she",
    poseTweaks: {},
    expresses: {
      idle: "Breathes, blinks, and a lock of hair sways.",
      listening: "Sits up a little. Eyes go wide. Hair lifts.",
      thinking: "Looks up and to the side, head tilted. Brows raised. Three dots float up.",
      speaking: "Lips open and close with the voice.",
      happy: "Eyes close in a smile. Soft laugh with an open mouth. Bounces.",
      proud: "Smiling eyes, sparkles, chin up.",
      shy: "Looks down and away, head tilted. Cheeks go deep pink.",
      curious: "Head tilts. Brows up. Small round mouth.",
      sleepy: "Heavy eyelids. Head tilts down. Yawns now and then.",
      worried: "Brows bend up in the middle. Wobbly mouth. A drop of sweat.",
      pouty: "Turns her head away with eyes shut and a puffed cheek. Peeks with one eye.",
      angry: "Brows cross. Small frown. Little puffs of steam.",
    },
  },
  mishti: {
    id: "mishti",
    name: "Mishti",
    blurb: "A small friendly cat",
    looks: "a small round orange cat with pointed ears and whiskers",
    pronoun: "she",
    // Ears are the cat's loose parts: flat and out to the sides when cross, folded back when shy.
    poseTweaks: { angry: { leafL: 18, leafR: 18 }, shy: { leafL: 12, leafR: 12 } },
    expresses: {
      idle: "Breathes, blinks, and an ear twitches.",
      listening: "Both ears point up. Eyes go wide.",
      thinking: "Looks up and to the side. Flat mouth. Three dots float up.",
      speaking: "Mouth opens and closes with the voice.",
      happy: "Eyes turn into happy arcs. Open smile. Bounces twice.",
      proud: "Happy arcs, sparkles, ears high.",
      shy: "Looks down and away. Cheeks turn deep pink. Ears fold back.",
      curious: "Tilts to one side. One ear up. Small round mouth.",
      sleepy: "Eyes almost shut. Ears droop. Yawns now and then.",
      worried: "Brows bend up in the middle. Wobbly mouth. A drop of sweat.",
      pouty: "Turns away with eyes shut and a puffed cheek. Peeks with one eye.",
      angry: "Brows cross. Small frown. Ears flat. Little puffs of steam.",
    },
  },
  kabir: {
    id: "kabir",
    name: "Kabir",
    blurb: "A friendly young man in a hoodie",
    looks: "a young man of about twenty-one with short dark hair and a mustard hoodie",
    pronoun: "he",
    expresses: {
      idle: "Breathes, blinks, and the tufts of hair on top sway.",
      listening: "Sits up a little. Eyes go wide. Tufts perk up.",
      thinking: "Looks up and to the side, head tilted. Brows raised. Three dots float up.",
      speaking: "Mouth opens and closes with the voice.",
      happy: "Eyes close in a smile. Big open grin. Bounces.",
      proud: "Smiling eyes, sparkles, chin up.",
      shy: "Looks down and away, head tilted. Cheeks go deep pink.",
      curious: "Head tilts. Brows up. Small round mouth. One tuft up.",
      sleepy: "Heavy eyelids. Head tilts down. Tufts droop. Yawns now and then.",
      worried: "Brows bend up in the middle. Wobbly mouth. A drop of sweat.",
      pouty: "Turns his head away with eyes shut and a puffed cheek. Peeks with one eye.",
      angry: "Brows cross. Small frown. Little puffs of steam. Trembles.",
    },
    poseTweaks: {},
  },
  // A face the person made. Its look, name and pronoun come from the saved avatar; these
  // words describe how any made face shows each mood (they all share the same rig).
  custom: {
    id: "custom",
    name: "Your own",
    blurb: "A face you made",
    looks: "a face the person designed",
    pronoun: "they",
    poseTweaks: {},
    expresses: {
      idle: "Breathes slowly and blinks. Ears, leaves or tufts sway a little.",
      listening: "Grows a bit taller. Eyes go wide. Ears or leaves lift.",
      thinking: "Looks up and to the side. Flat mouth. Three dots float up.",
      speaking: "Mouth opens and closes with the voice.",
      happy: "Eyes turn into happy arcs. Big open smile. Bounces twice.",
      proud: "Happy arcs, sparkles, chin up.",
      shy: "Looks down and away. Cheeks turn deep pink.",
      curious: "Tilts to one side. Small round mouth.",
      sleepy: "Eyes almost shut. Yawns now and then.",
      worried: "Brows bend up in the middle. Wobbly mouth. A drop of sweat.",
      pouty: "Turns away with eyes shut and a puffed cheek. Peeks with one eye.",
      angry: "Brows cross. Small frown. Little puffs of steam. Trembles.",
    },
  },
};

export function isCharacterId(value: unknown): value is CharacterId {
  return typeof value === "string" && (characterIds as string[]).includes(value);
}

/** The person's pick, or the default when nothing valid is saved. */
export function characterOrDefault(value: unknown): CharacterId {
  return isCharacterId(value) ? value : defaultCharacter;
}

/** Words for labels about the assistant, matching the chosen character. */
export function pronounsFor(id: CharacterId) {
  const pronoun = characters[id].pronoun;
  if (pronoun === "they")
    return { subject: "they", Subject: "They", object: "them", possessive: "their", Possessive: "Their", reflexive: "themself" };
  return pronoun === "he"
    ? { subject: "he", Subject: "He", object: "him", possessive: "his", Possessive: "His", reflexive: "himself" }
    : { subject: "she", Subject: "She", object: "her", possessive: "her", Possessive: "Her", reflexive: "herself" };
}

/** The full set of mood numbers for one character in one mood. */
export function poseFor(id: CharacterId, mood: Mood): Pose {
  return { ...poses[mood], ...characters[id].poseTweaks[mood] };
}

/** Moods a character does not describe. Always empty; a test keeps it that way. */
export function missingMoods(id: CharacterId): Mood[] {
  return allMoods.filter((mood) => !characters[id].expresses[mood]);
}

/**
 * What to do with the assistant's name after a character is picked.
 *  - `rename`: change it to the character's name, no need to ask.
 *  - `ask`: the person typed their own name, so ask before replacing it.
 * A name that is just one of the characters' own names counts as "not typed by the
 * person", so it follows the pick. A name the person typed is never replaced silently.
 * For a face the person made, `offered` is the name they gave it.
 */
export function suggestedName(
  currentName: string,
  picked: CharacterId,
  offered: string = characters[picked].name,
): { rename: boolean; ask: boolean } {
  const current = currentName.trim();
  if (!current || current === offered) return { rename: !current, ask: false };
  const isCharacterName = (Object.values(characters) as CharacterInfo[]).some((info) => info.name === current);
  return isCharacterName ? { rename: true, ask: false } : { rename: false, ask: true };
}
