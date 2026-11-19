import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: "https://about.daksha.life/", changeFrequency: "monthly", priority: 1 }];
}
