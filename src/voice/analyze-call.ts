/**
 * End-of-call intelligence (W3-A). One Claude request per ended call turns
 * the transcript, the tool calls and the call's events into a summary, an
 * outcome, the promises the agent made (each marked as backed by an event or
 * not) and a needs-review flag. Writes `calls.summary/outcome/promises/
 * needs_review`, emits `call.analyzed`, and opens one Inbox `review` task per
 * call for promises nothing on the platform backs.
 *
 * The SDK call is isolated in `callModel` so tests inject a fake and
 * `scripts/analyze-calls.ts --dry-run` prints the request without sending it.
 * "Already analyzed" means a `call.analyzed` event exists for the call: Vapi
 * also writes `calls.summary` at end of call, so the column cannot be the marker.
 */
import Anthropic from "@anthropic-ai/sdk";
import { and, asc, desc, eq, inArray, notExists } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  addresses,
  calls,
  customers,
  events,
  tasks,
  type Call,
  type Event,
  type Promise_,
  type ToolCallRecord,
  type TranscriptTurn,
} from "@/db/schema";
import { costCents, getAnthropic, usageOf, type TokenUsage } from "@/lib/anthropic";
import { emitEvent } from "@/lib/events";
import { formatDateTimeET } from "@/lib/time";
import { createTask } from "@/domain/tasks";

// ---------------------------------------------------------------------------
// Model contract
// ---------------------------------------------------------------------------

export const ANALYSIS_MODEL = "claude-opus-5";
/** The JSON answer is ~300 tokens; the rest is headroom for adaptive thinking. */
export const ANALYSIS_MAX_TOKENS = 4000;
export const ANALYSIS_EFFORT = "low" as const;
export const SUMMARY_MAX_WORDS = 60;

export const OUTCOMES = [
  "booked",
  "rescheduled",
  "cancellation_requested",
  "info_only",
  "handoff",
  "voicemail",
  "abandoned",
  "other",
] as const;
export const PROMISE_KINDS = ["callback", "timing", "price", "warranty", "other"] as const;
export const SENTIMENTS = ["calm", "frustrated", "urgent"] as const;

const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: "null" }] });

/** Sent as `output_config.format.schema`. Every object closes with additionalProperties:false and lists all keys as required. */
export const ANALYSIS_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "outcome", "caller_name", "promises", "needs_review", "review_reason", "caller_sentiment"],
  properties: {
    summary: {
      type: "string",
      description: `At most ${SUMMARY_MAX_WORDS} words, past tense, names the customer and address when identified.`,
    },
    outcome: { type: "string", enum: [...OUTCOMES] },
    caller_name: nullable({ type: "string", description: "Caller's name or company if stated or confirmed." }),
    promises: {
      type: "array",
      description: "Every commitment the agent made to the caller, in call order.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "kind", "due_by", "backed_by_action", "backed_by"],
        properties: {
          text: { type: "string", description: "The promise as spoken, near-verbatim." },
          kind: { type: "string", enum: [...PROMISE_KINDS] },
          due_by: nullable({ type: "string", format: "date-time", description: "ISO 8601 with offset, if a time was implied." }),
          backed_by_action: { type: "boolean", description: "True only if a listed event fulfils this promise." },
          backed_by: nullable({ type: "string", description: "The event type and id that backs it, e.g. 'job.booked #412'." }),
        },
      },
    },
    needs_review: { type: "boolean" },
    review_reason: nullable({ type: "string", description: "Why the office should look; null when needs_review is false." }),
    caller_sentiment: { type: "string", enum: [...SENTIMENTS] },
  },
} as const;

export const promiseOutput = z.strictObject({
  text: z.string().min(1),
  kind: z.enum(PROMISE_KINDS),
  due_by: z.string().nullable(),
  backed_by_action: z.boolean(),
  backed_by: z.string().nullable(),
});

