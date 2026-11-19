// "Choose who you talk to": the five characters, live, with their names, and the faces the
// person made (with "Make your own" to design a new one). Picking one is a single tap. The
// parent saves it and every face in the app follows.
import { Pressable, View } from "react-native";
import { Text } from "./text";
import type { CustomAvatar } from "../../../packages/domain/src/avatar";
import { builtInCharacterIds, type CharacterId, characters } from "./debo-characters";
import { CustomFace, DeboFace } from "./debo-face";
import { Button, colors, radius, s, spacing } from "./ui";

const tile = (picked: boolean) => ({
  flexGrow: 1,
  flexBasis: 130,
  alignItems: "center" as const,
  gap: spacing[1],
  padding: spacing[3],
  borderRadius: radius.page,
  borderWidth: 2,
  borderColor: picked ? colors.blueDark : colors.line,
  backgroundColor: picked ? colors.sky : colors.canvas,
});

export function CharacterPicker({
  value,
  onChange,
  busy,
  faces,
  pickedFace,
  onPickFace,
  onEditFace,
  onMakeOwn,
  facesMax,
}: {
  value: CharacterId;
  onChange: (id: CharacterId) => void;
  busy?: boolean;
  /** Faces the person made. Shown only when `onMakeOwn` is given. */
  faces?: CustomAvatar[];
  /** With value "custom": which made face is in use. */
  pickedFace?: string;
  onPickFace?: (face: CustomAvatar) => void;
  onEditFace?: (face: CustomAvatar) => void;
  /** Opens the avatar builder for a new face. */
  onMakeOwn?: () => void;
  facesMax?: number;
}) {
  const full = facesMax !== undefined && (faces?.length ?? 0) >= facesMax;
  return (
    <View style={{ gap: spacing[2] }}>
      <Text style={s.heading}>Choose who you talk to</Text>
      <View accessibilityRole="radiogroup" style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing[2] }}>
        {builtInCharacterIds.map((id) => {
          const picked = value === id;
          const info = characters[id];
          return (
            <Pressable
              key={id}
              accessibilityRole="radio"
              accessibilityLabel={`${info.name}: ${info.blurb}`}
              accessibilityState={{ checked: picked, disabled: busy }}
              disabled={busy}
              onPress={() => onChange(id)}
              style={tile(picked)}
            >
              <DeboFace size={72} character={id} mood={picked ? "happy" : "idle"} />
              <Text style={[s.heading, { textAlign: "center" }]}>{info.name}</Text>
              <Text style={[s.small, { textAlign: "center" }]}>{info.blurb}</Text>
            </Pressable>
          );
        })}
        {onMakeOwn &&
          faces?.map((face) => {
            const picked = value === "custom" && pickedFace === face.id;
            return (
              <View key={face.id} style={tile(picked)}>
                <Pressable
                  accessibilityRole="radio"
                  accessibilityLabel={`${face.name}: a face you made`}
                  accessibilityState={{ checked: picked, disabled: busy }}
                  disabled={busy}
                  onPress={() => onPickFace?.(face)}
                  style={{ alignItems: "center", gap: spacing[1] }}
                >
                  <CustomFace size={72} config={face} mood={picked ? "happy" : "idle"} />
                  <Text style={[s.heading, { textAlign: "center" }]}>{face.name}</Text>
                  <Text style={[s.small, { textAlign: "center" }]}>A face you made</Text>
                </Pressable>
                {onEditFace && (
                  <Button small onPress={() => onEditFace(face)}>
                    {`Edit ${face.name}`}
                  </Button>
                )}
              </View>
            );
          })}
        {onMakeOwn && !full && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Make your own face"
            accessibilityState={{ disabled: busy }}
            disabled={busy}
            onPress={onMakeOwn}
            style={[tile(false), { justifyContent: "center", borderStyle: "dashed" }]}
          >
            <Text style={[s.heading, { textAlign: "center" }]}>Make your own</Text>
            <Text style={[s.small, { textAlign: "center" }]}>Pick a shape, colours, hair and more</Text>
          </Pressable>
        )}
      </View>
      {onMakeOwn && full && (
        <Text style={s.small}>{`You have ${facesMax} faces, the most you can keep. Edit one, or delete one to make another.`}</Text>
      )}
    </View>
  );
}
