// Daksha: a small, round, soft blue blob with two round ears. Not a tomato, not a person:
// just a friendly something, drawn like a sticker. Flat shapes only, no outlines and no
// shading lines: one body, two ears, one soft shine. The face does the rest, so it still
// reads at 24 px.
import { Animated } from "react-native";
import { Circle, Ellipse, Path } from "react-native-svg";
import { FaceFeatures, type FeatureSpec } from "./debo-face-features";
import { type ArtProps, bodyStyle, Layer, lo } from "./debo-face-rig";
import { deboPaint as c } from "./debo-paint-debo";

/** Big glossy eyes with one shine each. */
const eye = (cx: number, cy: number) => (
  <>
    <Ellipse cx={cx} cy={cy} rx={15} ry={18} fill={c.ink} />
    <Circle cx={cx + 5} cy={cy - 7} r={6} fill={c.highlight} />
  </>
);

const spec: FeatureSpec = {
  ink: c.ink,
  mouthInside: c.mouthInside,
  tongue: c.tongue,
  eyeL: 84,
  eyeR: 156,
  eyeY: 138,
  eyeRx: 15,
  eyeRy: 18,
  eye,
  lid: c.ink,
  lidWidth: 6,
  browDy: -28,
  browHalf: 12,
  browWidth: 5.5,
  browColor: c.ink,
  browBase: 0,
  mouthX: 120,
  mouthY: 164,
  mouthScale: 0.85,
  mouthStroke: 5,
  cheeks: [
    { x: 58, y: 164, rx: 15, ry: 10, color: c.blush, opacity: 1 },
    { x: 182, y: 164, rx: 15, ry: 10, color: c.blush, opacity: 1 },
  ],
  turn: 0.5,
  dots: { x: 178, y: 40, color: c.ink },
  sweat: <Path d="M210 82C203 93 201 100 210 107C219 100 217 93 210 82Z" fill={c.sweat} />,
  steam: (
    <>
      <Circle cx={36} cy={74} r={8} fill={c.steam} />
      <Circle cx={204} cy={74} r={8} fill={c.steam} />
      <Circle cx={22} cy={90} r={5} fill={c.steam} />
      <Circle cx={218} cy={90} r={5} fill={c.steam} />
    </>
  ),
  steamOrigin: [120, 72],
  huff: (
    <>
      <Circle cx={92} cy={172} r={5} fill={c.steam} />
      <Circle cx={82} cy={177} r={3.5} fill={c.steam} />
    </>
  ),
  spark: (
    <>
      <Path d="M26 60L29 68L37 71L29 74L26 82L23 74L15 71L23 68Z" fill={c.spark} />
      <Path d="M210 42L212 48L218 50L212 52L210 58L208 52L202 50L208 48Z" fill={c.spark} />
      <Path d="M220 104L222 109L227 111L222 113L220 118L218 113L213 111L218 109Z" fill={c.spark} />
    </>
  ),
  sparkOrigin: [120, 84],
};

/** One round ear. The inner dot is the same blue, a touch deeper, so it stays quiet. */
const ear = (cx: number) => (
  <>
    <Circle cx={cx} cy={74} r={22} fill={c.body} />
    <Circle cx={cx} cy={76} r={11} fill={c.earInner} />
  </>
);

export function DeboArt({ size, rig }: ArtProps) {
  const { v, n, S } = rig;
  return (
    <>
      <Layer size={size}>
        <Ellipse cx={120} cy={224} rx={64} ry={7} fill={c.shadow} opacity={0.1} />
      </Layer>
      <Animated.View pointerEvents="none" style={bodyStyle(rig, size)}>
        {/* A puffed cheek, for the pretend sulk. It grows out of the body's side. */}
        <Layer size={size} style={{ opacity: v.pose.puff, transform: [{ scale: n.puffScale }], transformOrigin: lo(196, 166, S) }}>
          <Circle cx={198} cy={166} r={26} fill={c.body} />
        </Layer>
        {/* Ears, hinged at the head so they can sway, perk up and droop. */}
        <Layer size={size} style={{ transform: [{ rotate: n.leafLRot }], transformOrigin: lo(76, 92, S) }}>
          {ear(70)}
        </Layer>
        <Layer size={size} style={{ transform: [{ rotate: n.leafRRot }], transformOrigin: lo(164, 92, S) }}>
          {ear(170)}
        </Layer>
        <Layer size={size}>
          <Path d="M120 56C180 56 214 100 214 152C214 198 174 218 120 218C66 218 26 198 26 152C26 100 60 56 120 56Z" fill={c.body} />
          <Ellipse cx={64} cy={98} rx={15} ry={8} fill={c.highlight} opacity={0.35} transform="rotate(-50 64 98)" />
        </Layer>
        <FaceFeatures rig={rig} size={size} spec={spec} />
      </Animated.View>
    </>
  );
}
