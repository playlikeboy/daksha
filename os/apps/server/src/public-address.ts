/**
 * The API answers on more than one address: api.daksha.life, and api.debo.life from before
 * the rename (see docs/DOMAINS.md). PUBLIC_API_URL is the one other services keep on file:
 * the Google, Composio and tool server callbacks, and signed file links, always use it. It
 * stays https://api.debo.life until those callbacks are registered on api.daksha.life.
 *
 * Sign-in is different. Its cookie belongs to the API address the app called through,
 * and a browser only keeps sending it when that address is the same site as the app.
 * So the app at my.daksha.life signs in through api.daksha.life, and the sign-in address
 * the API hands out follows the address that was called, when that is one of the extra
 * addresses listed in PUBLIC_API_URL_ALIASES. Any other Host gets PUBLIC_API_URL, so a
 * made-up Host header can never choose the address.
 */

/** Reads PUBLIC_API_URL_ALIASES: a comma-separated list of http(s) addresses. Bad entries are skipped. */
export function readPublicUrlAliases(value: string | undefined): string[] {
  const aliases: string[] = [];
  for (const part of (value ?? "").split(",")) {
    const text = part.trim();
    if (!text) continue;
    let url: URL;
    try {
      url = new URL(text);
    } catch {
      console.warn("[Daksha] PUBLIC_API_URL_ALIASES has an entry that is not an address; it is skipped.");
      continue;
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") continue;
    aliases.push(url.origin);
  }
  return aliases;
}

/** The public address to hand back for a request: the alias it came in on, or PUBLIC_API_URL. */
export function publicUrlFor(
  config: { publicUrl: string; publicUrlAliases?: string[] },
  requestUrl: string,
): string {
  const main = config.publicUrl.replace(/\/$/, "");
  let host: string;
  try {
    host = new URL(requestUrl).host.toLowerCase();
  } catch {
    return main;
  }
  return config.publicUrlAliases?.find((alias) => new URL(alias).host === host) ?? main;
}
