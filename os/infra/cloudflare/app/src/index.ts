// debo-os-app: serves the Expo web export (the ASSETS binding, with single-page-app fallback),
// and sends the old my.debo.life address on to my.daksha.life with a 307 (see redirect.ts).
import { appRedirect } from "./redirect";

// Only the part of the assets binding this Worker uses. Plain types, so the os tests can load
// this file without the Workers type package.
interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env, _ctx?: unknown): Promise<Response> {
    const target = appRedirect(request.url);
    if (target) {
      return new Response(null, {
        status: 307,
        headers: { Location: target, "Cache-Control": "no-store" },
      });
    }
    return env.ASSETS.fetch(request);
  },
};
