import { colorsLight } from "./astryx-tokens";
import { brandColors as b } from "./brand-tokens";

const c = colorsLight;

/**
 * The app palette. The warm base (page, surfaces, ink, lines, tomato, leaf) comes from
 * Daksha's brand tokens (brand-tokens.ts), the same as the landing page. The rest are
 * Astryx Neutral theme tokens. Nothing here is a hand-picked colour. Names are kept short
 * because screens use them everywhere; each line says where the value comes from.
 */
export const colors = {
  canvas: b.paper, // page background (warm paper)
  card: b.surface, // surfaces that hold content
  subtle: b.band, // quiet fills: wells, code, the active tab
  text: b.ink,
  muted: b.ink2,
  disabled: c.textDisabled,
  line: b.line,
  lineStrong: b.lineStrong, // decorative dividers, the edge of a quiet button
  inputBorder: b.edge, // field edges: needs 3:1 against the page
  accent: b.ink, // primary action fill (ink, like the landing page)
  onAccent: b.paper, // text and icons on the accent fill
  brand: b.tomato, // Daksha's tomato: small marks only, never text
  brandText: b.tomatoInk, // tomato for small text and icons
  brandSoft: b.tomatoSoft, // a soft wash behind a small tomato mark
  blue: b.skySoft, // soft blue tint
  blueDark: b.ink, // links, icons and emphasis
  blueLine: c.borderBlue,
  blueText: c.textBlue, // text on the soft blue tint
  sky: b.skySoft,
  green: b.leafSoft,
  success: b.leafInk, // text and icons for "done" and "on" (dark enough on the soft green)
  successLine: c.borderGreen,
  lavender: c.backgroundPurple,
  orange: b.tomatoSoft,
  yellow: b.sunSoft,
  pink: c.backgroundPink,
  danger: c.onErrorMuted, // text for errors and risky actions (dark enough on the soft red)
  dangerBg: b.tomatoSoft,
  stop: c.error, // solid red for the one button that ends something (End conversation)
  onStop: c.onError, // text and icons on the solid red
  ink: b.ink, // dark surfaces (toast, previews)
  onInk: b.paper, // text on dark surfaces
  scrim: b.scrim, // dim layer behind a sheet
  shadow: c.shadow,
};
