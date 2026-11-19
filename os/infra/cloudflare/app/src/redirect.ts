/**
 * Where a request to the app Worker should go instead, or null to serve the app.
 * Pure, so tests can run it without a Worker.
 *
 * my.debo.life is the app's address from before the rename to Daksha (docs/DOMAINS.md).
 * Every request there, pages and files alike, gets a 307 to the same path and query on
 * my.daksha.life. The app talks to api.daksha.life, and a page on a debo.life host could
 * not keep that sign-in cookie. A 307 keeps the method and body, and a browser sends a
 * Range header again to the new address, so video and partial downloads still work.
 */

export const APP_ORIGIN = "https://my.daksha.life";

/** Old hosts this Worker answers on, and the origin each one moves to. */
export const MOVED_HOSTS: Readonly<Record<string, string>> = {
  "my.debo.life": APP_ORIGIN,
};

export function appRedirect(requestUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(requestUrl);
  } catch {
    return null;
  }
  const target = MOVED_HOSTS[url.hostname.toLowerCase()];
  if (!target) return null;
  return `${target}${url.pathname}${url.search}`;
}
