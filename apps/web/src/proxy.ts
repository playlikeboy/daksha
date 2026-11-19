import { type NextRequest, NextResponse } from "next/server";
import { webRedirect } from "./lib/host-redirect";

// daksha.life no longer shows the old app. The landing page lives at www.daksha.life and the
// app at my.daksha.life, so pages here send people there. /privacy, every /api/* route (sign-in
// email webhook, voice, export, delete account) and files like robots.txt and sitemap.xml are
// still served. debo.life and www.debo.life, the addresses from before the rename, send every
// page on to daksha.life, but keep serving /api/*. The rules and their tests are in
// lib/host-redirect.ts; the host table is in docs/DOMAINS.md.
//
// These are temporary (307) redirects on purpose, so they are easy to change later.

export default function proxy(request: NextRequest) {
  const target = webRedirect(request.url, request.headers.get("host"));
  if (!target) return NextResponse.next();
  return NextResponse.redirect(target, 307);
}

export const config = {
  // /api/* and Next.js build files never move. Everything else is decided in webRedirect.
  matcher: ["/((?!api/|_next/static/|_next/image).*)"],
};
