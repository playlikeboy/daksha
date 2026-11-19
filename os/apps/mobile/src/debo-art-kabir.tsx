// Kabir: a friendly young man of about twenty-one, drawn in the same simple flat style
// as Daksha. Head and shoulders, a big round head, short dark hair with a soft side-swept
// fringe, and a mustard hoodie. Flat shapes only: no outlines, no shading lines, one soft
// shine on the hair. Big glossy eyes with one shine each, so he still reads at 24 px.
//
// Like Anaya, his head and shoulders move apart: the head tilts, hops and turns on the
// neck while the shoulders only breathe. His loose parts are two little tufts of hair on
// top, which sway, perk up, droop and flick.
import { Animated } from "react-native";
import { Circle, Ellipse, Path } from "react-native-svg";
import { FaceFeatures, type FeatureSpec } from "./debo-face-features";
import { type ArtProps, bodyStyle, Layer, lo, scale } from "./debo-face-rig";
import { kabirPaint as c } from "./debo-paint-kabir";

/** Big glossy eyes with one shine each, like Daksha's. */
const eye = (cx: number, cy: number) => (
  <>
    <Ellipse cx={cx} cy={cy} rx={13} ry={16} fill={c.ink} />
    <Circle cx={cx + 4.5} cy={cy - 6.5} r={5.4} fill={c.highlight} />
  </>
);

const spec: FeatureSpec = {
  ink: c.mouth,
  mouthInside: c.mouthInside,
  tongue: c.tongue,
  eyeL: 94,
  eyeR: 146,
  eyeY: 124,
  eyeRx: 13,
  eyeRy: 16,
  eye,
  lid: c.ink,
  lidWidth: 4.5,
  browDy: -24,
  browHalf: 11,
  browWidth: 4.5,
  browColor: c.hair,
  browBase: 0.85,
  mouthX: 120,
  mouthY: 150,
  mouthScale: 0.8,
  mouthStroke: 4.5,
  cheeks: [
    { x: 82, y: 144, rx: 11, ry: 7, color: c.blush, opacity: 0.5 },
    { x: 158, y: 144, rx: 11, ry: 7, color: c.blush, opacity: 0.5 },
  ],
  fixtures: <Path d="M116.5 137Q120 140.5 123.5 137" fill="none" stroke={c.skinShade} strokeWidth={2.6} strokeLinecap="round" />,
  turn: 1,
  dots: { x: 188, y: 40, color: c.ink },
  sweat: <Path d="M204 92C197 103 195 110 204 117C213 110 211 103 204 92Z" fill={c.sweat} />,
  steam: (
    <>
      <Circle cx={44} cy={50} r={8} fill={c.steam} />
      <Circle cx={196} cy={50} r={8} fill={c.steam} />
      <Circle cx={30} cy={68} r={5} fill={c.steam} />
      <Circle cx={210} cy={68} r={5} fill={c.steam} />
    </>
  ),
  steamOrigin: [120, 52],
  huff: (
    <>
      <Circle cx={92} cy={158} r={4.5} fill={c.highlight} opacity={0.9} />
      <Circle cx={83} cy={163} r={3} fill={c.highlight} opacity={0.9} />
    </>
  ),
  spark: (
    <>
      <Path d="M26 56L29 64L37 67L29 70L26 78L23 70L15 67L23 64Z" fill={c.spark} />
      <Path d="M210 38L212 44L218 46L212 48L210 54L208 48L202 46L208 44Z" fill={c.spark} />
      <Path d="M220 96L222 101L227 103L222 105L220 110L218 105L213 103L218 101Z" fill={c.spark} />
    </>
  ),
  sparkOrigin: [120, 74],
};

export function KabirArt({ size, rig }: ArtProps) {
  const { v, n, S } = rig;
  // The head turns on the neck, so it pivots low, at the base of the neck.
  const head = bodyStyle(rig, size, 120, 178);
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

      {/* Neck, hoodie and the hood lying around the neck. */}
      <Animated.View pointerEvents="none" style={shoulders}>
        <Layer size={size}>
          <Path d="M106 150L106 186Q120 200 134 186L134 150Z" fill={c.skinShade} />
          <Path d="M28 238C28 206 62 192 94 186Q120 206 146 186C178 192 212 206 212 238Q120 250 28 238Z" fill={c.hoodie} />
          <Path d="M80 190C88 178 100 176 106 184Q120 202 134 184C140 176 152 178 160 190Q120 224 80 190Z" fill={c.hoodieShade} />
        </Layer>
      </Animated.View>

      {/* Head, in front of the shoulders. */}
      <Animated.View pointerEvents="none" style={head}>
        {/* A puffed cheek, for the pretend sulk. It grows out of the side of his face. */}
        <Layer size={size} style={{ opacity: v.pose.puff, transform: [{ scale: n.puffScale }], transformOrigin: lo(160, 146, S) }}>
          <Circle cx={162} cy={146} r={14} fill={c.skin} />
        </Layer>

        <Layer size={size}>
          <Circle cx={64} cy={124} r={12} fill={c.skin} />
          <Circle cx={176} cy={124} r={12} fill={c.skin} />
          <Circle cx={64} cy={125} r={5.5} fill={c.skinShade} opacity={0.5} />
          <Circle cx={176} cy={125} r={5.5} fill={c.skinShade} opacity={0.5} />
          <Path d="M120 48C160 48 178 80 178 116C178 150 154 172 120 172C86 172 62 150 62 116C62 80 80 48 120 48Z" fill={c.skin} />
        </Layer>

        {/* Two little tufts on top. They sway, perk up, droop and flick. */}
        <Layer size={size} style={{ transform: [{ rotate: n.leafLRot }], transformOrigin: lo(112, 38, S) }}>
          <Path d="M104 40C98 26 104 14 118 8C113 20 115 30 122 40Z" fill={c.hair} />
        </Layer>
        <Layer size={size} style={{ transform: [{ rotate: n.leafRRot }], transformOrigin: lo(128, 38, S) }}>
          <Path d="M120 40C124 28 132 20 146 18C138 26 136 34 136 42Z" fill={c.hair} />
        </Layer>

        {/* Short hair with a soft fringe swept to one side, and one soft shine. */}
        <Layer size={size}>
          <Path d="M60 118C50 66 80 34 122 34C166 34 192 66 180 118C178 98 170 84 158 74C150 86 134 90 118 86C110 92 96 94 84 92C74 98 64 106 60 118Z" fill={c.hair} />
          <Ellipse cx={92} cy={52} rx={14} ry={6} fill={c.highlight} opacity={0.18} transform="rotate(-28 92 52)" />
        </Layer>

        <FaceFeatures rig={rig} size={size} spec={spec} />
      </Animated.View>
    </>
  );
}
