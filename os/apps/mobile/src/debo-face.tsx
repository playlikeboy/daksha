// The face of whoever the person talks to: Debo, Diya, Anaya or Mishti.
//
// This is the one component every screen uses. It reads the chosen character
// (debo-character-store.ts) and the shared mood (debo-mood-store.ts), runs the shared
// motion (debo-face-rig.tsx) and draws that character's art (debo-art-*.tsx), so every
// place that shows a face changes at once when the person picks someone else.
//
// With "reduce motion" on, the face stays still and only cross-fades between poses.
// The face is decoration next to text that already says the state, so screen
// readers skip it unless a `label` is given.
import { Platform, Pressable, View } from "react-native";
import { AnayaArt } from "./debo-art-anaya";
import { DeboArt } from "./debo-art-debo";
import { DiyaArt } from "./debo-art-diya";
import { MishtiArt } from "./debo-art-mishti";
import { useDeboCharacter } from "./debo-character-store";
import type { CharacterId } from "./debo-characters";
import { type ArtProps, useFaceRig, useReducedMotion } from "./debo-face-rig";
import type { Mood } from "./debo-mood";
import { deboMood, useDeboMood } from "./debo-mood-store";

export { useReducedMotion };

const arts: Record<CharacterId, (props: ArtProps) => React.ReactNode> = {
  debo: DeboArt,
  diya: DiyaArt,
  anaya: AnayaArt,
  mishti: MishtiArt,
};

export interface DeboFaceProps {
  size?: number;
  /** Show this mood instead of the shared one (gallery, previews). */
  mood?: Mood;
  /** Show this character instead of the chosen one (the picker, the gallery). */
  character?: CharacterId;
  /** Tapping gives a small reaction. */
  interactive?: boolean;
  /** Read by screen readers as an image. Leave off when text already says the state. */
  label?: string;
  /** Hold still even if reduce motion is off. */
  still?: boolean;
}

export function DeboFace({ size = 120, mood: forced, character: forcedCharacter, interactive, label, still }: DeboFaceProps) {
  const shared = useDeboMood();
  const chosen = useDeboCharacter();
  const character = forcedCharacter ?? chosen;
  const mood: Mood = forced ?? shared.mood;
  const rig = useFaceRig(character, mood, size, still);
  const Art = arts[character];

  const body = (
    <View
      style={{ width: size, height: size }}
      {...(label
        ? { accessible: true, accessibilityRole: "image" as const, accessibilityLabel: label }
        : {
            accessibilityElementsHidden: true,
            importantForAccessibility: "no-hide-descendants" as const,
            ...(Platform.OS === "web" ? { "aria-hidden": true } : {}),
          })}
    >
      <Art size={size} rig={rig} />
    </View>
  );

  if (!interactive) return body;
  return (
    <Pressable
      accessible={false}
      focusable={false}
      onPress={() => {
        rig.squish();
        deboMood.tap();
      }}
      style={Platform.OS === "web" ? ({ cursor: "pointer" } as object) : undefined}
    >
      {body}
    </Pressable>
  );
}
