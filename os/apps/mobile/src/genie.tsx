// The pieces of the app's soft, pastel look (DESIGN.md, "The app"): the glows behind the
// page, glass cards, pill chips and the feature tiles with their own small drawings. The
// drawings are made here from simple shapes and lucide icons; no picture is copied in.
import type { LucideIcon } from "lucide-react-native";
import { type ReactNode, useEffect, useId, useRef } from "react";
import { Platform, Pressable, StyleSheet, View, type ViewProps, type ViewStyle } from "react-native";
import Svg, { Defs, Path, RadialGradient, Rect, Stop } from "react-native-svg";
import { Text } from "./text";
import { brandShadow, colors, radius, s, spacing, typeSize } from "./ui";

/**
 * Soft pastel glows behind a screen: sky at the top left, lilac at the top right, blush
 * and mint lower down. Drawn as radial gradients, so it is sharp at any size and costs no
 * picture. It never takes a tap and screen readers never see it.
 */
export function Backdrop({ style }: { style?: ViewStyle }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const glows = [
    { key: "a", cx: "8%", cy: "4%", r: "62%", color: colors.glowSky, opacity: 0.95 },
    { key: "b", cx: "96%", cy: "10%", r: "55%", color: colors.glowLilac, opacity: 0.9 },
    { key: "c", cx: "88%", cy: "72%", r: "60%", color: colors.glowBlush, opacity: 0.55 },
    { key: "d", cx: "6%", cy: "88%", r: "55%", color: colors.glowMint, opacity: 0.6 },
  ];
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[StyleSheet.absoluteFill, { backgroundColor: colors.canvas }, style]}
    >
      <Svg width="100%" height="100%">
        <Defs>
          {glows.map((g) => (
            <RadialGradient key={g.key} id={`${id}${g.key}`} cx={g.cx} cy={g.cy} r={g.r} gradientUnits="userSpaceOnUse">
              <Stop offset="0" stopColor={g.color} stopOpacity={g.opacity} />
              <Stop offset="1" stopColor={g.color} stopOpacity={0} />
            </RadialGradient>
          ))}
        </Defs>
        {glows.map((g) => (
          <Rect key={g.key} x="0" y="0" width="100%" height="100%" fill={`url(#${id}${g.key})`} />
        ))}
      </Svg>
    </View>
  );
}

/**
 * A view that blurs what is behind it on the web (a real backdrop blur). Phones have no
 * blur here, so the glass colours are kept nearly solid and text stays crisp.
 */
export function Blurred({ style, blur = 20, ...props }: ViewProps & { blur?: number }) {
  const ref = useRef<View>(null);
  useEffect(() => {
    if (Platform.OS !== "web") return;
    // react-native-web hands back the DOM node. Its style types do not know backdrop-filter.
    const node = ref.current as unknown as HTMLElement | null;
    if (!node?.style) return;
    node.style.setProperty("backdrop-filter", `blur(${blur}px) saturate(1.4)`);
    node.style.setProperty("-webkit-backdrop-filter", `blur(${blur}px) saturate(1.4)`);
  }, [blur]);
  return <View ref={ref} style={style} {...props} />;
}

/** A white glass card: see-through a little, with a soft edge and shadow. */
export function Glass({ children, style }: { children?: ReactNode; style?: ViewStyle | ViewStyle[] }) {
  return (
    <Blurred
      style={[
        {
          backgroundColor: colors.glass,
          borderRadius: radius.page,
          borderWidth: 1,
          borderColor: colors.card,
          boxShadow: brandShadow.card,
        },
        style,
      ]}
    >
      {children}
    </Blurred>
  );
}

