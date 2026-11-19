/**
 * Where a request to the debo-web Worker should go instead, or null to serve it here.
 * Pure, so tests can run it without Next.js. See docs/DOMAINS.md for the full host table.
 *
 * This Worker answers on daksha.life, and on debo.life and www.debo.life from before the
 * rename. It still serves the privacy page and every /api/* route (the Neon Auth sign-in
 * email webhook, voice, export, delete account). Everything else moved:
 *
 * - daksha.life: "/" and other pages go to the same path on the landing page at
 *   https://www.daksha.life. The old signed-in screens go to the app at https://my.daksha.life.
 *   /privacy, /api/* and files (robots.txt, sitemap.xml, icons, the share image) stay here.
 * - debo.life and www.debo.life: every page goes to daksha.life, straight to wherever
 *   daksha.life would send it, so there is one hop. /api/* stays here on every host, so old
 *   webhook addresses keep working.
 *
 * All are temporary (307) redirects, which keep the method, path and query, and are easy to
 * change later.
 */

export const LANDING = "https://www.daksha.life";
const LANDING_HOST = "www.daksha.life";
export const ROOT = "https://daksha.life";
export const APP = "https://my.daksha.life";

/** Hosts from before the rename. Their pages move to the same path on daksha.life. */
export const OLD_HOSTS = ["debo.life", "www.debo.life"];

// Old signed-in screens and the screen they became in the new app.
const OLD_SCREENS: Record<string, string> = {
  "/home": "/chat",
  "/home/chat": "/chat",
  "/home/journal": "/journal",
  "/home/memories": "/knows",
  "/home/activity": "/tasks",
  "/home/voice": "/talk",
};

function isApi(path: string): boolean {
  return path === "/api" || path.startsWith("/api/");
}

/** A path this Worker serves on daksha.life: the privacy page, Next.js files and files like /robots.txt. */
function servedOnRoot(path: string): boolean {
  if (path === "/privacy" || path.startsWith("/privacy/")) return true;
  if (path.startsWith("/_next/")) return true;
  const last = path.slice(path.lastIndexOf("/") + 1);
  return last.includes(".");
}

/** Where daksha.life sends a path, or null when it serves the path itself. */
function rootTarget(path: string, search: string): string | null {
  if (isApi(path) || servedOnRoot(path)) return null;
  const trimmed = path.replace(/\/+$/, "") || "/";
  // Sign-in and sign-up live in the new app, which has its own sign-in.
  if (trimmed === "/auth" || trimmed.startsWith("/auth/")) return APP;
  if (trimmed === "/home" || trimmed.startsWith("/home/")) return `${APP}${OLD_SCREENS[trimmed] ?? "/"}`;
  return `${LANDING}${path}${search}`;
}

export function webRedirect(requestUrl: string, hostHeader?: string | null): string | null {
  let url: URL;
  try {
    url = new URL(requestUrl);
  } catch {
    return null;
  }
  const host = (hostHeader || url.host).toLowerCase().replace(/:\d+$/, "");
  const path = url.pathname;
  if (isApi(path)) return null;
  // www.daksha.life belongs to the landing page Worker. While a deploy moves it over, it may
  // still reach this Worker for a moment: serve it rather than send it back to itself.
  if (host === LANDING_HOST) return null;
  if (OLD_HOSTS.includes(host)) return rootTarget(path, url.search) ?? `${ROOT}${path}${url.search}`;
  return rootTarget(path, url.search);
}
