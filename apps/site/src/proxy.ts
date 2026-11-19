import { type NextRequest, NextResponse } from "next/server";
import { siteRedirect } from "./host-redirect";

// The landing page lives at www.daksha.life. Its older addresses, about.daksha.life and
// about.debo.life, send every page there with a temporary (307) redirect that keeps the path
// and query (host-redirect.ts, docs/DOMAINS.md).

export default function proxy(request: NextRequest) {
  const target = siteRedirect(request.url, request.headers.get("host"));
  if (!target) return NextResponse.next();
  return NextResponse.redirect(target, 307);
}

export const config = {
  matcher: ["/((?!_next/static/|_next/image).*)"],
};
