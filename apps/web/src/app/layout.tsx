import type { Metadata, Viewport } from "next";
import "@fontsource-variable/bricolage-grotesque";
import "@fontsource-variable/figtree";
import "./globals.css";

const title = "Debo: a friendly assistant that remembers your life";
const description =
  "Give Debo your journals, voice notes, papers and photos. Ask about your own life and get answers that show where they came from. Being built now.";

// Made by scripts/og/build-og.mjs. The ?v= changes when the picture changes, so chat apps fetch it again.
const OG_IMAGE = "https://debo.life/og.png?v=2";
const OG_ALT =
  "Debo, a small red tomato, next to a phone showing the app, and the words: a friendly assistant that remembers your life";

export const metadata: Metadata = {
  metadataBase: new URL("https://debo.life"),
  title,
  description,
  applicationName: "Debo",
  // Added to an iPhone's home screen, Debo opens full screen with its own name.
  appleWebApp: { title: "Debo", statusBarStyle: "default" },
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "https://debo.life",
    siteName: "Debo",
    title,
    description,
    images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: OG_ALT }],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: OG_ALT }],
  },
};

export const viewport: Viewport = {
  themeColor: "#e9eeff",
  width: "device-width",
  initialScale: 1,
  // On Android, the on-screen keyboard shrinks the page instead of covering
  // it, so the chat's question box stays in sight above the keys.
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
