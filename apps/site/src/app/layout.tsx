import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
// Fonts are served from our own domain (self-hosted through Next), so a
// visitor's browser makes no request to Google. Bricolage Grotesque sets the
// headings; Figtree sets everything else.
import "@fontsource-variable/bricolage-grotesque/index.css";
import "@fontsource/figtree/latin-400.css";
import "@fontsource/figtree/latin-500.css";
import "@fontsource/figtree/latin-600.css";
import "@fontsource/figtree/latin-700.css";
import "./site.css";
import { BRAND, SITE_URL } from "../brand";
import { RevealScript, ThemeScript } from "../components/scripts";

const TITLE = `${BRAND}: a friendly assistant that remembers your life`;
const DESCRIPTION = `Write things down or say them out loud. Ask ${BRAND} about your own life and see the source of every answer. You can see, fix, download and delete everything.`;

// Made by scripts/og/build-og.mjs. The ?v= changes when the picture changes, so chat apps fetch it again.
const OG_IMAGE = `${SITE_URL}/og.png?v=3`;
const OG_ALT = `${BRAND}, a small red tomato, next to a phone showing the app, and the words: a friendly assistant that remembers your life`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: TITLE, template: `%s | ${BRAND}` },
  description: DESCRIPTION,
  applicationName: BRAND,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: BRAND,
    url: "/",
    title: TITLE,
    description: DESCRIPTION,
    images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: OG_ALT }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: OG_ALT }],
  },
};

// Matches --bg in site.css for each theme.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbf6ef" },
    { media: "(prefers-color-scheme: dark)", color: "#15110e" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // The theme script sets data-theme and the "js" class before React runs,
    // so React must not warn that <html> changed.
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body>
        {children}
        <RevealScript />
      </body>
    </html>
  );
}
