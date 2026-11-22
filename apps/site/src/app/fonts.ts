import localFont from "next/font/local";

// The page's two fonts, still the self-hosted Fontsource files, loaded through
// next/font so that:
// - the files are preloaded, and served from our own domain (no request to a font service);
// - the stand-in font shown before they arrive is resized to the same width and
//   line height, so the text does not reflow and the page does not jump.
// site.css reads them through --font-figtree and --font-bricolage.
export const figtree = localFont({
  src: [
    { path: "../../node_modules/@fontsource/figtree/files/figtree-latin-400-normal.woff2", weight: "400" },
    { path: "../../node_modules/@fontsource/figtree/files/figtree-latin-500-normal.woff2", weight: "500" },
    { path: "../../node_modules/@fontsource/figtree/files/figtree-latin-600-normal.woff2", weight: "600" },
    { path: "../../node_modules/@fontsource/figtree/files/figtree-latin-700-normal.woff2", weight: "700" },
  ],
  variable: "--font-figtree",
  display: "swap",
  adjustFontFallback: "Arial",
});

export const bricolage = localFont({
  src: "../../node_modules/@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-wght-normal.woff2",
  weight: "200 800",
  variable: "--font-bricolage",
  display: "swap",
  adjustFontFallback: "Arial",
});
