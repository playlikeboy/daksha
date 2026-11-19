/**
 * Which API address the app talks to. Pure, so tests can run it without React Native.
 *
 * The web app is one build served on two sites: my.debo.life and my.daksha.life
 * (see docs/DOMAINS.md). It is built with one API address (EXPO_PUBLIC_API_URL,
 * https://api.debo.life). Sign-in keeps its cookie on the API address, and a browser
 * only keeps sending that cookie when the API is the same site as the page. So a page
 * on my.<twin> uses api.<twin> instead: the same API, on the twin's own address.
 *
 * Only these two sites swap. Anything else (phones, localhost, a preview on
 * workers.dev) keeps the built-in address.
 */
export const TWIN_SITES = ["debo.life", "daksha.life"];

export function apiUrlForPage(builtIn: string, pageHost: string | undefined): string {
  const api = builtIn.replace(/\/$/, "");
  if (!pageHost) return api;
  let url: URL;
  try {
    url = new URL(api);
  } catch {
    return api;
  }
  const page = pageHost.toLowerCase();
  const pageSite = TWIN_SITES.find((site) => page === `my.${site}`);
  const apiSite = TWIN_SITES.find((site) => url.hostname === `api.${site}`);
  if (!pageSite || !apiSite || pageSite === apiSite) return api;
  url.hostname = `api.${pageSite}`;
  return url.origin;
}
