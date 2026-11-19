import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: "https://www.daksha.life/", changeFrequency: "monthly", priority: 1 }];
}
