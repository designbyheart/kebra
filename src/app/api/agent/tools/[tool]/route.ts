import { timingSafeEqual } from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { registry, type ToolContext } from "@/agent/registry";
import { ToolError } from "@/agent/errors";

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
      {
        ok: false,
        error: { code: "validation", message: "invalid input", details: z.treeifyError(parsed.error) },
        speech_hint: "I'm missing a detail I need for that. Could you repeat it?",
        toolCallId: firstCall?.id ?? null,
      },
      { status: 400 },
    );
  }

  const toolCtx: ToolContext = { callId, actor: "agent", actorId: "vapi" };
  const started = Date.now();
  try {
    const result = await def.handler(parsed.data, toolCtx);
    // Convention (docs/TOOLS.md): handlers may include `speech_hint` in their
    // result; it is hoisted to the envelope so the model finds it in one place.
    const { speech_hint, ...rest } =
      result && typeof result === "object" && "speech_hint" in (result as Record<string, unknown>)
        ? (result as Record<string, unknown> & { speech_hint?: string })
        : { speech_hint: undefined, ...(result as Record<string, unknown>) };
    return Response.json({
      ok: true,
      result: rest,
      speech_hint: speech_hint ?? null,
      ms: Date.now() - started,
      toolCallId: firstCall?.id ?? null,
    });
  } catch (err) {
    if (err instanceof ToolError) {
      return Response.json(
        {
          ok: false,
          error: { code: err.code, message: err.message, details: err.details ?? null },
          speech_hint: err.speechHint,
          toolCallId: firstCall?.id ?? null,
        },
        { status: err.status },
      );
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[tool:${tool}]`, err);
    return Response.json(
      {
        ok: false,
        error: { code: "internal", message: msg },
        speech_hint: "Something went wrong on my end. Let me try that a different way.",
        toolCallId: firstCall?.id ?? null,
      },
      { status: 500 },
    );
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
