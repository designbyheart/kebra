/**
 * Vapi server-message handlers (W2-A). Pure functions over the parsed
 * `message` object so they can be unit-tested with fixtures; the route only
 * does auth, JSON and timing. Payload shapes verified against
 * https://api.vapi.ai/api-json (ServerMessage*).
 */
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { registry, type ToolContext } from "@/agent/registry";
import { ToolError } from "@/agent/errors";
import type { TranscriptTurn } from "@/db/schema";
import { formatDateTimeET } from "@/lib/time";
import {
  appendTranscript,
  directionFromVapiType,
  emitCallEvent,
  ensureCall,
  finalizeCall,
  getCallByProviderId,
  lookupCaller,
  markIdentified,
  maskPhone,
  recordToolCall,
  statusFromVapi,
  upsertCallFromStatus,
  type CallMeta,
  type Identification,
} from "@/domain/calls";

// ---------------------------------------------------------------------------
// Types (the subset of Vapi's ServerMessage we read)
// ---------------------------------------------------------------------------

export type VapiCall = {
  id: string;
  type?: string;
  status?: string;
  endedReason?: string;
  startedAt?: string;
  endedAt?: string;
  customer?: { number?: string; name?: string };
  phoneNumber?: { number?: string };
};

export type VapiToolCall = {
  id: string;
  type?: string;
  function?: { name?: string; arguments?: unknown };
  /** Older/alternate shape. */
  name?: string;
  arguments?: unknown;
  parameters?: unknown;
};

export type VapiMessage = {
  type: string;
  call?: VapiCall;
  timestamp?: number;
  // status-update
  status?: string;
  endedReason?: string;
  // transcript
  role?: "user" | "assistant";
  transcript?: string;
  transcriptType?: "partial" | "final";
  // tool-calls
  toolCallList?: VapiToolCall[];
  toolWithToolCallList?: Array<{ toolCall?: VapiToolCall; name?: string }>;
  // end-of-call-report
  analysis?: { summary?: string; successEvaluation?: unknown; structuredData?: unknown };
  artifact?: {
    recordingUrl?: string;
    stereoRecordingUrl?: string;
    recording?: { mono?: { combinedUrl?: string }; stereoUrl?: string };
    transcript?: string;
    messages?: Array<{ role?: string; message?: string; time?: number; secondsFromStart?: number }>;
  };
  cost?: number;
  startedAt?: string;
  endedAt?: string;
  durationSeconds?: number;
  // transfer-update
  destination?: { type?: string; number?: string; description?: string; sipUri?: string };
  [key: string]: unknown;
};

export type WebhookResult = { status: number; body: unknown };

