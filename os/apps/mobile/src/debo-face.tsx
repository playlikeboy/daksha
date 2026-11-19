// The face of whoever the person talks to: Daksha, Diya, Anaya, Mishti, Kabir, or a face
// the person made themselves.
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
import type { AvatarConfig } from "../../../packages/domain/src/avatar";
import { AnayaArt } from "./debo-art-anaya";
import { CustomArt } from "./debo-art-custom";
import { DeboArt } from "./debo-art-debo";
import { DiyaArt } from "./debo-art-diya";
import { KabirArt } from "./debo-art-kabir";
import { MishtiArt } from "./debo-art-mishti";
import { useCustomAvatar, useDeboCharacter } from "./debo-character-store";
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
  kabir: KabirArt,
  custom: CustomArt,
};

export interface DeboFaceProps {
  size?: number;
  /** Show this mood instead of the shared one (gallery, previews). */
  mood?: Mood;
  /** Show this character instead of the chosen one (the picker, the gallery). */
  character?: CharacterId;
  /** With character "custom": draw this face instead of the one the person talks to. */
  custom?: AvatarConfig;
  /** Tapping gives a small reaction. */
  interactive?: boolean;
  /** Read by screen readers as an image. Leave off when text already says the state. */
  label?: string;
  /** Hold still even if reduce motion is off. */
  still?: boolean;
}

export function DeboFace({
  size = 120,
  mood: forced,
  character: forcedCharacter,
  custom: forcedCustom,
  interactive,
  label,
  still,
}: DeboFaceProps) {
  const shared = useDeboMood();
  const chosen = useDeboCharacter();
  const chosenCustom = useCustomAvatar();
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
      <Art size={size} rig={rig} custom={forcedCustom ?? chosenCustom} />
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

/**
 * Any made face, anywhere: the builder's preview, a custom person's card. It moves and
 * shows moods exactly like the face the person talks to.
 */
export function CustomFace({ config, ...rest }: Omit<DeboFaceProps, "character" | "custom"> & { config: AvatarConfig }) {
  return <DeboFace {...rest} character="custom" custom={config} />;
}
