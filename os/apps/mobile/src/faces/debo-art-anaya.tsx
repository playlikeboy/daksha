// Anaya: a warm young woman of about twenty, in a friendly flat cartoon style.
// Head and shoulders. A big head and a few simple features keep her charming rather
// than uncanny. Long dark hair with a side fringe, a small marigold clip, and a teal
// kurta with a cream collar.
//
// Her head and her shoulders move apart: the head tilts, hops and turns on the neck
// while the shoulders only breathe. Her two front locks of hair are the "loose parts"
// that sway, lift and flick.
import { Animated } from "react-native";
import { Circle, Ellipse, G, Path } from "react-native-svg";
import { FaceFeatures, type FeatureSpec } from "../debo-face-features";
import { type ArtProps, bodyStyle, Layer, lo, scale } from "../debo-face-rig";
import { anayaPaint as c } from "./debo-paint-anaya";

const eye = (cx: number, cy: number) => {
  const side = cx < 120 ? -1 : 1; // the outer corner points away from the nose
  return (
    <>
      <Ellipse cx={cx} cy={cy} rx={11} ry={14} fill={c.iris} />
      <Circle cx={cx + 4} cy={cy - 5} r={4.8} fill={c.highlight} />
      <Circle cx={cx - 3} cy={cy + 5} r={2} fill={c.highlight} />
      <Path
        d={`M${cx - 12} ${cy - 5}Q${cx} ${cy - 19} ${cx + 12} ${cy - 5}M${cx + 12 * side} ${cy - 6}L${cx + 16.5 * side} ${cy - 10}`}
        fill="none"
        stroke={c.lash}
        strokeWidth={3.6}
        strokeLinecap="round"
      />
    </>
  );
};

const spec: FeatureSpec = {
  ink: c.lip,
  mouthInside: c.mouthInside,
  tongue: c.tongue,
  eyeL: 94,
  eyeR: 146,
  eyeY: 112,
  eyeRx: 11,
  eyeRy: 14,
  eye,
  lid: c.lash,
  lidWidth: 4,
  browDy: -24,
  browHalf: 11,
  browWidth: 3.6,
  browColor: c.hair,
  browBase: 0.8,
  mouthX: 120,
  mouthY: 141,
  mouthScale: 0.82,
  mouthStroke: 4,
  cheeks: [
    { x: 85, y: 132, rx: 10, ry: 7, color: c.blush, opacity: 0.55 },
    { x: 155, y: 132, rx: 10, ry: 7, color: c.blush, opacity: 0.55 },
  ],
  fixtures: <Path d="M116 127Q120 132 124 127" fill="none" stroke={c.skinShade} strokeWidth={2.6} strokeLinecap="round" />,
  turn: 1,
  dots: { x: 188, y: 40, color: c.dots },
  sweat: <Path d="M208 92C201 103 199 110 208 117C217 110 215 103 208 92Z" fill={c.sweat} />,
  steam: (
    <>
      <Circle cx={44} cy={46} r={8} fill={c.steam} />
      <Circle cx={196} cy={46} r={8} fill={c.steam} />
      <Circle cx={30} cy={64} r={5} fill={c.steam} />
      <Circle cx={210} cy={64} r={5} fill={c.steam} />
    </>
  ),
  steamOrigin: [120, 50],
  huff: (
    <>
      <Circle cx={92} cy={150} r={4.5} fill={c.highlight} opacity={0.9} />
      <Circle cx={83} cy={155} r={3} fill={c.highlight} opacity={0.9} />
    </>
  ),
  spark: (
    <>
      <Path d="M26 52L29 60L37 63L29 66L26 74L23 66L15 63L23 60Z" fill={c.spark} />
      <Path d="M210 34L212 40L218 42L212 44L210 50L208 44L202 42L208 40Z" fill={c.spark} />
      <Path d="M220 92L222 97L227 99L222 101L220 106L218 101L213 99L218 97Z" fill={c.spark} />
    </>
  ),
  sparkOrigin: [120, 70],
};

export function AnayaArt({ size, rig }: ArtProps) {
  const { v, n, S } = rig;
  // The head turns on the neck, so it pivots low, at the base of the neck.
  const head = bodyStyle(rig, size, 120, 176);
  const shoulders = {
    position: "absolute" as const,
    left: 0,
    top: 0,
    width: size,
    height: size,
    transform: [{ translateY: Animated.add(scale(v.breath, -1.2 * S), scale(v.hop, -3 * S)) }],
  };
  return (
    <>
      <Layer size={size}>
        <Ellipse cx={120} cy={230} rx={78} ry={7} fill={c.shadow} opacity={0.12} />
      </Layer>

      {/* Long hair behind her shoulders. */}
      <Animated.View pointerEvents="none" style={head}>
        <Layer size={size}>
          <Path d="M120 22C66 22 42 68 42 118C42 160 34 190 46 216L194 216C206 190 198 160 198 118C198 68 174 22 120 22Z" fill={c.hair} />
        </Layer>
      </Animated.View>

      {/* Shoulders and kurta. */}
      <Animated.View pointerEvents="none" style={shoulders}>
        <Layer size={size}>
          <Path d="M104 150L104 182Q120 202 136 182L136 150Z" fill={c.skinShade} />
          <Path d="M26 238C26 206 60 190 92 184Q120 208 148 184C180 190 214 206 214 238Q120 250 26 238Z" fill={c.kurta} />
          <Path d="M92 184Q120 208 148 184" fill="none" stroke={c.trim} strokeWidth={6} strokeLinecap="round" />
        </Layer>
      </Animated.View>

      {/* Head, in front of the shoulders. */}
      <Animated.View pointerEvents="none" style={head}>
        <Layer size={size}>
          <Path d="M120 42C160 42 176 76 176 108C176 142 152 166 120 166C88 166 64 142 64 108C64 76 80 42 120 42Z" fill={c.skin} />
          <Path d="M72 134C82 156 100 166 120 166C140 166 158 156 168 134C156 152 138 158 120 158C102 158 84 152 72 134Z" fill={c.skinShade} opacity={0.35} />
        </Layer>

        {/* The fringe: swept across the forehead from a side parting. */}
        <Layer size={size}>
          <Path d="M58 118C50 62 80 26 122 26C166 26 192 62 182 118C178 96 168 76 150 66C136 78 110 82 92 80C78 90 66 102 58 118Z" fill={c.hair} />
        </Layer>

        {/* Two front locks beside her face. They sway, lift and flick. */}
        <Layer size={size} style={{ transform: [{ rotate: n.leafLRot }], transformOrigin: lo(66, 100, S) }}>
          <Path d="M66 96C52 126 50 158 58 190C70 174 76 140 74 100Z" fill={c.hair} />
        </Layer>
        <Layer size={size} style={{ transform: [{ rotate: n.leafRRot }], transformOrigin: lo(174, 100, S) }}>
          <Path d="M174 96C188 126 190 158 182 190C170 174 164 140 166 100Z" fill={c.hair} />
        </Layer>

        {/* A small marigold clip. */}
        <Layer size={size}>
          <G fill={c.petal}>
            <Circle cx={160} cy={54} r={5} />
            <Circle cx={169} cy={60} r={5} />
            <Circle cx={166} cy={70} r={5} />
            <Circle cx={155} cy={70} r={5} />
            <Circle cx={152} cy={60} r={5} />
          </G>
          <Circle cx={160} cy={62} r={3.6} fill={c.petalCentre} />
        </Layer>

        <FaceFeatures rig={rig} size={size} spec={spec} />
      </Animated.View>
    </>
  );
}