export type ToolEnvelope =
  | { ok: true; result: unknown; speech_hint: string | null }
  | { ok: false; error: { code: string; message: string; details?: unknown }; speech_hint: string };

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export function verifyVapiSecret(got: string | null | undefined, expected = process.env.VAPI_WEBHOOK_SECRET): boolean {
  if (!expected || !got) return false;
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

export async function handleVapiMessage(msg: VapiMessage): Promise<WebhookResult> {
  switch (msg.type) {
    case "assistant-request":
      return handleAssistantRequest(msg);
    case "status-update":
      return handleStatusUpdate(msg);
    case "transcript":
      return handleTranscript(msg);
    case "tool-calls":
      return handleToolCalls(msg);
    case "end-of-call-report":
      return handleEndOfCallReport(msg);
    case "hang":
      return handleHang(msg);
    case "transfer-update":
      return handleTransferUpdate(msg);
    default:
      return { status: 200, body: {} };
  }
}

function callMeta(msg: VapiMessage): CallMeta | null {
  const call = msg.call;
  if (!call?.id) return null;
  const direction = directionFromVapiType(call.type);
  return {
    providerCallId: call.id,
    direction,
    callerNumber: direction === "web" ? null : (call.customer?.number ?? null),
    startedAt: call.startedAt ? new Date(call.startedAt) : null,
  };
}

/** Seconds since call start for a message timestamp (falls back to wall clock). */
function secondsFromStart(msg: VapiMessage): number {
  const started = msg.call?.startedAt ? Date.parse(msg.call.startedAt) : NaN;
  const ts = typeof msg.timestamp === "number" ? msg.timestamp : Date.now();
  if (!Number.isFinite(started)) return 0;
  return Math.max(0, Math.round((ts - started) / 100) / 10);
}

// ---------------------------------------------------------------------------
// assistant-request
// ---------------------------------------------------------------------------

export async function handleAssistantRequest(msg: VapiMessage): Promise<WebhookResult> {
  const assistantId = process.env.VAPI_ASSISTANT_ID;
  const nowEt = formatDateTimeET(new Date());
  if (!assistantId) {
    console.error("[voice] assistant-request but VAPI_ASSISTANT_ID is not set");
    return { status: 200, body: { error: "The front desk is not set up yet. Please call back shortly." } };
  }
  const number = msg.call?.type === "webCall" ? null : msg.call?.customer?.number;
  const caller = await lookupCaller(number);
  return {
    status: 200,
    body: {
      assistantId,
      assistantOverrides: {
        variableValues: {
          caller_name: caller.callerName ?? "",
          known_sites: caller.knownSites.join("; "),
          now_et: nowEt,
        },
      },
    },
  };
}

// ---------------------------------------------------------------------------
// status-update / transcript / hang / transfer-update
// ---------------------------------------------------------------------------

export async function handleStatusUpdate(msg: VapiMessage): Promise<WebhookResult> {
  const meta = callMeta(msg);
  const status = statusFromVapi(msg.status);
  if (!meta || !status) return { status: 200, body: {} };
  await upsertCallFromStatus({
    ...meta,
    status,
    endedReason: msg.endedReason ?? null,
    endedAt: status === "ended" ? new Date(msg.call?.endedAt ?? Date.now()) : null,
  });
  return { status: 200, body: {} };
}

export async function handleTranscript(msg: VapiMessage): Promise<WebhookResult> {
  const meta = callMeta(msg);
  if (!meta || msg.transcriptType !== "final" || !msg.transcript?.trim()) return { status: 200, body: {} };
  const { id } = await ensureCall(meta);
  const role: TranscriptTurn["role"] = msg.role === "assistant" ? "assistant" : "user";
  await appendTranscript(id, [{ role, text: msg.transcript.trim(), t: secondsFromStart(msg) }]);
  return { status: 200, body: {} };
}

export async function handleHang(msg: VapiMessage): Promise<WebhookResult> {
  const meta = callMeta(msg);
  if (!meta) return { status: 200, body: {} };
  const { id } = await ensureCall(meta);
  await emitCallEvent(id, "call.hang", { summary: "Caller waited with no response from the agent (hang)" });
  return { status: 200, body: {} };
}

export async function handleTransferUpdate(msg: VapiMessage): Promise<WebhookResult> {
  const meta = callMeta(msg);
  if (!meta) return { status: 200, body: {} };
  const { id } = await ensureCall(meta);
  const to = msg.destination?.number ?? msg.destination?.sipUri ?? null;
  await emitCallEvent(id, "call.transfer_attempted", {
    summary: `Agent transferred the call to the office${to ? ` (${maskPhone(to) ?? to})` : ""}`,
    to_masked: to ? (maskPhone(to) ?? to) : null,
    reason: msg.destination?.description ?? "handoff",
  });
  return { status: 200, body: {} };
}

// ---------------------------------------------------------------------------
// tool-calls
// ---------------------------------------------------------------------------

export function parseToolCall(tc: VapiToolCall): { name: string; args: unknown } {
  const name = tc.function?.name ?? tc.name ?? "";
  const raw = tc.function?.arguments ?? tc.arguments ?? tc.parameters ?? {};
  let args: unknown = raw;
  if (typeof raw === "string") {
    try {
      args = raw.trim() ? JSON.parse(raw) : {};
    } catch {
      args = { __unparsable: raw };
    }
  }
  return { name, args: args ?? {} };
}

/** Run one registry tool and shape the envelope Vapi's model reads. */
export async function runTool(name: string, args: unknown, ctx: ToolContext): Promise<ToolEnvelope> {
  const def = registry[name];
  if (!def) {
    return {
      ok: false,
      error: { code: "not_found", message: `unknown tool: ${name}` },
      speech_hint: "I can't do that from here, but the office can. Want me to flag it for them?",
    };
  }
  const parsed = def.input.safeParse(args);
  if (!parsed.success) {
    return {
      ok: false,
      error: { code: "validation", message: "invalid input", details: z.treeifyError(parsed.error) },
      speech_hint: "I'm missing a detail I need for that. Could you repeat it?",
    };
  }
  try {
    const result = await def.handler(parsed.data, ctx);
    const { speech_hint, ...rest } =
      result && typeof result === "object" && "speech_hint" in (result as Record<string, unknown>)
        ? (result as Record<string, unknown> & { speech_hint?: string })
        : { speech_hint: undefined, ...((result as Record<string, unknown>) ?? {}) };
    return { ok: true, result: rest, speech_hint: (speech_hint as string | undefined) ?? null };
  } catch (err) {
    if (err instanceof ToolError) {
      return {
        ok: false,
        error: { code: err.code, message: err.message, details: err.details ?? null },
        speech_hint: err.speechHint,
      };
    }
    console.error(`[voice:tool:${name}]`, err);
    return {
      ok: false,
      error: { code: "internal", message: err instanceof Error ? err.message : String(err) },
      speech_hint: "Something went wrong on my end. I can have the office follow up on that.",
    };
  }
}

type Candidate = { address_id?: string; customer_id?: string; confidence?: number; label?: string; matched_by?: string };

/** Did this successful tool call identify the caller? (kept out of the tools on purpose) */
export function identificationFrom(name: string, args: unknown, env: ToolEnvelope): Identification | null {
  if (!env.ok) return null;
  const a = (args ?? {}) as Record<string, unknown>;
  const r = (env.result ?? {}) as Record<string, unknown>;
  switch (name) {
    case "find_address": {
      const cands = (r.candidates as Candidate[] | undefined) ?? [];
      const top = cands[0];
      if (!top?.customer_id || r.needs_unit) return null;
      const second = cands[1];
      const clear =
        (top.confidence ?? 0) >= 0.85 &&
        (!second || second.label === top.label || (second.confidence ?? 0) <= (top.confidence ?? 0) - 0.1);
      return clear ? { customerId: top.customer_id, addressId: top.address_id ?? null, method: "address" } : null;
    }
    case "find_customer": {
      const cands = (r.candidates as Candidate[] | undefined) ?? [];
      const top = cands[0];
      if (!top?.customer_id) return null;
      const second = cands[1];
      if (top.matched_by === "phone" && (!second || second.matched_by !== "phone")) {
        return { customerId: top.customer_id, method: "phone" };
      }
      if ((top.confidence ?? 0) >= 0.85 && (!second || (second.confidence ?? 0) <= (top.confidence ?? 0) - 0.15)) {
        return { customerId: top.customer_id, method: "name" };
      }
      return null;
    }
    case "book_job":
    case "save_caller_phone":
      return typeof a.customer_id === "string"
        ? { customerId: a.customer_id, addressId: typeof a.address_id === "string" ? a.address_id : null, method: "address" }
        : null;
    case "get_address_dossier": {
      const cust = r.customer as { customer_id?: string } | undefined;
      return cust?.customer_id && typeof a.address_id === "string"
        ? { customerId: cust.customer_id, addressId: a.address_id, method: "address" }
        : null;
    }
    default:
      return null;
  }
}

export async function handleToolCalls(msg: VapiMessage): Promise<WebhookResult> {
  const list: VapiToolCall[] =
    msg.toolCallList ??
    (msg.toolWithToolCallList ?? []).map((x) => x.toolCall).filter((x): x is VapiToolCall => Boolean(x));
  const meta = callMeta(msg);
  const callId = meta ? (await ensureCall(meta)).id : null;
  const ctx: ToolContext = { callId, actor: "agent", actorId: "vapi" };
  const startedAtCall = secondsFromStart(msg);

  const results = await Promise.all(
    list.map(async (tc) => {
      const { name, args } = parseToolCall(tc);
      const t0 = Date.now();
      const env = await runTool(name, args, ctx);
      const ms = Date.now() - t0;
      console.log(JSON.stringify({ tag: "voice.tool", call: callId, tool: name, ok: env.ok, ms }));
      if (callId) {
        const record = { id: tc.id, name, args, result: env, ok: env.ok, t: startedAtCall, durationMs: ms };
        const ident = identificationFrom(name, args, env);
        await Promise.all([recordToolCall(callId, record), ident ? markIdentified(callId, ident) : Promise.resolve()]);
      }
      return { name, toolCallId: tc.id, result: JSON.stringify(env) };
    }),
  );
  return { status: 200, body: { results } };
}

// ---------------------------------------------------------------------------
// end-of-call-report
// ---------------------------------------------------------------------------

export function transcriptFromReport(msg: VapiMessage): TranscriptTurn[] {
  const rows = msg.artifact?.messages ?? [];
  const out: TranscriptTurn[] = [];
  for (const m of rows) {
    const role = m.role === "bot" || m.role === "assistant" ? "assistant" : m.role === "user" ? "user" : null;
    if (!role || !m.message?.trim()) continue;
    out.push({ role, text: m.message.trim(), t: Math.round((m.secondsFromStart ?? 0) * 10) / 10 });
  }
  return out;
}

const TRANSFER_FAIL_REASONS = /forward|transfer/i;

export async function handleEndOfCallReport(msg: VapiMessage): Promise<WebhookResult> {
  const meta = callMeta(msg);
  if (!meta) return { status: 200, body: {} };
  const { id } = await ensureCall(meta);
  const recordingUrl =
    msg.artifact?.recordingUrl ?? msg.artifact?.recording?.mono?.combinedUrl ?? msg.artifact?.stereoRecordingUrl ?? null;
  const endedReason = msg.endedReason ?? msg.call?.endedReason?.toString() ?? null;
  const { artifact: _artifact, ...rawRest } = msg;
  void _artifact;
  await finalizeCall(id, {
    summary: msg.analysis?.summary ?? null,
    recordingUrl,
    endedReason,
    costCents: typeof msg.cost === "number" ? Math.round(msg.cost * 100) : null,
    startedAt: msg.startedAt ? new Date(msg.startedAt) : null,
    endedAt: msg.endedAt ? new Date(msg.endedAt) : null,
    transcript: transcriptFromReport(msg),
    raw: { ...rawRest, analysis: msg.analysis ?? null, recordingUrl } as Record<string, unknown>,
  });
  if (endedReason && TRANSFER_FAIL_REASONS.test(endedReason) && endedReason !== "assistant-forwarded-call") {
    await emitCallEvent(id, "call.transfer_failed", {
      summary: `Transfer to the office failed (${endedReason.replace(/[-_.]+/g, " ")})`,
      reason: endedReason,
    });
  }
  return { status: 200, body: {} };
}

/** For tests and the route: our row for a Vapi call id. */
export { getCallByProviderId };
