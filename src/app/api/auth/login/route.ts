import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { login, safeNextPath } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Body = z.object({
  email: z.string().trim().min(1).max(200),
  password: z.string().min(1).max(200),
  next: z.string().max(500).optional(),
});

/**
 * POST /api/auth/login — JSON `{ email, password, next? }` or a form post.
 * JSON callers get `{ ok, user, next }`; form posts get a 303 to `next`
 * (or back to /login?error=1) so the page works without JavaScript.
 */
export async function POST(req: NextRequest) {
  const ct = req.headers.get("content-type") ?? "";
  const isForm = ct.includes("application/x-www-form-urlencoded") || ct.includes("multipart/form-data");

  let raw: unknown;
  try {
    raw = isForm ? Object.fromEntries((await req.formData()).entries()) : await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid body" }, { status: 400 });
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    if (isForm) return NextResponse.redirect(new URL("/login?error=1", req.url), 303);
    return NextResponse.json({ ok: false, error: "email and password are required" }, { status: 400 });
  }

  const next = safeNextPath(parsed.data.next);
  const user = await login(parsed.data.email, parsed.data.password);
  if (!user) {
    if (isForm) {
      return NextResponse.redirect(new URL(`/login?error=1&next=${encodeURIComponent(next)}`, req.url), 303);
    }
    return NextResponse.json({ ok: false, error: "Invalid email or password" }, { status: 401 });
  }

  if (isForm) return NextResponse.redirect(new URL(next, req.url), 303);
  return NextResponse.json({ ok: true, user, next });
}
