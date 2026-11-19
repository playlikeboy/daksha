/**
 * Where a request to the pitch Worker (debo-pitch) should go instead, or null to serve it.
 * Pure, so tests can run it without Next.js. See docs/DOMAINS.md for the full host table.
 *
 * The pitch is https://pitch.daksha.life. pitch.debo.life, its address before the rename,
 * sends pages to the same path and query there with a 307. Files (the deck PDF, pictures)
 * are served by Cloudflare before this runs, so old links to them keep working.
 *
 * The deck PDF was published as debo-pitch-deck.pdf before the rename. That file is gone, so a
 * request for it reaches this Worker, which sends it to daksha-pitch-deck.pdf with a 307.
 */

export const PITCH = "https://pitch.daksha.life";

/** Hosts that move to the pitch. */
export const MOVED_HOSTS = ["pitch.debo.life"];

/** Files published under the old name, and their name now. */
export const RENAMED_FILES: Record<string, string> = { "/debo-pitch-deck.pdf": "/daksha-pitch-deck.pdf" };

export function pitchRedirect(requestUrl: string, hostHeader?: string | null): string | null {
  let url: URL;
  try {
    url = new URL(requestUrl);
  } catch {
    return null;
  }
  const host = (hostHeader || url.host).toLowerCase().replace(/:\d+$/, "");
  const renamed = RENAMED_FILES[url.pathname];
  if (MOVED_HOSTS.includes(host)) return `${PITCH}${renamed ?? url.pathname}${url.search}`;
  if (renamed) return `${url.origin}${renamed}${url.search}`;
  return null;
}
