// What a face the person made looks like, as plain data: every shape with its place and
// colour. debo-art-custom.tsx turns this into animated SVG layers on the shared face rig.
//
// This file has no drawing code, so tests can check that every base, hair style, pair of
// ears and accessory lands inside the picture with real numbers. Coordinates are in the
// same 240 x 240 space as every other character (the layers have 24 spare units around).
import {
  type AccessoryKind,
  accessoryKinds,
  type AvatarBase,
  avatarBases,
  type AvatarConfig,
  type EarStyle,
  earStyles,
  type HairStyle,
  hairStyles,
} from "../../../packages/domain/src/avatar";
import { customPaint, customSwatches } from "./debo-paint-custom";

export type Shape =
  | { kind: "path"; d: string; fill: string; opacity?: number; stroke?: string; strokeWidth?: number }
  | { kind: "circle"; cx: number; cy: number; r: number; fill: string; opacity?: number; fillOpacity?: number; stroke?: string; strokeWidth?: number }
  | { kind: "ellipse"; cx: number; cy: number; rx: number; ry: number; fill: string; opacity?: number; rotate?: number };

/** Where the face sits on each base: the same numbers the built-in characters use. */
export interface BaseGeometry {
  /** Centre line, top of the head, half its width at eye level, and where the head ends. */
  cx: number;
  top: number;
  half: number;
  bottom: number;
  eyeL: number;
  eyeR: number;
  eyeY: number;
  eyeRx: number;
  eyeRy: number;
  browDy: number;
  browHalf: number;
  mouthY: number;
  mouthScale: number;
  cheekDx: number;
  cheekY: number;
  /** How far the features slide when the head turns away (pouty). */
  turn: number;
  /** Where the head pivots: low on the body for creatures, at the neck for the human. */
  pivot: [number, number];
  /** Where round and pointed ears are hinged, and leaves. */
  earL: [number, number];
  earR: [number, number];
  leaves: [number, number];
  puff: [number, number, number];
  dots: [number, number];
  sweat: [number, number];
  steamY: number;
  sparkY: number;
}

export const geometry: Record<AvatarBase, BaseGeometry> = {
  // Daksha's shape.
  blob: {
    cx: 120, top: 56, half: 94, bottom: 218, eyeL: 84, eyeR: 156, eyeY: 138, eyeRx: 15, eyeRy: 18,
    browDy: -28, browHalf: 12, mouthY: 164, mouthScale: 0.85, cheekDx: 62, cheekY: 164, turn: 0.5,
    pivot: [120, 226], earL: [76, 92], earR: [164, 92], leaves: [120, 60], puff: [198, 166, 26],
    dots: [178, 40], sweat: [210, 82], steamY: 74, sparkY: 84,
  },
  // Kabir's head and shoulders.
  human: {
    cx: 120, top: 48, half: 58, bottom: 172, eyeL: 94, eyeR: 146, eyeY: 124, eyeRx: 13, eyeRy: 16,
    browDy: -24, browHalf: 11, mouthY: 150, mouthScale: 0.8, cheekDx: 38, cheekY: 144, turn: 1,
    pivot: [120, 178], earL: [84, 52], earR: [156, 52], leaves: [120, 38], puff: [162, 146, 14],
    dots: [188, 40], sweat: [204, 92], steamY: 52, sparkY: 74,
  },
  // Mishti's shape.
  cat: {
    cx: 120, top: 56, half: 106, bottom: 220, eyeL: 82, eyeR: 158, eyeY: 128, eyeRx: 13, eyeRy: 16,
    browDy: -25, browHalf: 13, mouthY: 172, mouthScale: 0.78, cheekDx: 70, cheekY: 154, turn: 0.6,
    pivot: [120, 226], earL: [74, 84], earR: [166, 84], leaves: [120, 58], puff: [208, 160, 30],
    dots: [176, 34], sweat: [206, 92], steamY: 84, sparkY: 90,
  },
  // Diya's shape.
  fruit: {
    cx: 120, top: 62, half: 103, bottom: 218, eyeL: 88, eyeR: 152, eyeY: 136, eyeRx: 13, eyeRy: 16,
    browDy: -24, browHalf: 14, mouthY: 163, mouthScale: 1, cheekDx: 60, cheekY: 158, turn: 0,
    pivot: [120, 226], earL: [72, 90], earR: [168, 90], leaves: [120, 66], puff: [206, 154, 32],
    dots: [172, 40], sweat: [194, 86], steamY: 58, sparkY: 80,
  },
};

