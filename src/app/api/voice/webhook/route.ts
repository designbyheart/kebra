import { NextRequest } from "next/server";
import { handleVapiMessage, verifyVapiSecret, type VapiMessage } from "@/voice/webhook";
import { SECRET_HEADER } from "@/voice/assistant";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Vapi server URL. Every message type lands here; the assistant and each tool
 * are configured (scripts/vapi-sync.ts) to send `x-vapi-secret`.
 */
export async function POST(req: NextRequest) {
  if (!verifyVapiSecret(req.headers.get(SECRET_HEADER))) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }
  const message = ((body as { message?: unknown })?.message ?? body) as VapiMessage;
  if (!message || typeof message !== "object" || typeof message.type !== "string") {
    return Response.json({ ok: false, error: "missing message.type" }, { status: 400 });
  }

  const started = Date.now();
  try {
    const { status, body: out } = await handleVapiMessage(message);
    console.log(
      JSON.stringify({
        tag: "voice.webhook",
        type: message.type,
        call: message.call?.id ?? null,
        status: message.status ?? null,
        ms: Date.now() - started,
      }),
    );
    return Response.json(out, { status });
  } catch (err) {
    console.error(`[voice:webhook:${message.type}]`, err);
    if (message.type === "tool-calls") {
      // Give the model something to say rather than a dead tool.
      const list = message.toolCallList ?? [];
      return Response.json({
        results: list.map((tc) => ({
          toolCallId: tc.id,
          result: JSON.stringify({
            ok: false,
            error: { code: "internal", message: "webhook failure" },
            speech_hint: "Something went wrong on my end. I can have the office follow up on that.",
          }),
        })),
      });
    }
    if (message.type === "assistant-request") {
      return Response.json({ error: "The front desk is having trouble right now. Please call back in a moment." });
    }
    // Informational messages: never make Vapi retry.
    return Response.json({ ok: false }, { status: 200 });
  }
}

export async function GET() {
  return Response.json({ ok: true, endpoint: "vapi server url", accepts: "POST" });
}
