// Debo the soft blue creature: its own paint. The blue is the app's accent blue, a little
// deeper so the creature stands out on the soft blue circle behind it. Characters are not
// UI chrome, so the app theme never recolours them (see debo-paint-diya.ts).
// Few colours on purpose: one blue for the body, a deeper blue inside the ears, ink for the
// face, pink for the cheeks.
export const deboPaint = {
  body: "#4f8ff2",
  earInner: "#3d79dc",
  highlight: "#ffffff",
  blush: "#ff8fb0",
  ink: "#17213b",
  mouthInside: "#5a1f3a",
  tongue: "#ff8fa8",
  sweat: "#8ed0ff",
  steam: "#ffc2ba",
  spark: "#ffd23f",
  shadow: "#16213a",
} as const;
