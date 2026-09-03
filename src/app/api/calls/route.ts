import { NextRequest, NextResponse } from "next/server";
import { listCalls, parseFilter } from "@/app/calls/data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/calls?f=<all|live|today|review|handoffs>&q=<text>
 * Same rows the server render uses; the list page polls this for refresh.
 * Session is enforced by the proxy.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const data = await listCalls({ filter: parseFilter(sp.get("f")), q: sp.get("q") });
  return NextResponse.json({ ok: true, ...data }, { headers: { "Cache-Control": "no-store" } });
}