export const analysisOutput = z.strictObject({
  summary: z.string().min(1),
  outcome: z.enum(OUTCOMES),
  caller_name: z.string().nullable(),
  promises: z.array(promiseOutput),
  needs_review: z.boolean(),
  review_reason: z.string().nullable(),
  caller_sentiment: z.enum(SENTIMENTS),
});
export type CallAnalysis = z.infer<typeof analysisOutput>;

export const ANALYSIS_SYSTEM_PROMPT = [
  "You audit finished phone calls handled by Brianna, the AI front desk of Gulf Breeze Air, an HVAC company in Miami (business time zone America/New_York).",
  "You receive the transcript, the tool calls the agent made with their results, and the platform events recorded during the call. Events are the ground truth of what actually happened on the platform; the transcript is only what was said.",
  "",
  "Produce:",
  `- summary: at most ${SUMMARY_MAX_WORDS} words, past tense, plain English for the office. Name the customer and the address when they were identified. State what the caller wanted, what the agent did, and anything left open.`,
  "- outcome: booked (a job.booked event exists), rescheduled (job.rescheduled), cancellation_requested (job.cancellation_requested), handoff (the call was transferred or a handoff task was created, whether or not the transfer connected), voicemail (the agent reached a machine or the caller left a message), abandoned (the caller hung up before anything was resolved or no real conversation happened), info_only (questions answered, nothing changed), other.",
  "- promises: every commitment the agent made to the caller. Quote it close to verbatim. kind: callback (someone will call or text), timing (an arrival window or date), price (any dollar figure or 'no charge'), warranty (coverage statements), other. due_by: ISO 8601 with offset when a time was implied (use the call start time as 'now'); otherwise null. backed_by_action is true only when one of the listed events fulfils the promise (a booked window backs a timing promise; a task.created callback/handoff backs a callback promise; note.added backs 'I'll note that'). Then set backed_by to that event's type and id. A promise with no matching event is NOT backed, even if the agent said it was done.",
  "- needs_review is true when any of these hold: a promise is not backed by an action; the agent stated a warranty or price position; a transfer failed or did not connect; a tool error was audible to the caller (the agent apologised, stalled, or gave up on a lookup); the caller was frustrated. Put the specific reason(s) in review_reason, else null.",
  "- caller_sentiment: calm, frustrated or urgent (time pressure such as guests arriving or no cooling in heat counts as urgent).",
  "",
  "Never invent facts that are not in the transcript, tool results or events. Do not include phone numbers or email addresses in any text field.",
].join("\n");

// ---------------------------------------------------------------------------
// Input corpus
// ---------------------------------------------------------------------------

export type AnalysisCorpus = {
  call: Call;
  events: Event[];
  customerName: string | null;
  addressLabel: string | null;
};

const RESULT_MAX_CHARS = 700;

function clip(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}

