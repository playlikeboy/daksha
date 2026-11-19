/**
 * Where a request to the landing page Worker (debo-site) should go instead, or null to serve it.
 * Pure, so tests can run it without Next.js. See docs/DOMAINS.md for the full host table.
 *
 * The landing page is https://www.daksha.life. about.daksha.life and about.debo.life (its
 * addresses before) send pages to the same path and query there with a 307. Files (films,
 * pictures, fonts) are served by Cloudflare before this runs, so they keep working on every
 * host, and video keeps its Range requests.
 */

export const LANDING = "https://www.daksha.life";

/** Hosts that move to the landing page. */
export const MOVED_HOSTS = ["about.daksha.life", "about.debo.life"];

export function siteRedirect(requestUrl: string, hostHeader?: string | null): string | null {
  let url: URL;
  try {
    url = new URL(requestUrl);
  } catch {
    return null;
  }
  const host = (hostHeader || url.host).toLowerCase().replace(/:\d+$/, "");
  if (!MOVED_HOSTS.includes(host)) return null;
  return `${LANDING}${url.pathname}${url.search}`;
}
