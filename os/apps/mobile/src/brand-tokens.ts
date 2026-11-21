/**
 * Daksha's app look: light, airy and soft. A cool near-white page with pastel glows behind
 * it, white glass cards, big friendly headings, round icon buttons and pill fields. The
 * fonts are the landing page's (Figtree and Bricolage Grotesque). Astryx (astryx-tokens.ts)
 * still gives the spacing scale and the colours this file does not name.
 *
 * Every text pair here is checked for WCAG AA contrast in test/contrast.test.ts, and the
 * table is in os/docs/ui-genie/README.md. Light only: DESIGN.md defers a dark theme.
 */
export const brandColors = {
  /** The page: a cool mist under the pastel glows. */
  paper: "#F3F5FA",
  /** A slightly deeper mist for quiet fills: wells, tracks, a pressed row. */
  band: "#ECEFF6",
  /** Cards, sheets and anything that holds the person's own words. */
  surface: "#FFFFFF",
  /** Cool near-black for text, icons and the primary button. 15.8:1 on the page. */
  ink: "#161A2B",
  /** Secondary text. 7:1 on the page, 6.1:1 or more on every pastel. */
  ink2: "#4D5366",
  /** Field edges and checkbox outlines: 3.5:1 on the page, 3.8:1 on white (WCAG 1.4.11). */
  edge: "#7C8296",
  /** Quiet borders, such as the edge of a glass card. */
  line: "#E2E6EF",
  /** Stronger dividers and the edge of a quiet button. */
  lineStrong: "#CDD2E0",
  /** Daksha blue: the filled circle of the active tab, links and small marks. White on it is 6.5:1. */
  blue: "#3451D1",
  /** A soft blue wash: the person's own chat bubble, the selected row. */
  blueSoft: "#E2E8FF",
  /** Pastels for feature tiles and soft icon wells. Ink and ink2 pass AA on every one. */
  sky: "#DDEAFF",
  lilac: "#E9E3FF",
  blush: "#FFE2EB",
  mint: "#DBF4E6",
  butter: "#FFF2CC",
  peach: "#FFE7D8",
  /** The listening colour (Talk's waveform, progress). Never text; ink on it is 14:1. */
  lime: "#DDF37A",
  /** The glows behind the page, a step stronger than the tile pastels. Decoration only. */
  glowSky: "#C4D9FF",
  glowLilac: "#DCD0FF",
  glowBlush: "#FFD3E1",
  glowMint: "#C8EEDA",
  /** Daksha's tomato, for the unread dot only (the brand mascot). Never text. */
  tomato: "#E5392B",
  /** A red for small text and icons: 6:1 on the page. */
  tomatoInk: "#B42318",
  /** A soft red wash behind an error. */
  tomatoSoft: "#FFE4E1",
  /** Green for "done" and sources. */
  leafInk: "#1E6A3B",
  leafSoft: "#DBF4E6",
  /** A pressed source chip: 5:1 under the green words. */
  leafPressed: "#C2EBD3",
  /** Error words: 7.5:1 on the page. */
  dangerInk: "#9B1C1C",
  /** Dim layer behind a sheet: ink at 40%. */
  scrim: "#161A2B66",
  /** White glass: a card that lets the glows show through a little (with a blur on the web). */
  glass: "#FFFFFFC7",
  /** The floating tab bar's glass, nearly solid so labels stay crisp on phones. */
  glassStrong: "#FFFFFFEB",
} as const;

/**
 * Brand fonts. Figtree for body and controls, Bricolage Grotesque for headings, the same
 * pair as the landing page. Both are SIL Open Font License 1.1 (assets/fonts/*-OFL.txt).
 *
 * - Web: public/index.html declares them with @font-face and `font-display: swap`, so the
 *   fallback shows at once and swaps when the file arrives (no invisible text).
 * - Android and iOS: the expo-font config plugin in app.json builds them into the app.
 *   On Android each family is one font resource with a file per weight, so fontWeight works.
 */
export const fonts = {
  body: "Figtree",
  heading: "Bricolage Grotesque",
} as const;

/** CSS stacks for the web: the brand face first, then the system face while it loads. */
export const webFontStack = {
  body: 'Figtree, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  heading:
    '"Bricolage Grotesque", Figtree, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
} as const;

/** The app's type sizes in px. Body text is never under 16. `hero` is the greeting. */
export const typeSize = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 22,
  "2xl": 28,
  "3xl": 34,
  hero: 40,
} as const;

/** Corner radii: fields and chips 18, cards and tiles 28, sheets 32. Buttons are pills. */
export const brandRadius = {
  field: 18,
  card: 28,
  sheet: 32,
} as const;

/**
 * Soft cool shadows, each with an offset and a blur. React Native 0.81 reads these as
 * boxShadow on web, Android and iOS.
 */
export const brandShadow = {
  card: "0 1px 2px rgba(22, 26, 43, 0.04), 0 10px 30px -14px rgba(40, 52, 110, 0.22)",
  raised: "0 2px 6px rgba(22, 26, 43, 0.05), 0 24px 48px -20px rgba(40, 52, 110, 0.32)",
  /** The floating tab bar and the chat's pill field. */
  float: "0 4px 12px rgba(22, 26, 43, 0.06), 0 18px 40px -16px rgba(40, 52, 110, 0.36)",
  /** The filled active circle and the send button. */
  button: "0 6px 16px -6px rgba(52, 81, 209, 0.55)",
} as const;
