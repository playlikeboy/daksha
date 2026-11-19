/**
 * Daksha's own look, shared with the landing page (apps/site/src/app/site.css), so the app
 * and www.daksha.life feel like one product. Astryx (astryx-tokens.ts) still gives the
 * spacing scale and the colours this file does not name.
 *
 * Every text pair here is checked for WCAG AA contrast in test/contrast.test.ts.
 * Light only: DESIGN.md defers a dark theme for the app.
 */
export const brandColors = {
  /** Warm paper page (site --bg). */
  paper: "#FBF6EF",
  /** A slightly darker paper for quiet fills: secondary wells, the active tab (site --bg-band). */
  band: "#F4ECE1",
  /** Cards and anything that holds the person's own words (site --surface). */
  surface: "#FFFFFF",
  /** Warm near-black for text, icons and the primary button (site --ink). */
  ink: "#221B16",
  /** Secondary text (site --ink-2). 7.3:1 on paper. */
  ink2: "#5B5047",
  /** Field edges and checkbox outlines: 3.7:1 on paper, 4:1 on white (WCAG 1.4.11). */
  edge: "#8C7D6E",
  /** Quiet borders (site --line). */
  line: "#E7DCCD",
  /** Stronger dividers and the edge of a quiet button (site --line-strong). */
  lineStrong: "#D4C5B2",
  /** Daksha's tomato, for small marks only (site --tomato). Never text. */
  tomato: "#E5392B",
  /** Tomato for small text and icons: 5.8:1 on paper (site --tomato-ink). */
  tomatoInk: "#B8281C",
  /** A soft tomato wash behind a small mark (site --tomato-soft). */
  tomatoSoft: "#FDE3DC",
  /** Leaf green for "done" and sources (site --leaf-ink and --leaf-soft). */
  leafInk: "#22612A",
  leafSoft: "#E2F1DC",
  /** Soft tints behind a face or an icon (site --sky-soft and --sun-soft). */
  skySoft: "#E4ECFB",
  sunSoft: "#FDF0C8",
  /** Dim layer behind a sheet: warm ink at 45%. */
  scrim: "#221B1673",
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

/** The app's type sizes in px, close to DESIGN.md's scale. Body text is never under 16. */
export const typeSize = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 22,
  "2xl": 28,
  "3xl": 34,
} as const;

/** Corner radii: fields and chips 14, cards 20, sheets 28 (site --radius-s/m/l). */
export const brandRadius = {
  field: 14,
  card: 20,
  sheet: 28,
} as const;

/**
 * Soft warm shadows with an offset and a blur (site --shadow-1 and --shadow-2).
 * React Native 0.81 reads these as boxShadow on web, Android and iOS.
 */
export const brandShadow = {
  card: "0 1px 2px rgba(60, 40, 20, 0.06), 0 8px 24px -12px rgba(60, 40, 20, 0.18)",
  raised: "0 2px 6px rgba(60, 40, 20, 0.06), 0 24px 48px -24px rgba(60, 40, 20, 0.32)",
} as const;
