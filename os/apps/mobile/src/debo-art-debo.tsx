// Debo: a small, round, soft blue creature with two little ears and a pale tummy.
// Not a tomato, not a person: just a friendly something. Very few shapes, so it
// still reads at 24 px.
import { Animated } from "react-native";
import { Circle, Ellipse, Path } from "react-native-svg";
import { FaceFeatures, type FeatureSpec } from "./debo-face-features";
import { type ArtProps, bodyStyle, Layer, lo } from "./debo-face-rig";
import { deboPaint as c } from "./debo-paint-debo";

const eye = (cx: number, cy: number) => (
  <>
    <Ellipse cx={cx} cy={cy} rx={14} ry={17} fill={c.ink} />
    <Circle cx={cx + 5} cy={cy - 7} r={5.5} fill={c.highlight} />
    <Circle cx={cx - 4} cy={cy + 6} r={2.4} fill={c.highlight} />
  </>
);

const spec: FeatureSpec = {
  ink: c.ink,
  mouthInside: c.mouthInside,
  tongue: c.tongue,
  eyeL: 88,
  eyeR: 152,
  eyeY: 126,
  eyeRx: 14,
  eyeRy: 17,
  eye,
  lid: c.ink,
  lidWidth: 6,
  browDy: -26,
  browHalf: 13,
  browWidth: 5,
  browColor: c.ink,
  browBase: 0,
  mouthX: 120,
  mouthY: 156,
  mouthScale: 0.9,
  mouthStroke: 5,
  cheeks: [
    { x: 58, y: 150, rx: 15, ry: 9, color: c.blush, opacity: 0.9 },
    { x: 182, y: 150, rx: 15, ry: 9, color: c.blush, opacity: 0.9 },
  ],
  turn: 0.5,
  dots: { x: 176, y: 36, color: c.ink },
  sweat: <Path d="M214 76C207 87 205 94 214 101C223 94 221 87 214 76Z" fill={c.sweat} />,
  steam: (
    <>
      <Circle cx={36} cy={72} r={8} fill={c.steam} />
      <Circle cx={204} cy={72} r={8} fill={c.steam} />
      <Circle cx={22} cy={88} r={5} fill={c.steam} />
      <Circle cx={218} cy={88} r={5} fill={c.steam} />
    </>
  ),
  steamOrigin: [120, 70],
  huff: (
    <>
      <Circle cx={88} cy={164} r={5} fill={c.steam} />
      <Circle cx={78} cy={169} r={3.5} fill={c.steam} />
    </>
  ),
  spark: (
    <>
      <Path d="M26 56L29 64L37 67L29 70L26 78L23 70L15 67L23 64Z" fill={c.spark} />
      <Path d="M210 38L212 44L218 46L212 48L210 54L208 48L202 46L208 44Z" fill={c.spark} />
      <Path d="M220 100L222 105L227 107L222 109L220 114L218 109L213 107L218 105Z" fill={c.spark} />
    </>
  ),
  sparkOrigin: [120, 80],
};

export function DeboArt({ size, rig }: ArtProps) {
  const { v, n, S } = rig;
  return (
    <>
      <Layer size={size}>
        <Ellipse cx={120} cy={226} rx={72} ry={8} fill={c.shadow} opacity={0.14} />
      </Layer>
      <Animated.View pointerEvents="none" style={bodyStyle(rig, size)}>
        {/* A puffed cheek, for the pretend sulk. */}
        <Layer size={size} style={{ opacity: v.pose.puff, transform: [{ scale: n.puffScale }], transformOrigin: lo(200, 156, S) }}>
          <Ellipse cx={204} cy={156} rx={30} ry={32} fill={c.body} />
          <Ellipse cx={210} cy={172} rx={18} ry={16} fill={c.bodyShade} opacity={0.45} />
        </Layer>
        {/* Two stubby feet peek out under the body. */}
        <Layer size={size}>
          <Ellipse cx={86} cy={214} rx={20} ry={11} fill={c.bodyShade} />
          <Ellipse cx={154} cy={214} rx={20} ry={11} fill={c.bodyShade} />
        </Layer>
        {/* Ears, hinged at the head so they can sway, perk up and droop. */}
        <Layer size={size} style={{ transform: [{ rotate: n.leafLRot }], transformOrigin: lo(74, 86, S) }}>
          <Ellipse cx={66} cy={68} rx={19} ry={25} fill={c.body} transform="rotate(-22 66 68)" />
          <Ellipse cx={67} cy={70} rx={9} ry={14} fill={c.earInner} transform="rotate(-22 67 70)" />
        </Layer>
        <Layer size={size} style={{ transform: [{ rotate: n.leafRRot }], transformOrigin: lo(166, 86, S) }}>
          <Ellipse cx={174} cy={68} rx={19} ry={25} fill={c.body} transform="rotate(22 174 68)" />
          <Ellipse cx={173} cy={70} rx={9} ry={14} fill={c.earInner} transform="rotate(22 173 70)" />
        </Layer>
        <Layer size={size}>
          <Path d="M120 52C176 52 216 92 216 140C216 190 176 218 120 218C64 218 24 190 24 140C24 92 64 52 120 52Z" fill={c.body} />
          <Path d="M216 140C216 190 176 218 120 218C70 218 34 196 25 156C52 192 104 200 152 188C192 178 212 162 216 140Z" fill={c.bodyShade} />
          <Ellipse cx={120} cy={198} rx={48} ry={20} fill={c.belly} opacity={0.9} />
          <Ellipse cx={70} cy={92} rx={20} ry={8} fill={c.highlight} opacity={0.4} transform="rotate(-38 70 92)" />
          <Path d="M118 54C112 40 124 32 132 40" fill="none" stroke={c.bodyShade} strokeWidth={7} strokeLinecap="round" />
        </Layer>
        <FaceFeatures rig={rig} size={size} spec={spec} />
      </Animated.View>
    </>
  );
}
