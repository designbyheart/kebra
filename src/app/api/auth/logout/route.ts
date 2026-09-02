import { NextRequest, NextResponse } from "next/server";
import { logout } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** POST /api/auth/logout — clears the cookie. Form posts get a 303 to /login; JSON callers get `{ ok: true }`. */
export async function POST(req: NextRequest) {
  await logout();
  const accept = req.headers.get("accept") ?? "";
  const ct = req.headers.get("content-type") ?? "";
  const wantsHtml = accept.includes("text/html") || ct.includes("application/x-www-form-urlencoded");
  if (wantsHtml) return NextResponse.redirect(new URL("/login", req.url), 303);
  return NextResponse.json({ ok: true });
}