function mmss(t: number): string {
  const s = Math.max(0, Math.round(t));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function transcriptLines(turns: TranscriptTurn[]): string {
  if (turns.length === 0) return "(no transcript captured)";
  return turns
    .map((t) => {
      const who = t.role === "assistant" ? "Agent" : t.role === "user" ? "Caller" : `[${t.role}]`;
      return `[${mmss(t.t)}] ${who}: ${t.text}`;
    })
    .join("\n");
}

function toolCallLines(list: ToolCallRecord[]): string {
  if (list.length === 0) return "(none)";
  return list
    .map((tc) => {
      const status = tc.ok === false ? "ERROR" : "ok";
      const args = clip(JSON.stringify(tc.args ?? {}), 300);
      const result = tc.result === undefined ? "" : ` -> ${clip(JSON.stringify(tc.result), RESULT_MAX_CHARS)}`;
      return `[${mmss(tc.t)}] ${tc.name} ${status} ${args}${result}`;
    })
    .join("\n");
}

function eventLines(list: Event[], startedAt: Date): string {
  const rows = list.filter((e) => e.type !== "call.analyzed");
  if (rows.length === 0) return "(none)";
  return rows
    .map((e) => {
      const t = Math.max(0, (e.ts.getTime() - startedAt.getTime()) / 1000);
      const p = e.payload ?? {};
      const summary = typeof p.summary === "string" ? p.summary : "";
      const ref = e.entityType && e.entityId ? ` ${e.entityType}=${e.entityId}` : "";
      return `[${mmss(t)}] #${e.id} ${e.type}${ref}: ${summary}`;
    })
    .join("\n");
}

export function buildAnalysisUserMessage(c: AnalysisCorpus): string {
  const { call } = c;
  const durationS = call.endedAt ? Math.max(0, Math.round((call.endedAt.getTime() - call.startedAt.getTime()) / 1000)) : null;
  const header = [
    `Call ${call.id} (${call.direction}), started ${formatDateTimeET(call.startedAt)} ET (${call.startedAt.toISOString()})${durationS !== null ? `, lasted ${durationS}s` : ""}.`,
    `Ended reason: ${call.endedReason ?? "unknown"}.`,
    `Identified customer: ${c.customerName ?? "not identified"}${c.addressLabel ? ` at ${c.addressLabel}` : ""}.`,
  ].join("\n");
  return [
    header,
    "",
    "## Transcript",
    transcriptLines(call.transcript ?? []),
    "",
    "## Tool calls",
    toolCallLines(call.toolCalls ?? []),
    "",
    "## Platform events during the call (ground truth)",
    eventLines(c.events, call.startedAt),
    "",
    "Return the JSON analysis.",
  ].join("\n");
}

export type AnalysisRequest = Anthropic.MessageCreateParamsNonStreaming;

/** Pure: the exact request `callModel` sends. No prefill, no budget_tokens. */
export function buildAnalysisRequest(c: AnalysisCorpus): AnalysisRequest {
  return {
    model: ANALYSIS_MODEL,
    max_tokens: ANALYSIS_MAX_TOKENS,
    system: ANALYSIS_SYSTEM_PROMPT,
    thinking: { type: "adaptive" },
    output_config: {
      effort: ANALYSIS_EFFORT,
      format: { type: "json_schema", schema: ANALYSIS_OUTPUT_SCHEMA as unknown as Record<string, unknown> },
    },
    messages: [{ role: "user", content: buildAnalysisUserMessage(c) }],
  };
}

export async function loadCorpus(callId: string): Promise<AnalysisCorpus | null> {
  const [call] = await db.select().from(calls).where(eq(calls.id, callId)).limit(1);
  if (!call) return null;
  const evs = await db.select().from(events).where(eq(events.callId, callId)).orderBy(asc(events.id));
  let customerName: string | null = null;
  let addressLabel: string | null = null;
  if (call.matchedCustomerId) {
    const [c] = await db.select({ name: customers.displayName }).from(customers).where(eq(customers.id, call.matchedCustomerId)).limit(1);
    customerName = c?.name ?? null;
  }
  if (call.matchedAddressId) {
    const [a] = await db
      .select({ street: addresses.street, unit: addresses.unit, city: addresses.city })
      .from(addresses)
      .where(eq(addresses.id, call.matchedAddressId))
      .limit(1);
    if (a) addressLabel = [a.street, a.unit ? `unit ${a.unit}` : null, a.city].filter(Boolean).join(", ");
  }
  return { call, events: evs, customerName, addressLabel };
}

// ---------------------------------------------------------------------------
// Model call (the only place the SDK is touched) and response parsing
// ---------------------------------------------------------------------------

export type ModelFn = (req: AnalysisRequest) => Promise<Anthropic.Message>;

export const callModel: ModelFn = (req) => getAnthropic().messages.create(req);

export class AnalysisError extends Error {
  constructor(
    public readonly code: "refusal" | "truncated" | "bad_json" | "invalid_output",
    message: string,
    public readonly usage?: TokenUsage,
  ) {
    super(message);
    this.name = "AnalysisError";
  }
}

/** Refusals and truncation are errors; the JSON is validated against `analysisOutput`. */
export function parseAnalysis(message: Anthropic.Message): { analysis: CallAnalysis; usage: TokenUsage } {
  const usage = usageOf(message);
  if (message.stop_reason === "refusal") {
    const d = message.stop_details;
    throw new AnalysisError("refusal", `model refused${d && "category" in d && d.category ? ` (${d.category})` : ""}`, usage);
  }
  if (message.stop_reason === "max_tokens") throw new AnalysisError("truncated", "output hit max_tokens", usage);
  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new AnalysisError("bad_json", e instanceof Error ? e.message : String(e), usage);
  }
  const parsed = analysisOutput.safeParse(json);
  if (!parsed.success) throw new AnalysisError("invalid_output", z.prettifyError(parsed.error), usage);
  return { analysis: parsed.data, usage };
}

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

