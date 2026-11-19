import type { MetadataRoute } from "next";

export const dynamic = "force-static";

/** Lets a person add Daksha to their phone's home screen. Colours match DESIGN.md. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Daksha",
    short_name: "Daksha",
    description: "A friendly assistant that remembers your life.",
    start_url: "/home",
    scope: "/",
    display: "standalone",
    background_color: "#e9eeff",
    theme_color: "#e9eeff",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
