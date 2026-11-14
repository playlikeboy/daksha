// Mishti: a small, round, orange cat with pointed ears, soft stripes and whiskers.
import { Animated } from "react-native";
import { Circle, Ellipse, Path } from "react-native-svg";
import { FaceFeatures, type FeatureSpec } from "./debo-face-features";
import { type ArtProps, bodyStyle, Layer, lo } from "./debo-face-rig";
import { mishtiPaint as c } from "./debo-paint-mishti";

const eye = (cx: number, cy: number) => (
  <>
    <Ellipse cx={cx} cy={cy} rx={13} ry={16} fill={c.ink} />
    <Circle cx={cx + 5} cy={cy - 6} r={5} fill={c.highlight} />
    <Circle cx={cx - 4} cy={cy + 6} r={2.2} fill={c.highlight} />
  </>
);

const spec: FeatureSpec = {
  ink: c.ink,
  mouthInside: c.mouthInside,
  tongue: c.tongue,
  eyeL: 82,
  eyeR: 158,
  eyeY: 128,
  eyeRx: 13,
  eyeRy: 16,
  eye,
  lid: c.ink,
  lidWidth: 6,
  browDy: -25,
  browHalf: 13,
  browWidth: 5,
  browColor: c.ink,
  browBase: 0,
  mouthX: 120,
  mouthY: 172,
  mouthScale: 0.78,
  mouthStroke: 4.5,
  cheeks: [
    { x: 50, y: 154, rx: 14, ry: 9, color: c.blush, opacity: 0.8 },
    { x: 190, y: 154, rx: 14, ry: 9, color: c.blush, opacity: 0.8 },
  ],
  turn: 0.6,
  dots: { x: 176, y: 34, color: c.ink },
  sweat: <Path d="M206 92C199 103 197 110 206 117C215 110 213 103 206 92Z" fill={c.sweat} />,
  steam: (
    <>
      <Circle cx={30} cy={84} r={8} fill={c.steam} />
      <Circle cx={210} cy={84} r={8} fill={c.steam} />
      <Circle cx={16} cy={100} r={5} fill={c.steam} />
      <Circle cx={224} cy={100} r={5} fill={c.steam} />
    </>
  ),
  steamOrigin: [120, 80],
  huff: (
    <>
      <Circle cx={92} cy={182} r={5} fill={c.steam} />
      <Circle cx={82} cy={187} r={3.5} fill={c.steam} />
    </>
  ),
  spark: (
    <>
      <Path d="M24 56L27 64L35 67L27 70L24 78L21 70L13 67L21 64Z" fill={c.spark} />
      <Path d="M212 40L214 46L220 48L214 50L212 56L210 50L204 48L210 46Z" fill={c.spark} />
      <Path d="M222 104L224 109L229 111L224 113L222 118L220 113L215 111L220 109Z" fill={c.spark} />
    </>
  ),
  sparkOrigin: [120, 90],
};

export function MishtiArt({ size, rig }: ArtProps) {
  const { v, n, S } = rig;
  return (
    <>
      <Layer size={size}>
        <Ellipse cx={120} cy={226} rx={74} ry={8} fill={c.shadow} opacity={0.14} />
      </Layer>
      <Animated.View pointerEvents="none" style={bodyStyle(rig, size)}>
        <Layer size={size} style={{ opacity: v.pose.puff, transform: [{ scale: n.puffScale }], transformOrigin: lo(204, 160, S) }}>
          <Ellipse cx={208} cy={160} rx={30} ry={32} fill={c.fur} />
          <Ellipse cx={212} cy={176} rx={18} ry={16} fill={c.furShade} opacity={0.45} />
        </Layer>
        {/* Ears, hinged at the head so they twitch, perk up and fold back. */}
        <Layer size={size} style={{ transform: [{ rotate: n.leafLRot }], transformOrigin: lo(74, 84, S) }}>
          <Path d="M40 104L50 38L108 68Z" fill={c.fur} stroke={c.fur} strokeWidth={12} strokeLinejoin="round" />
          <Path d="M54 90L58 56L88 72Z" fill={c.earInner} stroke={c.earInner} strokeWidth={6} strokeLinejoin="round" />
        </Layer>
        <Layer size={size} style={{ transform: [{ rotate: n.leafRRot }], transformOrigin: lo(166, 84, S) }}>
          <Path d="M200 104L190 38L132 68Z" fill={c.fur} stroke={c.fur} strokeWidth={12} strokeLinejoin="round" />
          <Path d="M186 90L182 56L152 72Z" fill={c.earInner} stroke={c.earInner} strokeWidth={6} strokeLinejoin="round" />
        </Layer>
        <Layer size={size}>
          <Path d="M120 58C182 54 224 92 226 142C228 194 184 220 120 220C56 220 12 194 14 142C16 92 58 54 120 58Z" fill={c.fur} />
          <Path d="M226 142C228 194 184 220 120 220C66 220 26 200 16 160C48 196 108 204 156 192C200 182 222 166 226 142Z" fill={c.furShade} />
          <Path d="M104 66L106 86M120 62L120 90M136 66L134 86" fill="none" stroke={c.stripe} strokeWidth={6} strokeLinecap="round" />
          <Path d="M20 138L38 142M20 154L38 152M220 138L202 142M220 154L202 152" fill="none" stroke={c.stripe} strokeWidth={5} strokeLinecap="round" />
          <Ellipse cx={116} cy={168} rx={42} ry={27} fill={c.muzzle} />
          <Ellipse cx={124} cy={168} rx={42} ry={27} fill={c.muzzle} />
          <Ellipse cx={60} cy={100} rx={14} ry={7} fill={c.highlight} opacity={0.35} transform="rotate(-40 60 100)" />
          <Path d="M110 152H130L120 163Z" fill={c.nose} stroke={c.nose} strokeWidth={4} strokeLinejoin="round" />
          <Path d="M82 164L44 154M82 170L42 172M82 176L48 190M158 164L196 154M158 170L198 172M158 176L192 190" fill="none" stroke={c.whisker} strokeWidth={2.5} strokeLinecap="round" opacity={0.75} />
        </Layer>
        <FaceFeatures rig={rig} size={size} spec={spec} />
      </Animated.View>
    </>
  );
}
