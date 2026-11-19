import { type NextRequest, NextResponse } from "next/server";
import { pitchRedirect } from "./host-redirect";

// The pitch lives at pitch.daksha.life. pitch.debo.life, its address before the rename, sends
// every page there with a temporary (307) redirect that keeps the path and query
// (host-redirect.ts, docs/DOMAINS.md).

export default function proxy(request: NextRequest) {
  const target = pitchRedirect(request.url, request.headers.get("host"));
  if (!target) return NextResponse.next();
  return NextResponse.redirect(target, 307);
}

export const config = {
  matcher: ["/((?!_next/static/|_next/image).*)"],
};
