import { NextResponse, type NextRequest } from "next/server";
import {
  SESSION_COOKIE,
  sessionCookieOptions,
  shouldRefresh,
  signSession,
  verifySession,
} from "@/lib/session";

/**
 * Session guard. Everything requires a session except the public list below.
 * Agent and voice webhooks authenticate with their own secrets inside the
 * route handlers (`x-agent-secret` / Vapi secret), never with a cookie.
 */

const PUBLIC_EXACT = new Set(["/login", "/call", "/api/health"]);
const PUBLIC_PREFIXES = ["/api/voice/", "/api/agent/", "/api/auth/", "/_next/"];

export function isPublicPath(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p) || pathname === p.slice(0, -1))) return true;
  // static assets served from /public (favicon.ico, images, fonts, ...)
  if (/\.[a-z0-9]+$/i.test(pathname)) return true;
  return false;
}

export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  // Downstream server components read this to build `?next=` on redirect.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-pathname", pathname + search);

  if (isPublicPath(pathname)) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  if (shouldRefresh(session)) {
    const token = await signSession(session);
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  }
  return res;
}

export const config = {
  // Skip Next internals and files with an extension; everything else goes through the guard.
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico).*)"],
};
