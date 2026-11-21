// Diya: the red tomato from docs/assets/debo.svg, drawn in code.
import { Animated } from "react-native";
import { Circle, Ellipse, G, Path } from "react-native-svg";
import { FaceFeatures, type FeatureSpec } from "../debo-face-features";
import { type ArtProps, bodyStyle, Layer, lo } from "../debo-face-rig";
import { diyaPaint as c } from "./debo-paint-diya";

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
  eyeL: 88,
  eyeR: 152,
  eyeY: 136,
  eyeRx: 13,
  eyeRy: 16,
  eye,
  lid: c.ink,
  lidWidth: 6,
  browDy: -24,
  browHalf: 14,
  browWidth: 5,
  browColor: c.ink,
  browBase: 0,
  mouthX: 120,
  mouthY: 163,
  mouthScale: 1,
  mouthStroke: 5,
  cheeks: [
    { x: 60, y: 158, rx: 16, ry: 10, color: c.blush, opacity: 0.85 },
    { x: 180, y: 158, rx: 16, ry: 10, color: c.blush, opacity: 0.85 },
  ],
  turn: 0,
  dots: { x: 172, y: 40, color: c.ink },
  sweat: <Path d="M194 86C187 97 185 104 194 111C203 104 201 97 194 86Z" fill={c.sweat} />,
  steam: (
    <>
      <Circle cx={44} cy={58} r={8} fill={c.steam} />
      <Circle cx={196} cy={58} r={8} fill={c.steam} />
      <Circle cx={30} cy={74} r={5} fill={c.steam} />
      <Circle cx={210} cy={74} r={5} fill={c.steam} />
    </>
  ),
  steamOrigin: [120, 56],
  huff: (
    <>
      <Circle cx={92} cy={170} r={5} fill={c.steam} />
      <Circle cx={82} cy={175} r={3.5} fill={c.steam} />
    </>
  ),
  spark: (
    <>
      <Path d="M30 52L33 60L41 63L33 66L30 74L27 66L19 63L27 60Z" fill={c.spark} />
      <Path d="M208 40L210 46L216 48L210 50L208 56L206 50L200 48L206 46Z" fill={c.spark} />
      <Path d="M216 96L218 101L223 103L218 105L216 110L214 105L209 103L214 101Z" fill={c.spark} />
    </>
  ),
  sparkOrigin: [120, 80],
};

export function DiyaArt({ size, rig }: ArtProps) {
  const { v, n, S } = rig;
  return (
    <>
      <Layer size={size}>
        <Ellipse cx={120} cy={226} rx={70} ry={8} fill={c.shadow} opacity={0.14} />
      </Layer>
      <Animated.View pointerEvents="none" style={bodyStyle(rig, size)}>
        <Layer size={size} style={{ opacity: v.pose.puff, transform: [{ scale: n.puffScale }], transformOrigin: lo(200, 156, S) }}>
          <Ellipse cx={206} cy={154} rx={32} ry={34} fill={c.body} />
          <Ellipse cx={212} cy={170} rx={20} ry={18} fill={c.bodyShade} opacity={0.45} />
          <Ellipse cx={200} cy={134} rx={9} ry={5} fill={c.highlight} opacity={0.4} transform="rotate(-30 200 134)" />
        </Layer>
        <Layer size={size}>
          <Path d="M120 66C150 52 204 60 221 118C234 174 190 218 120 218C50 218 6 174 19 118C36 60 90 52 120 66Z" fill={c.body} />
          <Path d="M221 118C234 174 190 218 120 218C62 218 22 188 17 142C40 190 100 200 150 186C196 172 214 150 221 118Z" fill={c.bodyShade} />
          <Ellipse cx={56} cy={112} rx={17} ry={8} fill={c.highlight} opacity={0.4} transform="rotate(-48 56 112)" />
          <Circle cx={45} cy={134} r={4.5} fill={c.highlight} opacity={0.4} />
        </Layer>

        {/* Leaves, left and right, hinged at the stem so they can sway, lift and droop. */}
        <Layer size={size} style={{ transform: [{ rotate: n.leafLRot }], transformOrigin: lo(120, 66, S) }}>
          <G fill={c.leaf}>
            <Path d="M120 66C108 58 84 56 64 70C86 76 106 76 120 66Z" />
            <Path d="M120 66C102 66 82 78 76 96C98 94 114 84 120 66Z" />
          </G>
        </Layer>
        <Layer size={size} style={{ transform: [{ rotate: n.leafRRot }], transformOrigin: lo(120, 66, S) }}>
          <G fill={c.leaf}>
            <Path d="M120 66C132 58 156 56 176 70C154 76 134 76 120 66Z" />
            <Path d="M120 66C138 66 158 78 164 96C142 94 126 84 120 66Z" />
          </G>
        </Layer>
        <Layer size={size}>
          <Path d="M120 70C112 82 114 96 120 104C126 96 128 82 120 70Z" fill={c.leafDark} />
          <Path d="M120 70C119 56 122 46 130 38" fill="none" stroke={c.leafDark} strokeWidth={9} strokeLinecap="round" />
        </Layer>

        <FaceFeatures rig={rig} size={size} spec={spec} />
      </Animated.View>
    </>
  );
}
