import { timingSafeEqual } from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { registry, type ToolContext } from "@/agent/registry";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function secretOk(req: NextRequest): boolean {
  const expected = process.env.VAPI_WEBHOOK_SECRET;
  const got = req.headers.get("x-agent-secret");
  if (!expected || !got) return false;
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

type Ctx = { params: Promise<{ tool: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  if (!secretOk(req)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const { tool } = await ctx.params;
  const def = registry[tool];
  if (!def) {
    return Response.json({ ok: false, error: `unknown tool: ${tool}` }, { status: 404 });
  }

  let raw: unknown = {};
  try {
    const text = await req.text();
    raw = text ? JSON.parse(text) : {};
  } catch {
    return Response.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  // Accept either a bare argument object or Vapi's { message: { toolCalls: [...] } }
  // envelope; W2-A will formalise the Vapi shape and per-toolCallId results.
  const body = raw as Record<string, unknown>;
  const message = body?.message as Record<string, unknown> | undefined;
  const toolCalls = (message?.toolCalls ?? message?.toolCallList) as
    | Array<{ id?: string; function?: { name?: string; arguments?: unknown } }>
    | undefined;
  const firstCall = Array.isArray(toolCalls) ? toolCalls[0] : undefined;
  const args = firstCall
    ? typeof firstCall.function?.arguments === "string"
      ? safeJson(firstCall.function.arguments)
      : (firstCall.function?.arguments ?? {})
    : body;
  const callId = (message?.call as { id?: string } | undefined)?.id ?? req.headers.get("x-call-id") ?? null;

  const parsed = def.input.safeParse(args);
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: "invalid input", issues: z.treeifyError(parsed.error) },
      { status: 400 },
    );
  }

  const toolCtx: ToolContext = { callId, actor: "agent", actorId: "vapi" };
  const started = Date.now();
  try {
    const result = await def.handler(parsed.data, toolCtx);
    return Response.json({ ok: true, result, ms: Date.now() - started, toolCallId: firstCall?.id ?? null });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[tool:${tool}]`, err);
    return Response.json({ ok: false, error: msg, toolCallId: firstCall?.id ?? null }, { status: 500 });
  }
}

export async function GET(req: NextRequest, ctx: Ctx) {
  if (!secretOk(req)) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const { tool } = await ctx.params;
  const def = registry[tool];
  if (!def) return Response.json({ ok: false, error: `unknown tool: ${tool}` }, { status: 404 });
  return Response.json({ ok: true, tool, description: def.description, input: z.toJSONSchema(def.input) });
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}
