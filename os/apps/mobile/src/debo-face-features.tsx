// The parts of a face that every character has: cheeks, eyes, brows, mouths, and the
// little extras (thinking dots, sweat, steam, a huff of breath, sparkles).
//
// A character does not redraw these. It hands over a `FeatureSpec`: where its eyes and
// mouth sit, what an open eye looks like, how big the mouth is, and its own extras.
// This file turns that into animated layers driven by the rig's numbers, so a mood
// looks the same in spirit on every character and only the style differs.
import type { ReactNode } from "react";
import { Animated } from "react-native";
import { Ellipse, Path } from "react-native-svg";
import { Layer, lo, type Rig, scale } from "./debo-face-rig";

export interface FeatureSpec {
  /** Ink for the shut-eye lines, happy arcs and the mouth line. */
  ink: string;
  mouthInside: string;
  tongue: string;
  eyeL: number;
  eyeR: number;
  eyeY: number;
  eyeRx: number;
  eyeRy: number;
  /** One open eye, centred on (cx, cy). */
  eye: (cx: number, cy: number) => ReactNode;
  /** Stroke for shut eyes and happy arcs, and how thick. */
  lid: string;
  lidWidth: number;
  /** Brows sit this far above the eye centre (a negative number). */
  browDy: number;
  browHalf: number;
  browWidth: number;
  browColor: string;
  /** 0 = brows only show when a mood needs them. Above 0 = always there, softly. */
  browBase: number;
  mouthX: number;
  mouthY: number;
  /** 1 = the tomato's mouth. Smaller for a smaller mouth. */
  mouthScale: number;
  mouthStroke: number;
  cheeks: { x: number; y: number; rx: number; ry: number; color: string; opacity: number }[];
  /** Fixed parts of the face that turn with the features (a nose). Optional. */
  fixtures?: ReactNode;
  /** How far the features slide when the head turns, compared with the outline. 0 = not at all. */
  turn: number;
  dots: { x: number; y: number; color: string };
  sweat: ReactNode;
  steam: ReactNode;
  steamOrigin: [number, number];
  huff: ReactNode;
  spark: ReactNode;
  sparkOrigin: [number, number];
}

