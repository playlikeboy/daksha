// A face the person made in the avatar builder (decision 33): a blob, a round human, a cat
// or a tomato-like fruit, in their own colours, with hair, ears or leaves and a few
// accessories. Drawn in the same simple flat style as Daksha: flat shapes, no outlines, one
// soft shine.
//
// It is one drawing for every made face. The parts come from debo-custom-shape.ts (plain
// data, tested), the motion from the shared rig (debo-face-rig.tsx) and the eyes and mouths
// from debo-face-features.tsx, so every mood, blink and speaking mouth works as it does
// for the built-in characters. Ears, leaves and tufts are the loose parts that sway.
import { Animated } from "react-native";
import { Circle, Ellipse, G, Path } from "react-native-svg";
import { defaultAvatarConfig } from "../../../packages/domain/src/avatar";
import { customDrawing, type Shape } from "./debo-custom-shape";
import { FaceFeatures, type FeatureSpec } from "./debo-face-features";
import { type ArtProps, bodyStyle, Layer, lo, scale } from "./debo-face-rig";
import { customPaint as p } from "./debo-paint-custom";

/** Draws a list of plain shapes. */
function Shapes({ list }: { list: Shape[] }) {
  return (
    <>
      {list.map((shape, i) => {
        if (shape.kind === "circle")
          return (
            <Circle
              key={i}
              cx={shape.cx}
              cy={shape.cy}
              r={shape.r}
              fill={shape.fill}
              opacity={shape.opacity}
              fillOpacity={shape.fillOpacity}
              stroke={shape.stroke}
              strokeWidth={shape.strokeWidth}
            />
          );
        if (shape.kind === "ellipse")
          return (
            <Ellipse
              key={i}
              cx={shape.cx}
              cy={shape.cy}
              rx={shape.rx}
              ry={shape.ry}
              fill={shape.fill}
              opacity={shape.opacity}
              transform={shape.rotate ? `rotate(${shape.rotate} ${shape.cx} ${shape.cy})` : undefined}
            />
          );
        return (
          <Path
            key={i}
            d={shape.d}
            fill={shape.fill}
            opacity={shape.opacity}
            stroke={shape.stroke}
            strokeWidth={shape.strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      })}
    </>
  );
}

export function CustomArt({ size, rig, custom }: ArtProps) {
  const config = custom ?? defaultAvatarConfig;
  const { v, n, S } = rig;
  const d = customDrawing(config);
  const g = d.geometry;
  const c = config.colours;
  const human = config.base === "human";

  const eye = (cx: number, cy: number) => (
    <>
      <Ellipse cx={cx} cy={cy} rx={g.eyeRx} ry={g.eyeRy} fill={c.eyes} />
      <Circle cx={cx + g.eyeRx * 0.35} cy={cy - g.eyeRy * 0.4} r={g.eyeRx * 0.4} fill={p.highlight} />
    </>
  );
  const [sx, sy] = g.sweat;
  const spec: FeatureSpec = {
    ink: c.eyes,
    mouthInside: p.mouthInside,
    tongue: p.tongue,
    eyeL: g.eyeL,
    eyeR: g.eyeR,
    eyeY: g.eyeY,
    eyeRx: g.eyeRx,
    eyeRy: g.eyeRy,
    eye,
    lid: c.eyes,
    lidWidth: human ? 4.5 : 6,
    browDy: g.browDy,
    browHalf: g.browHalf,
    browWidth: human ? 4.5 : 5,
    browColor: human && config.hair !== "none" ? c.hair : c.eyes,
    browBase: human ? 0.85 : 0,
    mouthX: g.cx,
    mouthY: g.mouthY,
    mouthScale: g.mouthScale,
    mouthStroke: human ? 4.5 : 5,
    cheeks: [
      { x: g.cx - g.cheekDx, y: g.cheekY, rx: human ? 11 : 15, ry: human ? 7 : 10, color: c.cheeks, opacity: human ? 0.6 : 0.9 },
      { x: g.cx + g.cheekDx, y: g.cheekY, rx: human ? 11 : 15, ry: human ? 7 : 10, color: c.cheeks, opacity: human ? 0.6 : 0.9 },
    ],
    fixtures: d.face.length ? <Shapes list={d.face} /> : undefined,
    turn: g.turn,
    dots: { x: g.dots[0], y: g.dots[1], color: c.eyes },
    sweat: <Path d={`M${sx} ${sy}C${sx - 7} ${sy + 11} ${sx - 9} ${sy + 18} ${sx} ${sy + 25}C${sx + 9} ${sy + 18} ${sx + 7} ${sy + 11} ${sx} ${sy}Z`} fill={p.sweat} />,
    steam: (
      <>
        <Circle cx={40} cy={g.steamY} r={8} fill={p.steam} />
        <Circle cx={200} cy={g.steamY} r={8} fill={p.steam} />
        <Circle cx={26} cy={g.steamY + 16} r={5} fill={p.steam} />
        <Circle cx={214} cy={g.steamY + 16} r={5} fill={p.steam} />
      </>
    ),
    steamOrigin: [g.cx, g.steamY - 2],
    huff: (
      <>
        <Circle cx={g.cx - 28} cy={g.mouthY + 8} r={5} fill={p.steam} />
        <Circle cx={g.cx - 38} cy={g.mouthY + 13} r={3.5} fill={p.steam} />
      </>
    ),
    spark: (
      <>
        <Path d="M26 60L29 68L37 71L29 74L26 82L23 74L15 71L23 68Z" fill={p.spark} />
        <Path d="M210 42L212 48L218 50L212 52L210 58L208 52L202 50L208 48Z" fill={p.spark} />
        <Path d="M220 104L222 109L227 111L222 113L220 118L218 113L213 111L218 109Z" fill={p.spark} />
      </>
    ),
    sparkOrigin: [g.cx, g.sparkY],
  };

  const ears = (
    <>
      {d.earL.shapes.length > 0 && (
        <Layer size={size} style={{ transform: [{ rotate: n.leafLRot }], transformOrigin: lo(d.earL.pivot[0], d.earL.pivot[1], S) }}>
          <Shapes list={d.earL.shapes} />
        </Layer>
      )}
      {d.earR.shapes.length > 0 && (
        <Layer size={size} style={{ transform: [{ rotate: n.leafRRot }], transformOrigin: lo(d.earR.pivot[0], d.earR.pivot[1], S) }}>
          <Shapes list={d.earR.shapes} />
        </Layer>
      )}
    </>
  );
  const [puffX, puffY, puffR] = g.puff;
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
        <Ellipse cx={120} cy={human ? 230 : 225} rx={human ? 78 : 68} ry={7} fill={p.shadow} opacity={0.12} />
      </Layer>

      {/* The round human's shoulders only breathe; the head moves on the neck above them. */}
      {d.shoulders.length > 0 && (
        <Animated.View pointerEvents="none" style={shoulders}>
          <Layer size={size}>
            <Shapes list={d.shoulders} />
          </Layer>
        </Animated.View>
      )}

      <Animated.View pointerEvents="none" style={bodyStyle(rig, size, g.pivot[0], g.pivot[1])}>
        {/* A puffed cheek, for the pretend sulk. It grows out of the side. */}
        <Layer size={size} style={{ opacity: v.pose.puff, transform: [{ scale: n.puffScale }], transformOrigin: lo(puffX, puffY, S) }}>
          <Circle cx={puffX} cy={puffY} r={puffR} fill={c.body} />
        </Layer>
        {/* Long hair falls behind the head. */}
        {d.back.length > 0 && (
          <Layer size={size}>
            <Shapes list={d.back} />
          </Layer>
        )}
        {!d.earsInFront && ears}
        <Layer size={size}>
          <G>
            <Shapes list={d.body} />
            <Shapes list={d.hair} />
            <Shapes list={d.accessories} />
          </G>
        </Layer>
        {d.earsInFront && ears}
        {d.tufts.left.length > 0 && (
          <>
            <Layer size={size} style={{ transform: [{ rotate: n.leafLRot }], transformOrigin: lo(d.tufts.pivotL[0], d.tufts.pivotL[1], S) }}>
              <Shapes list={d.tufts.left} />
            </Layer>
            <Layer size={size} style={{ transform: [{ rotate: n.leafRRot }], transformOrigin: lo(d.tufts.pivotR[0], d.tufts.pivotR[1], S) }}>
              <Shapes list={d.tufts.right} />
            </Layer>
          </>
        )}
        <FaceFeatures rig={rig} size={size} spec={spec} />
      </Animated.View>
    </>
  );
}
