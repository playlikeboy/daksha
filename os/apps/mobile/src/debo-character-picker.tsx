// "Choose who you talk to": the four characters, live, with their names.
// Picking one is a single tap. The parent saves it and every face in the app follows.
import { Pressable, Text, View } from "react-native";
import { type CharacterId, characterIds, characters } from "./debo-characters";
import { DeboFace } from "./debo-face";
import { colors, radius, s, spacing } from "./ui";

export function CharacterPicker({
  value,
  onChange,
  busy,
}: {
  value: CharacterId;
  onChange: (id: CharacterId) => void;
  busy?: boolean;
}) {
  return (
    <View style={{ gap: spacing[2] }}>
      <Text style={s.heading}>Choose who you talk to</Text>
      <View accessibilityRole="radiogroup" style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing[2] }}>
        {characterIds.map((id) => {
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
              style={{
                flexGrow: 1,
                flexBasis: 130,
                alignItems: "center",
                gap: spacing[1],
                padding: spacing[3],
                borderRadius: radius.page,
                borderWidth: 2,
                borderColor: picked ? colors.blueDark : colors.line,
                backgroundColor: picked ? colors.sky : colors.canvas,
              }}
            >
              <DeboFace size={72} character={id} mood={picked ? "happy" : "idle"} />
              <Text style={[s.heading, { textAlign: "center" }]}>{info.name}</Text>
              <Text style={[s.small, { textAlign: "center" }]}>{info.blurb}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
