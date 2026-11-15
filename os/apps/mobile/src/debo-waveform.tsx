// The waveform of a recording, which is also its scrub bar: press or drag
// anywhere on it to jump there. On the web a real range input sits on top, so
// keyboard and screen readers get the browser's own slider. On the phone it is
// an adjustable control (swipe up or down with a screen reader).
import { useState } from "react";
import { Platform, Pressable, View } from "react-native";
import { timeMark } from "./debo-data";
import { colors, radius, spacing } from "./ui";

export function Waveform({
  peaks,
  progress,
  durationSeconds,
  onSeek,
  label,
  height = spacing[12],
}: {
  peaks: number[];
  /** 0 to 1: how far it has played. */
  progress: number;
  durationSeconds: number;
  /** A point to jump to, 0 to 1. */
  onSeek: (fraction: number) => void;
  label: string;
  height?: number;
}) {
  const [width, setWidth] = useState(0);
  const played = Math.round(Math.max(0, Math.min(1, progress)) * peaks.length);
  const at = (x: number) => (width > 0 ? Math.max(0, Math.min(1, x / width)) : 0);
  const now = progress * durationSeconds;
  const step = durationSeconds > 0 ? Math.min(1, 5 / durationSeconds) : 0.05;
  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{ height, justifyContent: "center", position: "relative" }}
    >
      <Pressable
        accessible={Platform.OS !== "web"}
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ text: `${timeMark(now)} of ${timeMark(durationSeconds)}` }}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={(e) =>
          onSeek(Math.max(0, Math.min(1, progress + (e.nativeEvent.actionName === "increment" ? step : -step))))
        }
        onPress={(e) => onSeek(at(e.nativeEvent.locationX))}
        style={{ flexDirection: "row", alignItems: "center", gap: 2, height, width: "100%" }}
      >
        {peaks.map((peak, i) => (
          <View
            // biome-ignore lint/suspicious/noArrayIndexKey: bars are positions, not items
            key={i}
            style={{
              flex: 1,
              height: Math.max(spacing[1], peak * height),
              borderRadius: radius.full,
              backgroundColor: i < played ? colors.accent : colors.lineStrong,
            }}
          />
        ))}
      </Pressable>
      {Platform.OS === "web" && (
        <input
          type="range"
          min={0}
          max={Math.max(1, Math.round(durationSeconds * 10))}
          step={1}
          value={Math.round(now * 10)}
          aria-label={label}
          aria-valuetext={`${timeMark(now)} of ${timeMark(durationSeconds)}`}
          onChange={(e) => onSeek(Number(e.target.value) / Math.max(1, Math.round(durationSeconds * 10)))}
          className="debo-wave-range"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            margin: 0,
            opacity: 0,
            cursor: "pointer",
          }}
        />
      )}
    </View>
  );
}

/** The live level while recording: newest reading on the right. Decorative for screen readers; the timer says it all. */
export function LevelBars({ levels, height = spacing[12] * 2, tint = colors.accent }: { levels: number[]; height?: number; tint?: string }) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 3, height, width: "100%" }}
    >
      {levels.map((level, i) => (
        <View
          // biome-ignore lint/suspicious/noArrayIndexKey: bars are positions in time, not items
          key={i}
          style={{ flex: 1, maxWidth: spacing[2], height: Math.max(spacing[1], level * height), borderRadius: radius.full, backgroundColor: tint }}
        />
      ))}
    </View>
  );
}