/** A small pill that does one thing ("Write entry"). Optional icon on the left. */
export function ChipButton({
  children,
  icon: Icon,
  onPress,
  accessibilityLabel,
  disabled,
  tint,
}: {
  children: string;
  icon?: LucideIcon;
  onPress: () => void;
  accessibilityLabel?: string;
  disabled?: boolean;
  /** A pastel fill instead of white. */
  tint?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: spacing[2],
        minHeight: spacing[11],
        paddingHorizontal: spacing[4],
        borderRadius: radius.full,
        backgroundColor: pressed ? colors.navSoft : (tint ?? colors.card),
        borderWidth: 1,
        borderColor: hovered ? colors.lineStrong : colors.line,
        boxShadow: brandShadow.card,
        opacity: disabled ? 0.5 : 1,
      })}
    >
      {Icon && <Icon size={16} strokeWidth={2} color={colors.text} />}
      <Text numberOfLines={1} style={[s.buttonText, { color: colors.text, fontSize: typeSize.sm, fontWeight: "600" }]}>
        {children}
      </Text>
    </Pressable>
  );
}

// ---- Feature tiles ----

export type TileArtKind = "talk" | "journal" | "ask" | "images" | "people" | "apps";

/** A soft round glow inside a tile, behind its drawing. */
function TileGlow({ color }: { color: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  return (
    <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
      <Defs>
        <RadialGradient id={id} cx="50%" cy="42%" r="55%">
          <Stop offset="0" stopColor={colors.card} stopOpacity={0.7} />
          <Stop offset="0.45" stopColor={color} stopOpacity={0.85} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}

/** A small white card used inside the drawings. */
function Paper({ style, children }: { style?: ViewStyle; children?: ReactNode }) {
  return (
    <View
      style={[
        {
          backgroundColor: colors.card,
          borderRadius: radius.container,
          boxShadow: brandShadow.card,
          padding: spacing[2],
          gap: spacing[1.5],
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
function Line({ width, tone = colors.line }: { width: `${number}%`; tone?: string }) {
  return <View style={{ width, height: spacing[1.5], borderRadius: radius.full, backgroundColor: tone }} />;
}

/** The drawing at the top of a tile. Shapes and icons only, in the tile's own pastel. */
export function TileArt({ kind, tint, icons }: { kind: TileArtKind; tint: string; icons?: LucideIcon[] }) {
  const art = (() => {
    switch (kind) {
      case "talk": {
        // A voice wave on a glass square.
        const bars = [10, 22, 34, 18, 40, 26, 14, 30, 20, 10];
        return (
          <Paper style={{ flexDirection: "row", alignItems: "center", gap: spacing[1], padding: spacing[3] }}>
            {bars.map((h, i) => (
              <View
                key={i}
                style={{ width: spacing[1], height: h, borderRadius: radius.full, backgroundColor: i % 3 === 1 ? colors.nav : colors.text }}
              />
            ))}
          </Paper>
        );
      }
      case "journal":
        // Two pages, one tilted behind the other.
        return (
          <View style={{ width: 96, height: 78 }}>
            <Paper style={{ position: "absolute", left: 4, top: 6, width: 70, height: 64, transform: [{ rotate: "-9deg" }] }}>
              <Line width="70%" />
              <Line width="90%" />
            </Paper>
            <Paper style={{ position: "absolute", left: 24, top: 0, width: 72, height: 74, transform: [{ rotate: "5deg" }] }}>
              <Line width="55%" tone={colors.text} />
              <Line width="95%" />
              <Line width="85%" />
              <Line width="65%" />
            </Paper>
          </View>
        );
      case "ask":
        // A question bubble with a short answer and its source chip.
        return (
          <View style={{ width: 112, gap: spacing[1.5] }}>
            <Paper style={{ alignSelf: "flex-end", width: 72, borderBottomRightRadius: spacing[1] }}>
              <Line width="90%" tone={colors.text} />
              <Line width="60%" />
            </Paper>
            <Paper style={{ width: 92, borderBottomLeftRadius: spacing[1] }}>
              <Line width="95%" />
              <Line width="75%" />
              <View style={{ width: "55%", height: spacing[3], borderRadius: radius.full, backgroundColor: colors.green }} />
            </Paper>
          </View>
        );
      case "images":
        // A framed picture: sun and two hills.
        return (
          <Paper style={{ width: 104, height: 80, padding: spacing[1.5], transform: [{ rotate: "-4deg" }] }}>
            <View style={{ flex: 1, borderRadius: radius.inner, overflow: "hidden", backgroundColor: colors.sky }}>
              <View style={{ position: "absolute", right: 14, top: 10, width: 16, height: 16, borderRadius: radius.full, backgroundColor: colors.yellow, borderWidth: 3, borderColor: colors.card }} />
              <Svg width="100%" height="100%" viewBox="0 0 100 64" preserveAspectRatio="none" style={StyleSheet.absoluteFill}>
                <Path d="M0 64 L0 44 Q22 22 46 42 T100 36 L100 64 Z" fill={colors.mint} />
                <Path d="M0 64 L0 54 Q30 38 62 52 T100 50 L100 64 Z" fill={colors.glowMint} />
              </Svg>
            </View>
          </Paper>
        );
      case "people": {
        const [A, B, C] = icons ?? [];
        const dots = [
          { Icon: A, bg: colors.yellow, x: 0, y: 14 },
          { Icon: B, bg: colors.pink, x: 34, y: 0 },
          { Icon: C, bg: colors.sky, x: 68, y: 14 },
        ];
        return (
          <View style={{ width: 120, height: 66 }}>
            {dots.map(({ Icon, bg, x, y }, i) => (
              <View
                key={i}
                style={{
                  position: "absolute",
                  left: x,
                  top: y,
                  width: 52,
                  height: 52,
                  borderRadius: radius.full,
                  backgroundColor: bg,
                  borderWidth: 3,
                  borderColor: colors.card,
                  boxShadow: brandShadow.card,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {Icon && <Icon size={22} strokeWidth={1.8} color={colors.text} />}
              </View>
            ))}
          </View>
        );
      }
      case "apps":
        return (
          <View style={{ flexDirection: "row", flexWrap: "wrap", width: 92, gap: spacing[2] }}>
            {(icons ?? []).slice(0, 4).map((Icon, i) => (
              <Paper key={i} style={{ width: 42, height: 42, padding: 0, alignItems: "center", justifyContent: "center", transform: [{ rotate: i % 2 ? "4deg" : "-4deg" }] }}>
                <Icon size={18} strokeWidth={1.8} color={colors.text} />
              </Paper>
            ))}
          </View>
        );
    }
  })();
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ flex: 1, alignItems: "center", justifyContent: "center", overflow: "hidden", borderRadius: radius.page }}
    >
      <TileGlow color={tint} />
      {art}
    </View>
  );
}

/**
 * A large rounded feature tile: a pastel fill, a small drawing, and a white icon chip with
 * the label underneath. The whole tile is one button.
 */
export function Tile({
  label,
  detail,
  icon: Icon,
  tint,
  art,
  artIcons,
  onPress,
  height = 176,
}: {
  label: string;
  /** Read out with the label, not shown, so the tile stays calm. */
  detail?: string;
  icon: LucideIcon;
  tint: string;
  art: TileArtKind;
  artIcons?: LucideIcon[];
  onPress: () => void;
  height?: number;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={detail ? `${label}. ${detail}` : label}
      onPress={onPress}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({
        height,
        borderRadius: radius.page,
        backgroundColor: tint,
        padding: spacing[2],
        boxShadow: hovered ? brandShadow.raised : brandShadow.card,
        borderWidth: 1,
        borderColor: colors.card,
        transform: [{ scale: pressed ? 0.98 : 1 }],
      })}
    >
      <TileArt kind={art} tint={tint} icons={artIcons} />
      <View style={[s.row, { gap: spacing[2], padding: spacing[1.5] }]}>
        <View
          style={{
            width: spacing[9],
            height: spacing[9],
            borderRadius: radius.full,
            backgroundColor: colors.card,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon size={18} strokeWidth={2} color={colors.text} />
        </View>
        <Text numberOfLines={2} style={{ flex: 1, color: colors.text, fontSize: typeSize.md, lineHeight: spacing[5], fontWeight: "700" }}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}