export function FaceFeatures({ rig, size, spec }: { rig: Rig; size: number; spec: FeatureSpec }) {
  const { v, n, S } = rig;
  const sp = spec;
  const { eyeL, eyeR, eyeY, eyeRx: rx, eyeRy: ry } = sp;
  const { mouthX: mx, mouthY: my, mouthScale: ms } = sp;
  const brY = eyeY + sp.browDy;
  const m = (dx: number, dy: number) => `${mx + dx * ms} ${my + dy * ms}`;
  const arc = (cx: number) =>
    `M${cx - rx} ${eyeY + ry * 0.375}Q${cx} ${eyeY - ry * 0.875} ${cx + rx} ${eyeY + ry * 0.375}`;
  const shut = (cx: number) => `M${cx - rx + 1} ${eyeY + 1}Q${cx} ${eyeY + 6} ${cx + rx - 1} ${eyeY + 1}`;
  const mouth = { fill: "none", stroke: sp.ink, strokeWidth: sp.mouthStroke, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  const lid = { fill: "none", stroke: sp.lid, strokeWidth: sp.lidWidth, strokeLinecap: "round" } as const;
  const browOpacity =
    sp.browBase > 0 ? Animated.add(sp.browBase, scale(v.pose.browOn, 1 - sp.browBase)) : v.pose.browOn;
  const brow = (cx: number, rotation: typeof n.browLRot) => (
    <Layer size={size} style={{ opacity: browOpacity, transform: [{ translateY: n.browY }, { rotate: rotation }], transformOrigin: lo(cx, brY, S) }}>
      <Path d={`M${cx - sp.browHalf} ${brY}H${cx + sp.browHalf}`} stroke={sp.browColor} strokeWidth={sp.browWidth} strokeLinecap="round" />
    </Layer>
  );
  const midX = (eyeL + eyeR) / 2;
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: size,
        height: size,
        transform: [{ translateX: scale(v.pose.bodyX, sp.turn * S) }],
      }}
    >
      {sp.fixtures && <Layer size={size}>{sp.fixtures}</Layer>}

      {/* Cheeks grow around their own centre, so bigger blush never leaves the face. */}
      {sp.cheeks.map((c, i) => (
        <Layer key={i} size={size} style={{ opacity: v.pose.blush, transform: [{ scale: v.pose.blushScale }], transformOrigin: lo(c.x, c.y, S) }}>
          <Ellipse cx={c.x} cy={c.y} rx={c.rx} ry={c.ry} fill={c.color} opacity={c.opacity} />
        </Layer>
      ))}

      {/* Eyes: open ones blink and look around; closed happy arcs cross-fade in. */}
      <Layer
        size={size}
        style={{
          opacity: n.eyeOpenOpacity,
          transformOrigin: lo(midX, eyeY, S),
          transform: [{ translateX: n.eyeX }, { translateY: n.eyeY }, { scaleX: v.pose.eyeWide }, { scaleY: n.eyeScaleY }],
        }}
      >
        {sp.eye(eyeL, eyeY)}
        {sp.eye(eyeR, eyeY)}
      </Layer>
      <Layer size={size} style={{ opacity: v.pose.eyeHappy }}>
        <Path d={arc(eyeL)} {...lid} />
        <Path d={arc(eyeR)} {...lid} />
      </Layer>

      {/* Eyes shut as short lines (pouty). The right one opens for a quick peek. */}
      <Layer size={size} style={{ opacity: v.pose.eyeShut }}>
        <Path d={shut(eyeL)} {...lid} />
      </Layer>
      <Layer size={size} style={{ opacity: n.shutRightOpacity }}>
        <Path d={shut(eyeR)} {...lid} />
      </Layer>
      <Layer size={size} style={{ opacity: n.peekOpacity, transformOrigin: lo(eyeR, eyeY, S), transform: [{ scaleY: v.peekP }] }}>
        {sp.eye(eyeR, eyeY)}
      </Layer>

      {brow(eyeL, n.browLRot)}
      {brow(eyeR, n.browRRot)}

      {/* Mouths cross-fade. The open one is squashed by the voice level. */}
      <Layer size={size} style={{ opacity: v.pose.smile }}>
        <Path d={`M${m(-14, -5)}Q${m(0, 11)} ${m(14, -5)}`} {...mouth} />
      </Layer>
      <Layer size={size} style={{ opacity: n.flatOpacity }}>
        <Path d={`M${m(-10, 0)}L${m(10, 0)}`} {...mouth} />
      </Layer>
      <Layer size={size} style={{ opacity: v.pose.frown }}>
        <Path d={`M${m(-10, 4)}Q${m(0, -3)} ${m(10, 4)}`} {...mouth} />
      </Layer>
      <Layer size={size} style={{ opacity: v.pose.wave }}>
        <Path d={`M${m(-14, 2)}Q${m(-7, -5)} ${m(0, 2)}T${m(14, 2)}`} {...mouth} />
      </Layer>
      <Layer size={size} style={{ opacity: v.pose.pout }}>
        <Path d={`M${m(-8, 2)}Q${m(-4, -5)} ${m(0, 2)}Q${m(4, -5)} ${m(8, 2)}`} {...mouth} />
      </Layer>
      <Layer
        size={size}
        style={{
          opacity: n.openOpacity,
          transformOrigin: lo(mx, my - 11 * ms, S),
          transform: [{ scaleX: v.pose.mouthW }, { scaleY: n.openScaleY }],
        }}
      >
        <Ellipse cx={mx} cy={my + ms} rx={12 * ms} ry={12 * ms} fill={sp.mouthInside} />
        <Ellipse cx={mx} cy={my + 8 * ms} rx={7 * ms} ry={4.5 * ms} fill={sp.tongue} />
      </Layer>

      {/* Extras: thinking dots, sweat, steam, huff, sparkles. */}
      {([n.dot1, n.dot2, n.dot3] as const).map((opacity, i) => (
        <Layer key={i} size={size} style={{ opacity: Animated.multiply(v.pose.dots, opacity) }}>
          <Ellipse cx={sp.dots.x + i * 16} cy={sp.dots.y - i * 8} rx={5 + i} ry={5 + i} fill={sp.dots.color} />
        </Layer>
      ))}
      <Layer size={size} style={{ opacity: n.sweatOpacity, transform: [{ translateY: n.sweatY }] }}>
        {sp.sweat}
      </Layer>
      <Layer size={size} style={{ opacity: n.steamOpacity, transform: [{ translateY: n.steamY }, { scale: n.steamScale }], transformOrigin: lo(sp.steamOrigin[0], sp.steamOrigin[1], S) }}>
        {sp.steam}
      </Layer>
      <Layer size={size} style={{ opacity: n.huffOpacity, transform: [{ translateX: n.huffX }] }}>
        {sp.huff}
      </Layer>
      <Layer size={size} style={{ opacity: n.sparkOpacity, transform: [{ scale: n.sparkScale }], transformOrigin: lo(sp.sparkOrigin[0], sp.sparkOrigin[1], S) }}>
        {sp.spark}
      </Layer>
    </Animated.View>
  );
}