const SYSTEM_ACTOR = { actor: "system" as const, actorId: "analyze-call" };
const ACTOR_LABEL = "Analyzer";

export type StoredPromise = Promise_ & { backedByAction: boolean; backedBy?: string | null };

export type AnalyzeResult =
  | { status: "analyzed"; callId: string; analysis: CallAnalysis; taskId: string | null; usage: TokenUsage; costCents: number; ms: number }
  | { status: "skipped"; callId: string; reason: "already_analyzed" | "not_ended" }
  | { status: "not_found"; callId: string };

export type AnalyzeOptions = {
  /** Re-run even when a `call.analyzed` event exists (route retries). */
  force?: boolean;
  /** Test seam; defaults to the real SDK call. */
  model?: ModelFn;
};

async function hasAnalyzedEvent(callId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: events.id })
    .from(events)
    .where(and(eq(events.callId, callId), eq(events.type, "call.analyzed")))
    .limit(1);
  return Boolean(row);
}

async function existingReviewTask(callId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.callId, callId), eq(tasks.kind, "review")))
    .orderBy(desc(tasks.createdAt))
    .limit(1);
  return row?.id ?? null;
}

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

/** Empty transcript: no model call, the call was abandoned. */
function abandonedAnalysis(): CallAnalysis {
  return {
    summary: "No conversation was captured on this call.",
    outcome: "abandoned",
    caller_name: null,
    promises: [],
    needs_review: false,
    review_reason: null,
    caller_sentiment: "calm",
  };
}

