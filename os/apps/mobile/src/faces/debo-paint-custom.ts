// A face the person made: the fixed paint every custom face shares, and the colours the
// avatar builder offers (see debo-paint-diya.ts for why raw colours live in paint files).
// The person picks body, hair, outfit, cheek, eye and accessory colours from these lists;
// everything else (the inside of the mouth, sweat, steam, sparkles) stays the same.
export const customPaint = {
  highlight: "#ffffff",
  black: "#000000",
  mouthInside: "#5a1f3a",
  tongue: "#ff8fa8",
  sweat: "#8ed0ff",
  steam: "#ffc2ba",
  spark: "#ffd23f",
  shadow: "#16213a",
} as const;

/** The colours on offer, per part. Each list is short, so every pick looks good. */
export const customSwatches = {
  body: [
    "#7cc6a4", "#4f8ff2", "#f4a95c", "#e5392b", "#b48cf2", "#ffd36b",
    // Skin tones, for the round human.
    "#f6d3b8", "#e8b48f", "#dfa57f", "#b97a55", "#8d5a3b", "#5e3a26",
  ],
  hair: ["#33231d", "#1b1b1b", "#6b4226", "#c9853e", "#e8c46b", "#a9a9a9", "#3f9b45", "#e26aa0", "#5b6cf0"],
  outfit: ["#4f8ff2", "#2a9d8f", "#f2b33d", "#e5392b", "#8e6cd8", "#3c3c46", "#f4f1ea", "#e26aa0"],
  cheeks: ["#ff8fb0", "#ffb0a8", "#ff9f9a", "#f7a1c4", "#e88a6a"],
  eyes: ["#17213b", "#2a1a12", "#1b1b1b", "#3b2a6b", "#1f4d3a"],
  accessory: ["#ffd23f", "#e5392b", "#4f8ff2", "#ff8fb0", "#1b1b1b", "#f4f1ea"],
} as const;
