import { useEffect, useRef } from "react";
import { Animated, Easing, Platform, View } from "react-native";
import { duration } from "./astryx-tokens";
import { useAssistantName } from "./debo-character-store";
import { useReducedMotion } from "./debo-face";
import { colors, radius, s, spacing } from "./ui";

/**
 * Three dots in a reply bubble while the assistant works. Each dot rises and darkens in
 * turn. With reduce motion on they hold still at three shades, which still reads as "busy".
 */
export function TypingDots() {
  const name = useAssistantName();
  const reduceMotion = useReducedMotion();
  const phase = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(
      Animated.timing(phase, {
        toValue: 1,
        duration: duration.slow * 2,
        easing: Easing.linear,
        useNativeDriver: Platform.OS !== "web",
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [phase, reduceMotion]);
  return (
    <View
      accessible
      accessibilityLabel={`${name} is working on a reply`}
      style={[
        s.row,
        {
          alignSelf: "flex-start",
          gap: spacing[1.5],
          paddingHorizontal: spacing[5],
          paddingVertical: spacing[4],
          backgroundColor: colors.subtle,
          borderRadius: radius.chat,
        },
      ]}
    >
      {[0, 1, 2].map((index) => {
        // Each dot peaks a third of the loop after the one before it.
        const start = index / 3;
        const range = [0, start, start + 1 / 6, start + 1 / 3, 1];
        const opacity = reduceMotion
          ? [0.4, 0.75, 0.5][index]
          : phase.interpolate({ inputRange: range, outputRange: [0.35, 0.35, 1, 0.35, 0.35] });
        const translateY = reduceMotion
          ? 0
          : phase.interpolate({ inputRange: range, outputRange: [0, 0, -spacing[1], 0, 0] });
        return (
          <Animated.View
            key={index}
            style={{
              width: spacing[2],
              height: spacing[2],
              borderRadius: radius.full,
              backgroundColor: colors.muted,
              opacity,
              transform: [{ translateY }],
            }}
          />
        );
      })}
    </View>
  );
}
