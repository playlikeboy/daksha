// The shared machinery behind every character's face.
//
// A character is a stack of small SVG layers (react-native-svg), each inside an
// Animated.View. Every layer moves only with transform and opacity, so on phones the
// animation runs on the native driver and never touches layout. The same code runs in
// the Expo web export (there React Native's Animated runs in JavaScript, which is fine
// for a face this small).
//
// Two kinds of motion, the same for every character:
//  - Pose: each mood is a set of numbers (debo-face-poses.ts) the layers ease toward.
//  - Life: breathing, blinking, sway and the odd glance run all the time, and each mood
//    adds its own small loop (a bounce, a wobble, a tremble, steam...).
//
// This file holds the numbers and the loops (`useFaceRig`). What the layers look like is
// each character's own file (debo-art-*.tsx). With "reduce motion" on, the face stays
// still and only cross-fades between poses.
import { useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, Animated, AppState, Easing, Platform } from "react-native";
import Svg from "react-native-svg";
import type { AvatarConfig } from "../../../packages/domain/src/avatar";
import { type CharacterId, poseFor } from "./debo-characters";
import { basePose, type Pose, stillPose } from "./debo-face-poses";
import type { Mood } from "./debo-mood";
import { deboLevels } from "./debo-mood-store";

const native = Platform.OS !== "web";
/** Channels that change what is drawn (not where). They cross-fade instead of travelling. */
const fades = new Set<string>([
  "browOn", "browAngle", "smile", "eyeShut", "pout", "open", "flat", "frown", "wave", "eyeHappy", "puff", "blush",
  "sweat", "steam", "dots", "spark",
]);
type PoseKey = keyof Pose;
const poseKeys = Object.keys(basePose) as PoseKey[];

/** Anything Animated can compute with. */
type Node = Animated.Value | Animated.AnimatedInterpolation<number>;

export function createValues() {
  const pose = {} as Record<PoseKey, Animated.Value>;
  for (const key of poseKeys) pose[key] = new Animated.Value(basePose[key]);
  const v = (n = 0) => new Animated.Value(n);
  return {
    pose,
    breath: v(), sway: v(), blink: v(1), glX: v(), glY: v(), wobble: v(), hop: v(), trem: v(),
    speak: v(), flick: v(), dotsP: v(), steamP: v(), sweatP: v(), huffP: v(), sparkP: v(),
    yawn: v(), squish: v(), peekP: v(),
  };
}
export type Values = ReturnType<typeof createValues>;

export const scale = (n: Node, by: number): Animated.AnimatedInterpolation<number> =>
  n.interpolate({ inputRange: [0, 1], outputRange: [0, by] });
export const clamp = (n: Node): Animated.AnimatedInterpolation<number> =>
  n.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: "clamp" });
export const deg = (n: Node): Animated.AnimatedInterpolation<number> =>
  n.interpolate({ inputRange: [-180, 180], outputRange: ["-180deg", "180deg"] as unknown as number[] });
export const inv = (n: Node): Animated.AnimatedInterpolation<number> =>
  n.interpolate({ inputRange: [0, 1], outputRange: [1, 0], extrapolate: "clamp" });

