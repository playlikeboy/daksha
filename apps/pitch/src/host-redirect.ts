/**
 * Where a request to the pitch Worker (debo-pitch) should go instead, or null to serve it.
 * Pure, so tests can run it without Next.js. See docs/DOMAINS.md for the full host table.
 *
 * The pitch is https://pitch.daksha.life. pitch.debo.life, its address before the rename,
 * sends pages to the same path and query there with a 307. Files (the deck PDF, pictures)
 * are served by Cloudflare before this runs, so old links to them keep working.
 */

export const PITCH = "https://pitch.daksha.life";

/** Hosts that move to the pitch. */
export const MOVED_HOSTS = ["pitch.debo.life"];

export function pitchRedirect(requestUrl: string, hostHeader?: string | null): string | null {
  let url: URL;
  try {
    url = new URL(requestUrl);
  } catch {
    return null;
  }
  const host = (hostHeader || url.host).toLowerCase().replace(/:\d+$/, "");
  if (!MOVED_HOSTS.includes(host)) return null;
  return `${PITCH}${url.pathname}${url.search}`;
}
