import { Hono } from "hono";

/**
 * Passes sign-in requests from the app on to Neon Auth and hands the answer back.
 *
 * Why: Neon Auth keeps a person's session in a cookie. When the app talked to Neon
 * Auth directly, that cookie belonged to Neon's own address, which browsers treat as
 * a third-party cookie and often refuse to send. Each time that happened Neon Auth
 * answered "no session" and the person was signed out. Going through this server
 * makes the cookie belong to the Debo API's address, which is the same site as the
 * app, so the browser keeps sending it.
 *
 * Phones: a native app sends no Origin header, and Neon Auth (Better Auth) can refuse
 * a cookie request that has none ("Missing or null Origin"). So when the caller sent
 * neither Origin nor Sec-Fetch-Site (browsers always send Sec-Fetch-Site, native
 * networking never does), the app's own address is filled in as the Origin. A browser
 * can never take this path, so the check still protects browser sessions.
 *
 * Nothing is stored or logged here. Only the headers sign-in needs are passed along.
 */

const REQUEST_HEADERS = ["content-type", "cookie", "origin", "authorization", "user-agent", "accept"];
const RESPONSE_HEADERS = ["content-type", "set-auth-jwt", "set-auth-token"];

export function neonAuthProxy(
  baseUrl: string,
  fetchImpl: typeof fetch = (...args) => fetch(...args),
  nativeOrigin?: string,
) {
  const base = baseUrl.replace(/\/$/, "");
  const app = new Hono();
  app.all("/*", async (c) => {
    // The part after ".../neon-auth". Dots are refused so a path can never climb out of Neon Auth's folder.
    const path = new URL(c.req.url).pathname.replace(/^.*?\/neon-auth/, "");
    if (!/^(\/[A-Za-z0-9_-]+)+$/.test(path)) return c.json({ message: "Not found" }, 404);
    const headers = new Headers();
    for (const name of REQUEST_HEADERS) {
      const value = c.req.header(name);
      if (value) headers.set(name, value);
    }
    if (nativeOrigin && !headers.has("origin") && !c.req.header("sec-fetch-site"))
      headers.set("origin", nativeOrigin);
    const method = c.req.method;
    let upstream: Response;
    try {
      upstream = await fetchImpl(`${base}${path}${new URL(c.req.url).search}`, {
        method,
        headers,
        body: method === "GET" || method === "HEAD" ? undefined : await c.req.arrayBuffer(),
        redirect: "manual",
      });
    } catch {
      return c.json({ message: "The sign-in service could not be reached." }, 502);
    }
    const out = new Headers();
    for (const name of RESPONSE_HEADERS) {
      const value = upstream.headers.get(name);
      if (value) out.set(name, value);
    }
    for (const cookie of upstream.headers.getSetCookie()) out.append("set-cookie", cookie);
    out.set("cache-control", "no-store");
    return new Response(upstream.body, { status: upstream.status, headers: out });
  });
  return app;
}