/** All the moving parts, derived once per size so rendering only reads them. */
export function buildNodes(v: Values, S: number) {
  const p = v.pose;
  const bodyScaleX = Animated.multiply(p.sx, Animated.subtract(1, scale(v.breath, 0.01)));
  const bodyScaleY = Animated.multiply(p.sy, Animated.add(1, scale(v.breath, 0.022)));
  const squishX = Animated.add(1, scale(v.squish, 0.13));
  const squishY = Animated.subtract(1, scale(v.squish, 0.15));
  const drive = Animated.add(
    Animated.multiply(v.speak, inv(deboLevels.real)),
    Animated.multiply(deboLevels.debo, deboLevels.real),
  );
  return {
    bodyX: Animated.add(scale(v.trem, 1.6 * S), scale(p.bodyX, S)),
    bodyY: Animated.add(
      Animated.add(scale(p.bodyY, S), scale(v.breath, -2.4 * S)),
      scale(v.hop, -8 * S),
    ),
    bodyRot: deg(Animated.add(p.tilt, scale(v.wobble, 3.5))),
    bodySX: Animated.multiply(bodyScaleX, squishX),
    bodySY: Animated.multiply(bodyScaleY, squishY),
    leafLRot: deg(
      Animated.add(Animated.add(scale(p.leafL, -1), scale(v.sway, 3)), scale(v.flick, 18)),
    ),
    leafRRot: deg(
      Animated.add(Animated.add(scale(p.leafR, 1), scale(v.sway, 2.4)), scale(v.flick, -18)),
    ),
    eyeX: scale(Animated.add(p.gazeX, v.glX), S),
    eyeY: scale(Animated.add(p.gazeY, v.glY), S),
    eyeScaleY: Animated.multiply(Animated.multiply(p.eyeOpen, v.blink), p.eyeWide),
    eyeOpenOpacity: inv(p.eyeHappy),
    shutRightOpacity: Animated.multiply(p.eyeShut, inv(v.peekP)),
    peekOpacity: clamp(v.peekP),
    browLRot: deg(p.browAngle),
    browRRot: deg(scale(p.browAngle, -1)),
    browY: scale(p.browLift, S),
    openOpacity: clamp(Animated.add(p.open, v.yawn)),
    flatOpacity: Animated.multiply(p.flat, inv(v.yawn)),
    openScaleY: Animated.add(
      Animated.add(p.mouthOpen, Animated.multiply(p.talk, drive)),
      scale(v.yawn, 0.9),
    ),
    puffScale: p.puff.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }),
    dot1: v.dotsP.interpolate({ inputRange: [0, 0.2, 0.4, 1], outputRange: [0.2, 1, 0.2, 0.2] }),
    dot2: v.dotsP.interpolate({ inputRange: [0, 0.3, 0.5, 0.7, 1], outputRange: [0.2, 0.2, 1, 0.2, 0.2] }),
    dot3: v.dotsP.interpolate({ inputRange: [0, 0.5, 0.7, 0.9, 1], outputRange: [0.2, 0.2, 1, 0.2, 0.2] }),
    steamOpacity: Animated.multiply(p.steam, inv(v.steamP)),
    steamY: scale(v.steamP, -14 * S),
    steamScale: v.steamP.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1.4] }),
    huffOpacity: Animated.multiply(p.puff, inv(v.huffP)),
    huffX: scale(v.huffP, -16 * S),
    sweatY: scale(v.sweatP, 9 * S),
    sweatOpacity: Animated.multiply(p.sweat, inv(v.sweatP)),
    sparkOpacity: Animated.multiply(p.spark, v.sparkP),
    sparkScale: v.sparkP.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.15] }),
  };
}

// ---- small helpers for motion -------------------------------------------------

export function useReducedMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let live = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => live && setReduce(value));
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduce);
    return () => {
      live = false;
      sub.remove();
    };
  }, []);
  return reduce;
}

/** False while the app or browser tab is hidden, so nothing animates for nobody. */
export function useVisible() {
  const [visible, setVisible] = useState(AppState.currentState !== "background");
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => setVisible(state === "active"));
    const doc = Platform.OS === "web" ? globalThis.document : undefined;
    const onVisibility = () => setVisible(doc?.visibilityState !== "hidden");
    doc?.addEventListener("visibilitychange", onVisibility);
    return () => {
      sub.remove();
      doc?.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
  return visible;
}

export const t = (value: Animated.Value, toValue: number, duration: number, easing = Easing.inOut(Easing.sin)) =>
  Animated.timing(value, { toValue, duration, easing, useNativeDriver: native });

/** A repeating run of [target, ms] steps. */
export function cycle(value: Animated.Value, steps: [number, number][], easing?: (n: number) => number) {
  return Animated.loop(Animated.sequence(steps.map(([to, ms]) => t(value, to, ms, easing))));
}

// ---- the drawing ----------------------------------------------------------------

function Art({ size, children }: { size: number; children: React.ReactNode }) {
  return (
    <Svg width={size * 1.2} height={size * 1.2} viewBox="-24 -24 288 288">
      {children}
    </Svg>
  );
}

/** One full-size layer that holds a single piece of the drawing. */
export function Layer({ size, style, children }: { size: number; style?: object; children: React.ReactNode }) {
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: "absolute", left: -size * 0.1, top: -size * 0.1, width: size * 1.2, height: size * 1.2 }, style]}
    >
      <Art size={size}>{children}</Art>
    </Animated.View>
  );
}

export const origin = (x: number, y: number, S: number) => `${x * S}px ${y * S}px`;
/** Layers have 24 units of spare room on every side, so puffed cheeks and puffs never clip. */
export const PAD = 24;
export const lo = (x: number, y: number, S: number) => origin(x + PAD, y + PAD, S);

