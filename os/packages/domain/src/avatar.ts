import { z } from "zod";

/**
 * A face the person designs for themselves (decision 33). It is plain data: a base
 * shape, a few colours, a hair style, ears or leaves and some accessories. The app
 * draws it with the same face rig as the built-in characters (apps/mobile,
 * debo-art-custom.tsx), so every mood, blink and speaking mouth works.
 *
 * Saved avatars live in the records kind `custom-avatars`, up to `AVATARS_MAX` per
 * person (apps/server/src/custom-avatars.ts). The server checks every field with
 * `avatarConfigSchema`; the app checks the copy it keeps on the device with it too.
 */
export const avatarBases = ["blob", "human", "cat", "fruit"] as const;
export const hairStyles = ["none", "short", "long", "bun", "curly", "tuft"] as const;
export const earStyles = ["none", "round", "pointed", "leaves"] as const;
export const accessoryKinds = ["glasses", "cap", "bow", "earrings", "scarf"] as const;
/** How labels talk about the face, and which voice it starts with. The person picks it. */
export const avatarPronouns = ["she", "he", "they"] as const;

export type AvatarBase = (typeof avatarBases)[number];
export type HairStyle = (typeof hairStyles)[number];
export type EarStyle = (typeof earStyles)[number];
export type AccessoryKind = (typeof accessoryKinds)[number];
export type AvatarPronoun = (typeof avatarPronouns)[number];

export const AVATARS_MAX = 10;
export const AVATAR_NAME_MAX = 40;

const colour = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "Pick a colour from the list.")
  .transform((value) => value.toLowerCase());

export const avatarColoursSchema = z.object({
  /** Body, fur, peel or skin. */
  body: colour,
  hair: colour,
  /** Shoulders for the round human, and the scarf. */
  outfit: colour,
  cheeks: colour,
  eyes: colour,
  /** Cap, bow and earrings. */
  accessory: colour,
});

export const avatarConfigSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Give the face a name.")
    .max(AVATAR_NAME_MAX, `Keep the name under ${AVATAR_NAME_MAX} characters.`),
  pronoun: z.enum(avatarPronouns),
  base: z.enum(avatarBases),
  colours: avatarColoursSchema,
  hair: z.enum(hairStyles),
  ears: z.enum(earStyles),
  accessories: z
    .array(z.enum(accessoryKinds))
    .max(accessoryKinds.length)
    .refine((list) => new Set(list).size === list.length, "Each accessory can be picked once.")
    .default([]),
});

export type AvatarColours = z.infer<typeof avatarColoursSchema>;
export type AvatarConfig = z.infer<typeof avatarConfigSchema>;

/** One saved avatar: the config plus its record id and times. */
export interface CustomAvatar extends AvatarConfig {
  id: string;
  createdAt: string;
  updatedAt: string;
}

/** The face anyone starts from: a soft blob in Debo's colours. */
export const defaultAvatarConfig: AvatarConfig = {
  name: "Buddy",
  pronoun: "they",
  base: "blob",
  colours: {
    body: "#7cc6a4",
    hair: "#33231d",
    outfit: "#4f8ff2",
    cheeks: "#ff8fb0",
    eyes: "#17213b",
    accessory: "#ffd23f",
  },
  hair: "none",
  ears: "round",
  accessories: [],
};

/** A config from anywhere (the device copy, an old record), or the default if it is not valid. */
export function avatarOrDefault(value: unknown): AvatarConfig {
  const parsed = avatarConfigSchema.safeParse(value);
  return parsed.success ? parsed.data : defaultAvatarConfig;
}