export async function analyzeCall(callId: string, opts: AnalyzeOptions = {}): Promise<AnalyzeResult> {
  const t0 = Date.now();
  const corpus = await loadCorpus(callId);
  if (!corpus) return { status: "not_found", callId };
  const { call } = corpus;
  if (call.status !== "ended" && call.status !== "failed") return { status: "skipped", callId, reason: "not_ended" };
  if (!opts.force && (await hasAnalyzedEvent(callId))) return { status: "skipped", callId, reason: "already_analyzed" };

  let analysis: CallAnalysis;
  let usage: TokenUsage = { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
  const spoken = (call.transcript ?? []).filter((t) => t.role === "user" || t.role === "assistant");
  if (spoken.length === 0) {
    analysis = abandonedAnalysis();
  } else {
    const message = await (opts.model ?? callModel)(buildAnalysisRequest(corpus));
    ({ analysis, usage } = parseAnalysis(message));
  }
  const cents = costCents(usage);

  // Server-side guards on top of the schema.
  if (wordCount(analysis.summary) > SUMMARY_MAX_WORDS * 1.5) {
    analysis.summary = analysis.summary.split(/\s+/).slice(0, SUMMARY_MAX_WORDS).join(" ") + "…";
  }
  const unbacked = analysis.promises.filter((p) => !p.backed_by_action);
  const needsReview = analysis.needs_review || unbacked.length > 0;
  const reviewReason =
    analysis.review_reason ?? (unbacked.length > 0 ? `${unbacked.length} promise${unbacked.length === 1 ? "" : "s"} not backed by an action` : null);

  // One review task per call for the promises nothing backs.
  let taskId: string | null = null;
  if (unbacked.length > 0) {
    taskId = await existingReviewTask(callId);
    if (!taskId) {
      const who = corpus.customerName ?? analysis.caller_name ?? "the caller";
      const first = unbacked[0];
      const title = `Agent promised ${clip(first.text.replace(/\s+/g, " ").trim(), 120)} to ${who} on call ${callId}`;
      const body = [
        `Promises on this call that no platform action backs:`,
        ...unbacked.map((p) => `- (${p.kind}) ${p.text}${p.due_by ? ` — due ${formatDateTimeET(p.due_by)} ET` : ""}`),
        "",
        `Summary: ${analysis.summary}`,
      ].join("\n");
      const earliestDue = unbacked.map((p) => p.due_by).filter((d): d is string => Boolean(d)).sort()[0];
      const created = await createTask(
        {
          kind: "review",
          title,
          body,
          customer_id: call.matchedCustomerId ?? undefined,
          due_at: earliestDue,
          idempotency_key: `analyze-call:${callId}:review`,
        },
        { ...SYSTEM_ACTOR, callId },
      );
      taskId = created.task_id;
    }
  }

  const stored: StoredPromise[] = analysis.promises.map((p) => ({
    text: p.text,
    kind: p.kind,
    dueAt: p.due_by ?? undefined,
    taskId: p.backed_by_action ? undefined : (taskId ?? undefined),
    backedByAction: p.backed_by_action,
    backedBy: p.backed_by,
  }));

  await db
    .update(calls)
    .set({ summary: analysis.summary, outcome: analysis.outcome, promises: stored, needsReview })
    .where(eq(calls.id, callId));

  const ms = Date.now() - t0;
  await emitEvent({
    ...SYSTEM_ACTOR,
    type: "call.analyzed",
    entityType: "call",
    entityId: callId,
    callId,
    payload: {
      actor_label: ACTOR_LABEL,
      summary: `Analyzed: ${analysis.outcome.replace(/_/g, " ")}, ${analysis.promises.length} promise${analysis.promises.length === 1 ? "" : "s"}${needsReview ? ", needs review" : ""}`,
      call_id: callId,
      outcome: analysis.outcome,
      promises_count: analysis.promises.length,
      needs_review: needsReview,
      review_reason: reviewReason,
      caller_sentiment: analysis.caller_sentiment,
      review_task_id: taskId,
      usage,
      cost_cents: cents,
      model: ANALYSIS_MODEL,
    },
  });
  console.log(JSON.stringify({ tag: "voice.analyze", call: callId, outcome: analysis.outcome, needs_review: needsReview, usage, cost_cents: cents, ms }));

  return { status: "analyzed", callId, analysis: { ...analysis, needs_review: needsReview, review_reason: reviewReason }, taskId, usage, costCents: cents, ms };
}

// ---------------------------------------------------------------------------
// Backfill helpers and the webhook gate
// ---------------------------------------------------------------------------

/** Ended calls with no `call.analyzed` event, oldest first. */
export async function listUnanalyzedCallIds(limit = 500): Promise<string[]> {
  const rows = await db
    .select({ id: calls.id })
    .from(calls)
    .where(
      and(
        inArray(calls.status, ["ended", "failed"]),
        notExists(db.select({ id: events.id }).from(events).where(and(eq(events.callId, calls.id), eq(events.type, "call.analyzed")))),
      ),
    )
    .orderBy(asc(calls.startedAt))
    .limit(limit);
  return rows.map((r) => r.id);
}

/**
 * The webhook fires analysis after `end-of-call-report` unless ANALYZE_CALLS=0
 * or we are inside vitest (the W2-A webhook tests replay reports for throwaway
 * calls and must not spend tokens).
 */
export function shouldAutoAnalyze(env: Record<string, string | undefined> = process.env): boolean {
  return env.ANALYZE_CALLS !== "0" && !env.VITEST;
}