/** Runs every loop for one face and hands back the numbers the art draws from. */
export function useFaceRig(character: CharacterId, mood: Mood, size: number, still?: boolean) {
  const reduceSetting = useReducedMotion();
  const visible = useVisible();
  const reduce = reduceSetting || !!still;
  const alive = visible && !reduce;
  const S = size / 240;
  const [v] = useState(createValues);
  const n = useMemo(() => buildNodes(v, S), [v, S]);

  // Melting: leaving a pout, the character peeks once as the smile comes back.
  const before = useRef<Mood>(mood);
  useEffect(() => {
    if (before.current === "pouty" && mood !== "pouty" && alive)
      Animated.sequence([t(v.peekP, 1, 120), Animated.delay(350), t(v.peekP, 0, 160)]).start();
    before.current = mood;
  }, [mood, alive, v]);

  // Pose: ease every channel toward the mood's numbers.
  useEffect(() => {
    const full = poseFor(character, mood);
    const target = reduce ? stillPose(full) : full;
    const easing = reduce || mood === "sleepy" ? Easing.out(Easing.quad) : Easing.out(Easing.back(1.2));
    const run = Animated.parallel(
      poseKeys.map((key) => {
        const crossFade = fades.has(key);
        return Animated.timing(v.pose[key], {
          toValue: target[key],
          duration: reduce ? 260 : crossFade ? 240 : 380,
          easing: crossFade ? Easing.inOut(Easing.quad) : easing,
          useNativeDriver: native,
        });
      }),
    );
    run.start();
    return () => run.stop();
  }, [character, mood, reduce, v]);

  // Life that never stops: breathing and the sway of the loose parts (leaf, hair, ears).
  useEffect(() => {
    if (!alive) return;
    const slow = mood === "sleepy";
    const breath = cycle(v.breath, [[1, slow ? 2300 : 1500], [0, slow ? 2300 : 1500]]);
    const sway = cycle(v.sway, [[1, 2600], [-1, 2600], [0, 1800]]);
    breath.start();
    sway.start();
    return () => {
      breath.stop();
      sway.stop();
    };
  }, [alive, mood === "sleepy", v]);

  // Blinking at natural, random moments, sometimes twice.
  useEffect(() => {
    if (!alive) return;
    let timer: ReturnType<typeof setTimeout>;
    const blink = (times: number) => {
      Animated.sequence([t(v.blink, 0.06, 70), t(v.blink, 1, 110)]).start(() => {
        if (times > 1) setTimeout(() => blink(times - 1), 120);
      });
    };
    const schedule = () => {
      timer = setTimeout(() => {
        blink(Math.random() < 0.18 ? 2 : 1);
        schedule();
      }, 2200 + Math.random() * 3800);
    };
    schedule();
    return () => {
      clearTimeout(timer);
      v.blink.setValue(1);
    };
  }, [alive, v]);

  // An occasional glance, when there is nothing particular on her mind.
  useEffect(() => {
    const free = mood === "idle" || mood === "listening" || mood === "sleepy";
    if (!alive || !free || mood === "sleepy") return;
    let timer: ReturnType<typeof setTimeout>;
    const glance = () => {
      timer = setTimeout(() => {
        const x = (Math.random() < 0.5 ? -1 : 1) * (4 + Math.random() * 4);
        const y = -1 + Math.random() * 3;
        Animated.sequence([
          Animated.parallel([t(v.glX, x, 260), t(v.glY, y, 260)]),
          Animated.delay(700 + Math.random() * 600),
          Animated.parallel([t(v.glX, 0, 320), t(v.glY, 0, 320)]),
        ]).start();
        glance();
      }, 3000 + Math.random() * 4500);
    };
    glance();
    return () => {
      clearTimeout(timer);
      Animated.parallel([t(v.glX, 0, 200), t(v.glY, 0, 200)]).start();
    };
  }, [alive, mood, v]);

  // Each mood's own small loop.
  useEffect(() => {
    if (!alive) return;
    const running: Animated.CompositeAnimation[] = [];
    const used: Animated.Value[] = [];
    const go = (value: Animated.Value, animation: Animated.CompositeAnimation) => {
      used.push(value);
      running.push(animation);
      animation.start();
    };
    switch (mood) {
      case "thinking":
        go(v.wobble, cycle(v.wobble, [[1, 1500], [-1, 3000], [0, 1500]]));
        go(v.dotsP, Animated.loop(Animated.sequence([t(v.dotsP, 1, 1400, Easing.linear), t(v.dotsP, 0, 1, Easing.linear)])));
        break;
      case "speaking":
        go(v.speak, cycle(v.speak, [[0.9, 140], [0.25, 120], [1, 160], [0.4, 120], [0.75, 150], [0.1, 130]]));
        break;
      case "happy":
        go(v.hop, Animated.sequence([t(v.hop, 1, 190, Easing.out(Easing.quad)), t(v.hop, 0, 230, Easing.in(Easing.quad)), t(v.hop, 0.7, 170, Easing.out(Easing.quad)), t(v.hop, 0, 210, Easing.in(Easing.quad))]));
        go(v.wobble, Animated.sequence([t(v.wobble, 1, 160), t(v.wobble, -1, 280), t(v.wobble, 0.6, 240), t(v.wobble, 0, 200)]));
        break;
      case "proud":
        go(v.sparkP, cycle(v.sparkP, [[1, 700], [0.15, 700]]));
        go(v.hop, Animated.sequence([t(v.hop, 0.5, 260, Easing.out(Easing.quad)), t(v.hop, 0, 360, Easing.in(Easing.quad))]));
        break;
      case "shy":
        go(v.wobble, cycle(v.wobble, [[0.6, 900], [-0.6, 1800], [0, 900]]));
        break;
      case "sleepy":
        go(v.yawn, Animated.loop(Animated.sequence([Animated.delay(5500), t(v.yawn, 1, 1300), Animated.delay(700), t(v.yawn, 0, 1100)])));
        break;
      case "worried":
        go(v.sweatP, Animated.loop(Animated.sequence([t(v.sweatP, 1, 1500, Easing.in(Easing.quad)), t(v.sweatP, 0, 1)])));
        go(v.wobble, cycle(v.wobble, [[0.5, 700], [-0.5, 1400], [0, 700]]));
        break;
      case "pouty":
        // Eyes shut, turned away. Then: a little "hmph" puff and a flick of the loose parts, a quick peek
        // with one eye to see if you noticed, and shut again. The peek is the tell.
        go(v.huffP, Animated.loop(Animated.sequence([Animated.delay(700), t(v.huffP, 1, 800, Easing.out(Easing.quad)), t(v.huffP, 0, 1), Animated.delay(2100)])));
        go(v.flick, Animated.loop(Animated.sequence([Animated.delay(700), t(v.flick, 1, 140, Easing.out(Easing.quad)), t(v.flick, 0, 400), Animated.delay(2400)])));
        go(v.peekP, Animated.loop(Animated.sequence([Animated.delay(2300), t(v.peekP, 1, 140), Animated.delay(480), t(v.peekP, 0, 120), Animated.delay(560)])));
        go(v.wobble, cycle(v.wobble, [[0.4, 1100], [-0.1, 1100]]));
        break;
      case "angry":
        go(v.trem, cycle(v.trem, [[1, 170], [-1, 170]], Easing.linear));
        go(v.steamP, Animated.loop(Animated.sequence([t(v.steamP, 1, 1000, Easing.out(Easing.quad)), t(v.steamP, 0, 1)])));
        break;
      default:
        break;
    }
    return () => {
      for (const animation of running) animation.stop();
      Animated.parallel(used.map((value) => t(value, 0, 220))).start();
    };
  }, [alive, mood, v]);

  const squish = () => {
    if (!alive) return;
    Animated.sequence([t(v.squish, 1, 80), Animated.spring(v.squish, { toValue: 0, friction: 3, tension: 220, useNativeDriver: native })]).start();
    Animated.sequence([t(v.blink, 0.06, 70), t(v.blink, 1, 110)]).start();
  };

  return { v, n, S, alive, reduce, squish };
}
export type Rig = ReturnType<typeof useFaceRig>;

/** What every character drawing receives. */
export interface ArtProps {
  size: number;
  rig: Rig;
  /** For a face the person made: what to draw. The built-in characters ignore it. */
  custom?: AvatarConfig;
}

/** Style for the Animated.View that carries a character's whole body (or just its head). */
export function bodyStyle(rig: Rig, size: number, pivotX = 120, pivotY = 226) {
  const { n, S } = rig;
  return {
    position: "absolute" as const,
    left: 0,
    top: 0,
    width: size,
    height: size,
    transformOrigin: origin(pivotX, pivotY, S),
    transform: [
      { translateX: n.bodyX },
      { translateY: n.bodyY },
      { rotate: n.bodyRot },
      { scaleX: n.bodySX },
      { scaleY: n.bodySY },
    ],
  };
}
