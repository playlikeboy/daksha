// Debo the soft blue creature: its own paint. The blue is the app's accent blue, a little
// deeper so the creature stands out on the soft blue circle behind it. Characters are not
// UI chrome, so the app theme never recolours them (see debo-paint-diya.ts).
export const deboPaint = {
  body: "#4a8cf0",
  bodyShade: "#3a74d6",
  belly: "#cfe2ff",
  highlight: "#ffffff",
  earInner: "#ffb3c6",
  blush: "#ff9db5",
  ink: "#16213a",
  mouthInside: "#5a1f3a",
  tongue: "#ff8fa8",
  sweat: "#8ed0ff",
  steam: "#ffc2ba",
  spark: "#ffd23f",
  shadow: "#16213a",
} as const;
