import { timingSafeEqual } from "node:crypto";
import { NextRequest } from "next/server";
import { analyzeCall, AnalysisError } from "@/voice/analyze-call";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Internal trigger for end-of-call analysis (W3-A): `POST { callId }` with
 * `x-agent-secret` (same shared secret as the agent tool routes). Re-runs even
 * when the call was analyzed before, so it doubles as the retry path.
 */
function secretOk(req: NextRequest): boolean {
  const expected = process.env.VAPI_WEBHOOK_SECRET;
  const got = req.headers.get("x-agent-secret");
  if (!expected || !got) return false;
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  if (!secretOk(req)) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  let body: { callId?: unknown; force?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }
  const callId = typeof body?.callId === "string" ? body.callId.trim() : "";
  if (!callId) return Response.json({ ok: false, error: "callId is required" }, { status: 400 });

  try {
    const result = await analyzeCall(callId, { force: body.force !== false });
    if (result.status === "not_found") return Response.json({ ok: false, error: "call not found" }, { status: 404 });
    if (result.status === "skipped") return Response.json({ ok: false, error: result.reason }, { status: 409 });
    return Response.json({ ok: true, ...result });
  } catch (err) {
    console.error(`[voice:analyze:${callId}]`, err);
    if (err instanceof AnalysisError) {
      return Response.json({ ok: false, error: err.code, message: err.message, usage: err.usage ?? null }, { status: 502 });
    }
    return Response.json({ ok: false, error: "internal", message: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