// ---- colour helpers ---------------------------------------------------------------

function mix(hex: string, toward: string, amount: number): string {
  const read = (h: string) => [1, 3, 5].map((i) => Number.parseInt(h.slice(i, i + 2), 16));
  const a = read(hex);
  const b = read(toward);
  const out = a.map((value, i) => Math.round(value + ((b[i] ?? value) - value) * amount));
  return `#${out.map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}
/** A deeper copy of a colour, for shading. */
export const shade = (hex: string, amount = 0.14) => mix(hex, customPaint.black, amount);
/** A paler copy of a colour, for a muzzle or a shine. */
export const tint = (hex: string, amount = 0.7) => mix(hex, customPaint.highlight, amount);

// ---- the parts ----------------------------------------------------------------------

const BODY_PATH: Record<Exclude<AvatarBase, "human">, string> = {
  blob: "M120 56C180 56 214 100 214 152C214 198 174 218 120 218C66 218 26 198 26 152C26 100 60 56 120 56Z",
  cat: "M120 58C182 54 224 92 226 142C228 194 184 220 120 220C56 220 12 194 14 142C16 92 58 54 120 58Z",
  fruit: "M120 66C150 52 204 60 221 118C234 174 190 218 120 218C50 218 6 174 19 118C36 60 90 52 120 66Z",
};

function bodyShapes(config: AvatarConfig): Shape[] {
  const c = config.colours;
  const deep = shade(c.body);
  switch (config.base) {
    case "blob":
      return [
        { kind: "path", d: BODY_PATH.blob, fill: c.body },
        { kind: "ellipse", cx: 64, cy: 98, rx: 15, ry: 8, fill: customPaint.highlight, opacity: 0.35, rotate: -50 },
      ];
    case "cat":
      return [
        { kind: "path", d: BODY_PATH.cat, fill: c.body },
        { kind: "path", d: "M226 142C228 194 184 220 120 220C66 220 26 200 16 160C48 196 108 204 156 192C200 182 222 166 226 142Z", fill: deep },
        { kind: "path", d: "M104 66L106 86M120 62L120 90M136 66L134 86", fill: "none", stroke: shade(c.body, 0.25), strokeWidth: 6 },
        { kind: "ellipse", cx: 116, cy: 168, rx: 42, ry: 27, fill: tint(c.body, 0.8) },
        { kind: "ellipse", cx: 124, cy: 168, rx: 42, ry: 27, fill: tint(c.body, 0.8) },
        { kind: "ellipse", cx: 60, cy: 100, rx: 14, ry: 7, fill: customPaint.highlight, opacity: 0.35, rotate: -40 },
        { kind: "path", d: "M110 152H130L120 163Z", fill: shade(c.cheeks, 0.2), stroke: shade(c.cheeks, 0.2), strokeWidth: 4 },
        { kind: "path", d: "M82 164L46 158M82 174L48 180M158 164L194 158M158 174L192 180", fill: "none", stroke: c.eyes, strokeWidth: 2.5, opacity: 0.5 },
      ];
    case "fruit":
      return [
        { kind: "path", d: BODY_PATH.fruit, fill: c.body },
        { kind: "path", d: "M221 118C234 174 190 218 120 218C62 218 22 188 17 142C40 190 100 200 150 186C196 172 214 150 221 118Z", fill: deep },
        { kind: "ellipse", cx: 56, cy: 112, rx: 17, ry: 8, fill: customPaint.highlight, opacity: 0.4, rotate: -48 },
        { kind: "circle", cx: 45, cy: 134, r: 4.5, fill: customPaint.highlight, opacity: 0.4 },
      ];
    case "human":
      return [
        { kind: "circle", cx: 64, cy: 124, r: 12, fill: c.body },
        { kind: "circle", cx: 176, cy: 124, r: 12, fill: c.body },
        { kind: "circle", cx: 64, cy: 125, r: 5.5, fill: deep, opacity: 0.5 },
        { kind: "circle", cx: 176, cy: 125, r: 5.5, fill: deep, opacity: 0.5 },
        { kind: "path", d: "M120 48C160 48 178 80 178 116C178 150 154 172 120 172C86 172 62 150 62 116C62 80 80 48 120 48Z", fill: c.body },
      ];
  }
}

/** The round human's neck and shoulders. They only breathe; the head moves on top. */
export function shoulderShapes(config: AvatarConfig): Shape[] {
  if (config.base !== "human") return [];
  const c = config.colours;
  return [
    { kind: "path", d: "M106 150L106 186Q120 200 134 186L134 150Z", fill: shade(c.body) },
    { kind: "path", d: "M28 238C28 206 62 192 94 186Q120 206 146 186C178 192 212 206 212 238Q120 250 28 238Z", fill: c.outfit },
    { kind: "path", d: "M80 190C88 178 100 176 106 184Q120 202 134 184C140 176 152 178 160 190Q120 224 80 190Z", fill: shade(c.outfit) },
  ];
}

// Hair is drawn for the human head (Kabir's size) and stretched to fit other bases, so a
// blob or a cat can have a fringe too. The stretch maps the human head top and eye line
// onto the base's own.
const HUMAN = geometry.human;
export function hairFit(base: AvatarBase): { sx: number; sy: number; tx: number; ty: number } {
  const g = geometry[base];
  const sx = g.half / HUMAN.half;
  const sy = (g.eyeY - g.top) / (HUMAN.eyeY - HUMAN.top);
  return { sx, sy, tx: g.cx - HUMAN.cx * sx, ty: g.top - HUMAN.top * sy };
}

/** Moves a human-sized path onto another base. Paths here use only absolute M, C, Q, L, H, Z. */
function fitPath(d: string, base: AvatarBase): string {
  if (base === "human") return d;
  const { sx, sy, tx, ty } = hairFit(base);
  const round = (n: number) => Math.round(n * 10) / 10;
  return d.replace(/([MCQLHZ])([^MCQLHZ]*)/g, (_all, command: string, args: string) => {
    const numbers = args.trim().split(/[\s,]+/).filter(Boolean).map(Number);
    if (command === "H") return `H${numbers.map((x) => round(x * sx + tx)).join(" ")}`;
    const out: number[] = [];
    numbers.forEach((n, i) => out.push(i % 2 === 0 ? round(n * sx + tx) : round(n * sy + ty)));
    return `${command}${out.join(" ")}`;
  });
}
function fitCircle(cx: number, cy: number, r: number, base: AvatarBase): [number, number, number] {
  const { sx, sy, tx, ty } = hairFit(base);
  return [cx * sx + tx, cy * sy + ty, r * Math.min(sx, sy)];
}

const SHORT = "M60 118C50 66 80 34 122 34C166 34 192 66 180 118C178 98 170 84 158 74C150 86 134 90 118 86C110 92 96 94 84 92C74 98 64 106 60 118Z";
const LONG_FRONT = "M60 118C52 64 84 34 120 34C156 34 188 64 180 118C172 92 156 76 136 70C124 84 96 92 72 96C66 102 62 110 60 118Z";
const LONG_BACK = "M58 116C50 60 84 30 120 30C156 30 190 60 182 116L190 196Q120 212 50 196Z";
const CURLS: [number, number][] = [
  [64, 104], [68, 80], [82, 60], [102, 46], [124, 42], [146, 48], [164, 62], [174, 82], [176, 106],
];

/** Hair behind the head (long hair falls behind the shoulders). */
export function hairBack(config: AvatarConfig): Shape[] {
  if (config.hair !== "long") return [];
  return [{ kind: "path", d: fitPath(LONG_BACK, config.base), fill: shade(config.colours.hair, 0.1) }];
}

/** Hair on top of the head, in front of it. */
export function hairFront(config: AvatarConfig): Shape[] {
  const hair = config.colours.hair;
  const shine: Shape = { kind: "ellipse", cx: 0, cy: 0, rx: 14, ry: 6, fill: customPaint.highlight, opacity: 0.18, rotate: -28 };
  const at = (x: number, y: number): Shape => {
    const [cx, cy] = fitCircle(x, y, 0, config.base);
    return { ...shine, cx, cy } as Shape;
  };
  switch (config.hair) {
    case "short":
      return [{ kind: "path", d: fitPath(SHORT, config.base), fill: hair }, at(92, 52)];
    case "long":
      return [{ kind: "path", d: fitPath(LONG_FRONT, config.base), fill: hair }, at(92, 52)];
    case "bun": {
      const [cx, cy, r] = fitCircle(120, 30, 20, config.base);
      return [{ kind: "circle", cx, cy, r, fill: hair }, { kind: "path", d: fitPath(SHORT, config.base), fill: hair }, at(92, 52)];
    }
    case "curly":
      return [
        { kind: "path", d: fitPath(SHORT, config.base), fill: hair },
        ...CURLS.map(([x, y]): Shape => {
          const [cx, cy, r] = fitCircle(x, y, 16, config.base);
          return { kind: "circle", cx, cy, r, fill: hair };
        }),
      ];
    default:
      return [];
  }
}

/** One tuft each side of the top, for the "tuft" style. They sway like Kabir's. */
export function tufts(config: AvatarConfig): { left: Shape[]; right: Shape[]; pivotL: [number, number]; pivotR: [number, number] } {
  if (config.hair !== "tuft") return { left: [], right: [], pivotL: [0, 0], pivotR: [0, 0] };
  const fill = config.colours.hair;
  const [lx, ly] = fitCircle(112, 38, 0, config.base);
  const [rx, ry] = fitCircle(128, 38, 0, config.base);
  return {
    left: [{ kind: "path", d: `M${lx - 8} ${ly + 2}C${lx - 14} ${ly - 12} ${lx - 8} ${ly - 24} ${lx + 6} ${ly - 30}C${lx + 1} ${ly - 18} ${lx + 3} ${ly - 8} ${lx + 10} ${ly + 2}Z`, fill }],
    right: [{ kind: "path", d: `M${rx - 8} ${ry + 2}C${rx - 4} ${ry - 10} ${rx + 4} ${ry - 18} ${rx + 18} ${ry - 20}C${rx + 10} ${ry - 12} ${rx + 8} ${ry - 4} ${rx + 8} ${ry + 4}Z`, fill }],
    pivotL: [lx, ly],
    pivotR: [rx, ry],
  };
}

/**
 * Ears or leaves, one side at a time, drawn around their hinge so they can sway, perk up
 * and droop with the mood. `side` is -1 for the left, 1 for the right.
 */
export function earShapes(config: AvatarConfig, side: -1 | 1): { shapes: Shape[]; pivot: [number, number] } {
  const g = geometry[config.base];
  const c = config.colours;
  const ears: EarStyle = config.ears;
  if (ears === "leaves") {
    const [px, py] = g.leaves;
    const x = (dx: number) => px + dx * side;
    const leaf = c.hair;
    return {
      pivot: [px, py],
      shapes: [
        { kind: "path", d: `M${px} ${py}C${x(-12)} ${py - 8} ${x(-36)} ${py - 10} ${x(-56)} ${py + 4}C${x(-34)} ${py + 10} ${x(-14)} ${py + 10} ${px} ${py}Z`, fill: leaf },
        { kind: "path", d: `M${px} ${py}C${x(-18)} ${py} ${x(-38)} ${py + 12} ${x(-44)} ${py + 30}C${x(-22)} ${py + 28} ${x(-6)} ${py + 18} ${px} ${py}Z`, fill: leaf },
      ],
    };
  }
  const [px, py] = side < 0 ? g.earL : g.earR;
  const x = (dx: number) => px - dx * side;
  if (ears === "round")
    return {
      pivot: [px, py],
      shapes: [
        { kind: "circle", cx: x(6), cy: py - 18, r: 22, fill: c.body },
        { kind: "circle", cx: x(6), cy: py - 16, r: 11, fill: shade(c.body, 0.12) },
      ],
    };
  if (ears === "pointed")
    return {
      pivot: [px, py],
      shapes: [
        { kind: "path", d: `M${x(-34)} ${py + 20}L${x(-24)} ${py - 46}L${x(34)} ${py - 16}Z`, fill: c.body, stroke: c.body, strokeWidth: 12 },
        { kind: "path", d: `M${x(-20)} ${py + 6}L${x(-16)} ${py - 28}L${x(14)} ${py - 12}Z`, fill: tint(c.cheeks, 0.3), stroke: tint(c.cheeks, 0.3), strokeWidth: 6 },
      ],
    };
  return { pivot: [px, py], shapes: [] };
}

/** The stem in the middle of a pair of leaves. */
export function stemShapes(config: AvatarConfig): Shape[] {
  if (config.ears !== "leaves") return [];
  const [px, py] = geometry[config.base].leaves;
  const dark = shade(config.colours.hair, 0.2);
  return [
    { kind: "path", d: `M${px} ${py + 4}C${px - 8} ${py + 16} ${px - 6} ${py + 30} ${px} ${py + 38}C${px + 6} ${py + 30} ${px + 8} ${py + 16} ${px} ${py + 4}Z`, fill: dark },
    { kind: "path", d: `M${px} ${py + 4}C${px - 1} ${py - 10} ${px + 2} ${py - 20} ${px + 10} ${py - 28}`, fill: "none", stroke: dark, strokeWidth: 9 },
  ];
}

/** Accessories that sit on the head or body (glasses are on the face: `glassesShapes`). */
export function accessoryShapes(config: AvatarConfig): Shape[] {
  const g = geometry[config.base];
  const c = config.colours;
  const has = (kind: AccessoryKind) => config.accessories.includes(kind);
  const out: Shape[] = [];
  if (has("scarf")) {
    // Round a neck for the human; low across the body for the others.
    const y = config.base === "human" ? 168 : g.bottom - 30;
    const w = config.base === "human" ? 40 : g.half * 0.78;
    out.push(
      { kind: "path", d: `M${g.cx - w} ${y}Q${g.cx} ${y + 18} ${g.cx + w} ${y}L${g.cx + w + 2} ${y + 16}Q${g.cx} ${y + 36} ${g.cx - w - 2} ${y + 16}Z`, fill: c.outfit },
      { kind: "path", d: `M${g.cx + w * 0.4} ${y + 18}L${g.cx + w * 0.55} ${y + 44}L${g.cx + w * 0.8} ${y + 40}L${g.cx + w * 0.7} ${y + 14}Z`, fill: shade(c.outfit) },
    );
  }
  if (has("earrings")) {
    const y = config.base === "human" ? 140 : g.eyeY + 34;
    const dx = config.base === "human" ? 56 : g.half * 0.9;
    out.push(
      { kind: "circle", cx: g.cx - dx, cy: y, r: 5.5, fill: c.accessory },
      { kind: "circle", cx: g.cx + dx, cy: y, r: 5.5, fill: c.accessory },
    );
  }
  if (has("cap")) {
    const w = Math.min(g.half * 0.72, 70);
    const y = g.top + (config.base === "human" ? 10 : 18);
    out.push(
      { kind: "path", d: `M${g.cx - w} ${y + 8}C${g.cx - w} ${y - 34} ${g.cx + w} ${y - 34} ${g.cx + w} ${y + 8}Z`, fill: c.accessory },
      { kind: "path", d: `M${g.cx - w + 6} ${y + 8}H${g.cx + w + 34}Q${g.cx + w + 30} ${y + 18} ${g.cx + w} ${y + 16}H${g.cx - w + 6}Z`, fill: shade(c.accessory, 0.2) },
      { kind: "circle", cx: g.cx, cy: y - 24, r: 5, fill: shade(c.accessory, 0.2) },
    );
  }
  if (has("bow")) {
    const x = g.cx + g.half * 0.55;
    const y = g.top + 14;
    out.push(
      { kind: "path", d: `M${x} ${y}L${x - 22} ${y - 14}L${x - 22} ${y + 14}Z`, fill: c.accessory, stroke: c.accessory, strokeWidth: 6 },
      { kind: "path", d: `M${x} ${y}L${x + 22} ${y - 14}L${x + 22} ${y + 14}Z`, fill: c.accessory, stroke: c.accessory, strokeWidth: 6 },
      { kind: "circle", cx: x, cy: y, r: 7, fill: shade(c.accessory, 0.15) },
    );
  }
  return out;
}

/** Glasses ride on the face, so they turn with the eyes and features. */
export function glassesShapes(config: AvatarConfig): Shape[] {
  if (!config.accessories.includes("glasses")) return [];
  const g = geometry[config.base];
  const r = g.eyeRy + 7;
  const ink = config.colours.eyes;
  return [
    { kind: "circle", cx: g.eyeL, cy: g.eyeY, r, fill: customPaint.highlight, fillOpacity: 0.25, stroke: ink, strokeWidth: 4 },
    { kind: "circle", cx: g.eyeR, cy: g.eyeY, r, fill: customPaint.highlight, fillOpacity: 0.25, stroke: ink, strokeWidth: 4 },
    { kind: "path", d: `M${g.eyeL + r} ${g.eyeY - 2}Q${g.cx} ${g.eyeY - 10} ${g.eyeR - r} ${g.eyeY - 2}`, fill: "none", stroke: ink, strokeWidth: 4 },
  ];
}

/** A small nose line for the human, like Kabir's. */
export function noseShapes(config: AvatarConfig): Shape[] {
  if (config.base !== "human") return [];
  return [{ kind: "path", d: "M116.5 137Q120 140.5 123.5 137", fill: "none", stroke: shade(config.colours.body, 0.2), strokeWidth: 2.6 }];
}

/** Everything a face is drawn from, in order. */
export function customDrawing(config: AvatarConfig) {
  return {
    geometry: geometry[config.base],
    shoulders: shoulderShapes(config),
    back: hairBack(config),
    earL: earShapes(config, -1),
    earR: earShapes(config, 1),
    /** Leaves sit in front of the body; ears behind it. */
    earsInFront: config.ears === "leaves",
    body: [...bodyShapes(config), ...stemShapes(config)],
    hair: hairFront(config),
    tufts: tufts(config),
    accessories: accessoryShapes(config),
    face: [...noseShapes(config), ...glassesShapes(config)],
  };
}

// ---- the builder's helpers ------------------------------------------------------------

/** What changes with the base, so a new base starts out looking right. */
const baseStart: Record<AvatarBase, { hairStyle: HairStyle; ears: EarStyle; body: string; hairColour: string }> = {
  blob: { hairStyle: "none", ears: "round", body: customSwatches.body[0], hairColour: customSwatches.hair[0] },
  human: { hairStyle: "short", ears: "none", body: customSwatches.body[8], hairColour: customSwatches.hair[0] },
  cat: { hairStyle: "none", ears: "pointed", body: customSwatches.body[2], hairColour: customSwatches.hair[0] },
  fruit: { hairStyle: "none", ears: "leaves", body: customSwatches.body[3], hairColour: customSwatches.hair[6] },
};

/** A new base, with that base's own ears, hair and colours. Name, pronoun and accessories stay. */
export function withBase(config: AvatarConfig, base: AvatarBase): AvatarConfig {
  const d = baseStart[base];
  return { ...config, base, hair: d.hairStyle, ears: d.ears, colours: { ...config.colours, body: d.body, hair: d.hairColour } };
}


const pick = <T>(list: readonly T[], random: () => number): T => list[Math.floor(random() * list.length) % list.length] as T;

/**
 * A surprise face. The name and pronoun stay what the person chose; everything else is
 * picked from the lists, with at most two accessories so it never looks cluttered.
 */
export function randomAvatar(config: AvatarConfig, random: () => number = Math.random): AvatarConfig {
  const base = pick(avatarBases, random);
  const start = baseStart[base];
  const accessories = accessoryKinds.filter(() => random() < 0.25).slice(0, 2);
  return {
    ...config,
    base,
    hair: base === "human" ? pick(hairStyles.filter((h) => h !== "none"), random) : random() < 0.2 ? pick(hairStyles, random) : "none",
    ears: base === "human" ? (random() < 0.15 ? pick(earStyles, random) : "none") : start.ears,
    accessories,
    colours: {
      body: base === "human" ? pick(customSwatches.body.slice(6), random) : pick(customSwatches.body.slice(0, 6), random),
      hair: base === "fruit" ? customSwatches.hair[6] : pick(customSwatches.hair, random),
      outfit: pick(customSwatches.outfit, random),
      cheeks: pick(customSwatches.cheeks, random),
      eyes: pick(customSwatches.eyes, random),
      accessory: pick(customSwatches.accessory, random),
    },
  };
}
