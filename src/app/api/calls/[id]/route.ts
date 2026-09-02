import { NextRequest, NextResponse } from "next/server";
import { getCall } from "@/app/calls/data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/calls/:id — the full call record (transcript, tool calls, derived
 * actions, tasks). The detail page polls this every 2 s while the call is live.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const call = await getCall(id);
  if (!call) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true, call }, { headers: { "Cache-Control": "no-store" } });
}
