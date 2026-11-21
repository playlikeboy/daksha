// "Skills" on the Apps screen: ready-made methods Daksha follows when a request needs one, such
// as a weekly review or sorting the inbox. Each one is off until the person turns it on. Colours,
// sizes and pieces come from ui.tsx and palette.ts (the pastel tiles).
import { Sparkles } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { errorText } from "./debo-api";
import { creditLine, loadSkills, setSkill, type SkillView, sortSkills } from "./skills-data";
import { Text } from "./text";
import { Card, CheckRow, Chip, colors, ErrorNotice, s, Skeleton, spacing } from "./ui";
import { useWorkspace } from "./workspace";

/** One pastel per tile, in turn, so the list reads as separate cards. */
const tints = [colors.sky, colors.lavender, colors.mint, colors.yellow, colors.pink, colors.orange];

export function SkillsSection({ query = "" }: { query?: string }) {
  const { api, notify } = useWorkspace();
  const [skills, setSkills] = useState<SkillView[] | null>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string>();
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    try {
      const next = await loadSkills(api);
      if (alive.current) {
        setSkills(next);
        setError("");
      }
    } catch (e) {
      if (alive.current) setError(errorText(e));
    }
  }, [api]);
  useEffect(() => {
    void load();
  }, [load]);

  // An API without skills: nothing to show.
  if (skills === null) return null;

  async function toggle(skill: SkillView) {
    setBusy(skill.name);
    setError("");
    try {
      const next = await setSkill(api, skill.name, !skill.enabled);
      if (alive.current) setSkills(next);
      notify(skill.enabled ? `Turned off: ${skill.label}` : `Turned on. Ask Daksha, and she'll use it when it fits.`);
    } catch (e) {
      if (alive.current) setError(errorText(e));
    } finally {
      if (alive.current) setBusy(undefined);
    }
  }

  const words = query.trim().toLowerCase();
  const shown = sortSkills(skills ?? []).filter(
    (skill) => !words || `${skill.label} ${skill.description} ${skill.name}`.toLowerCase().includes(words),
  );
  if (skills && words && !shown.length) return null;

  return (
    <View style={{ gap: spacing[3] }} accessibilityLabel="Skills">
      <Text accessibilityRole="header" style={s.heading}>Skills</Text>
      <Text style={s.muted}>
        Ready-made ways of doing a job, written by other people and checked for Daksha. Turn one on
        and Daksha follows it when you ask for that job. Skills never run programs, and anything
        that leaves Daksha still waits for your yes.
      </Text>
      <ErrorNotice error={error} />
      {!skills && !error && <Skeleton label="Loading skills" variant="apps" rows={2} />}
      {shown.map((skill, index) => (
        <Card key={skill.name} style={{ gap: spacing[2], padding: spacing[4] }}>
          <View style={[s.row, { gap: spacing[3], alignItems: "flex-start" }]}>
            <View style={[s.iconBox, { backgroundColor: tints[index % tints.length] }]}>
              <Sparkles size={19} color={colors.text} />
            </View>
            <View style={{ flex: 1, gap: spacing[1] }}>
              <View style={[s.row, { gap: spacing[2], flexWrap: "wrap" }]}>
                <Text style={[s.text, { fontWeight: "600", flexShrink: 1 }]}>{skill.label}</Text>
                {skill.enabled && <Chip tint={colors.green}>On</Chip>}
                {!skill.available && <Chip tint={colors.subtle}>Not available here</Chip>}
              </View>
              <Text style={s.small}>{skill.description}</Text>
              {!!creditLine(skill) && <Text style={s.small}>{creditLine(skill)}</Text>}
              {!skill.available && !!skill.reason && <Text style={s.small}>{skill.reason}</Text>}
            </View>
          </View>
          {(skill.available || skill.enabled) && (
            <View style={{ opacity: busy === skill.name ? 0.5 : 1 }}>
              <CheckRow
                label={skill.enabled ? "Daksha uses this skill" : "Let Daksha use this skill"}
                checked={skill.enabled}
                onPress={() => {
                  if (!busy) void toggle(skill);
                }}
              />
            </View>
          )}
        </Card>
      ))}
    </View>
  );
}
