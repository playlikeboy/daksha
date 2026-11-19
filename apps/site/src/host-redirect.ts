/**
 * Where a request to the landing page Worker (debo-site) should go instead, or null to serve it.
 * Pure, so tests can run it without Next.js. See docs/DOMAINS.md for the full host table.
 *
 * The landing page is https://www.daksha.life. about.daksha.life and about.debo.life (its
 * addresses before) send pages to the same path and query there with a 307. Files (films,
 * pictures, fonts) are served by Cloudflare before this runs, so they keep working on every
 * host, and video keeps its Range requests.
 *
 * The films were published as debo-*.mp4 and so on before the rename. Those files are gone, so
 * a request for one reaches this Worker, which sends it to the daksha-* file with a 307.
 */

export const LANDING = "https://www.daksha.life";

/** Hosts that move to the landing page. */
export const MOVED_HOSTS = ["about.daksha.life", "about.debo.life"];

/** Files published under the old name, and their name now. */
export const RENAMED_FILES: Record<string, string> = Object.fromEntries(
  [
    "launch.mp4",
    "launch.webm",
    "launch-vertical.mp4",
    "launch-poster.webp",
    "launch.en.vtt",
    "demo.mp4",
    "demo.webm",
    "demo-poster.webp",
    "demo.en.vtt",
  ].map((file) => [`/debo-${file}`, `/daksha-${file}`]),
);

export function siteRedirect(requestUrl: string, hostHeader?: string | null): string | null {
  let url: URL;
  try {
    url = new URL(requestUrl);
  } catch {
    return null;
  }
  const host = (hostHeader || url.host).toLowerCase().replace(/:\d+$/, "");
  const renamed = RENAMED_FILES[url.pathname];
  if (MOVED_HOSTS.includes(host)) return `${LANDING}${renamed ?? url.pathname}${url.search}`;
  if (renamed) return `${url.origin}${renamed}${url.search}`;
  return null;
}
