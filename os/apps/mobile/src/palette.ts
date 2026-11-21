import { colorsLight } from "./astryx-tokens";
import { brandColors as b } from "./brand-tokens";

const c = colorsLight;

/**
 * The app palette. The pastel base (page, glass, ink, lines, Daksha blue, tile pastels)
 * comes from Daksha's brand tokens (brand-tokens.ts). The rest are Astryx Neutral theme
 * tokens. Nothing here is a hand-picked colour. Names are kept short because screens use
 * them everywhere; each line says where the value comes from.
 */
export const colors = {
  canvas: b.paper, // page background (cool mist under the glows)
  card: b.surface, // surfaces that hold content
  subtle: b.band, // quiet fills: wells, tracks, code
  text: b.ink,
  muted: b.ink2,
  disabled: c.textDisabled,
  line: b.line,
  lineStrong: b.lineStrong, // decorative dividers, the edge of a quiet button
  inputBorder: b.edge, // field edges: needs 3:1 against the page
  accent: b.ink, // primary action fill (ink, like ref's dark full-width button)
  onAccent: b.surface, // text and icons on the accent fill
  brand: b.tomato, // the unread dot only, never text
  brandText: b.tomatoInk, // red for small text and icons
  brandSoft: b.tomatoSoft, // a soft wash behind a small red mark
  nav: b.blue, // Daksha blue: the filled active circle, links, the send button
  onNav: b.surface, // icons and text on Daksha blue
  navSoft: b.blueSoft, // a soft blue wash: the person's own bubble, a selected row
  blue: b.blueSoft, // soft blue tint
  blueDark: b.ink, // icons and emphasis
  blueLine: c.borderBlue,
  blueText: b.blue, // blue words on white or a soft tint
  sky: b.sky,
  green: b.leafSoft,
  success: b.leafInk, // text and icons for "done" and "on"
  successLine: b.leafPressed, // a pressed source chip
  lavender: b.lilac,
  orange: b.peach,
  yellow: b.butter,
  pink: b.blush,
  mint: b.mint,
  lime: b.lime, // listening and progress: never text
  glowSky: b.glowSky, // the page glows: decoration only
  glowLilac: b.glowLilac,
  glowBlush: b.glowBlush,
  glowMint: b.glowMint,
  glass: b.glass, // see-through white for glass cards
  glassStrong: b.glassStrong, // the floating tab bar
  danger: b.dangerInk, // text for errors and risky actions
  dangerBg: b.tomatoSoft,
  stop: c.error, // solid red for the one button that ends something (End conversation)
  onStop: c.onError, // text and icons on the solid red
  ink: b.ink, // dark surfaces (toast, previews)
  onInk: b.surface, // text on dark surfaces
  scrim: b.scrim, // dim layer behind a sheet
  shadow: c.shadow,
};
