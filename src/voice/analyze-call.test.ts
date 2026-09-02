/**
 * W3-A tests against the local DATABASE_URL. The model is a fake injected via
 * `analyzeCall(id, { model })`; nothing here talks to Anthropic. Every row
 * created is deleted in afterAll.
 */
import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import { addSeconds } from "date-fns";
import { and, eq, inArray, like } from "drizzle-orm";
import { db } from "@/db";
import { calls, customers, events, idempotencyKeys, tasks, type ToolCallRecord, type TranscriptTurn } from "@/db/schema";
import { newId } from "@/lib/ids";
import { POST as analyzeRoute } from "@/app/api/voice/analyze/route";
import {
  ANALYSIS_MODEL,
  ANALYSIS_OUTPUT_SCHEMA,
  AnalysisError,
  analysisOutput,
  analyzeCall,
  buildAnalysisRequest,
  listUnanalyzedCallIds,
  loadCorpus,
  OUTCOMES,
  parseAnalysis,
  PROMISE_KINDS,
  SENTIMENTS,
  shouldAutoAnalyze,
  type CallAnalysis,
} from "./analyze-call";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const RUN = newId("w3a").slice(4, 12);
const ID = {
  booking: `call_w3atest_${RUN}_booking`,
  warranty: `call_w3atest_${RUN}_warranty`,
  handoff: `call_w3atest_${RUN}_handoff`,
  refusal: `call_w3atest_${RUN}_refusal`,
  empty: `call_w3atest_${RUN}_empty`,
  live: `call_w3atest_${RUN}_live`,
};
const ALL = Object.values(ID);

const A = (t: number, text: string): TranscriptTurn => ({ role: "assistant", text, t });
const U = (t: number, text: string): TranscriptTurn => ({ role: "user", text, t });
const S = (t: number, text: string): TranscriptTurn => ({ role: "system", text, t });

let customer: { id: string; name: string };
const start = new Date(Date.now() - 60 * 60 * 1000);

type Ev = { t: number; type: string; entityType: string; entityId: string; summary: string; extra?: Record<string, unknown> };

async function seedCall(id: string, opts: { transcript: TranscriptTurn[]; toolCalls?: ToolCallRecord[]; events: Ev[]; status?: "ended" | "in_progress"; endedReason?: string; matched?: boolean }) {
  await db.insert(calls).values({
    id,
    providerCallId: `w3a-test-${id}`,
    direction: "inbound",
    startedAt: start,
    endedAt: opts.status === "in_progress" ? null : addSeconds(start, 90),
    callerNumber: "+13055550100",
    matchedCustomerId: opts.matched === false ? null : customer.id,
    status: opts.status ?? "ended",
    transcript: opts.transcript,
    toolCalls: opts.toolCalls ?? [],
    endedReason: opts.endedReason ?? "customer-ended-call",
    raw: { test: true },
  });
  for (const e of opts.events) {
    await db.insert(events).values({
      ts: addSeconds(start, e.t),
      actor: "agent",
      actorId: "vapi",
      callId: id,
      type: e.type,
      entityType: e.entityType,
      entityId: e.entityId,
      payload: { actor_label: "Agent", summary: e.summary, call_id: id, test: true, ...(e.extra ?? {}) },
    });
  }
}

beforeAll(async () => {
  process.env.VAPI_WEBHOOK_SECRET ||= "test-webhook-secret";
  const [c] = await db.select({ id: customers.id, name: customers.displayName }).from(customers).limit(1);
  expect(c).toBeTruthy();
  customer = c;

  const jobId = `job_w3atest_${RUN}`;
  await seedCall(ID.booking, {
    transcript: [
      A(0, "Gulf Breeze Air, this is the front desk. How can I help you today?"),
      U(4, "Hi, my upstairs unit is frozen solid. I'm at 3279 Harborlight Hollow."),
      A(12, "Let me pull that up. 3279 Harborlight Hollow Lane in Miami Beach, is this Eugene?"),
      U(18, "Yes, that's me."),
      A(36, "I can get Tanya out tomorrow between 10 and noon. In the meantime turn the system off and leave the fan on."),
      U(46, "Tomorrow at 10 works."),
      A(61, "You're set: tomorrow, 10 AM to noon, with Tanya. Anything else?"),
      U(73, "No, that's it, thank you."),
    ],
    toolCalls: [
      { id: "tc1", name: "find_address", args: { query: "3279 Harborlight Hollow" }, result: { candidates: [{ confidence: 0.97 }] }, ok: true, t: 13, durationMs: 210 },
      { id: "tc2", name: "book_job", args: { service_type: "diagnostic" }, result: { job_id: jobId }, ok: true, t: 58, durationMs: 340 },
    ],
    events: [
      { t: 0, type: "call.started", entityType: "call", entityId: ID.booking, summary: "Call started" },
      { t: 15, type: "call.identified", entityType: "call", entityId: ID.booking, summary: "Caller identified by address" },
      { t: 58, type: "job.booked", entityType: "job", entityId: jobId, summary: "Booked a diagnostic tomorrow 10 AM to noon with Tanya Sawyer", extra: { job_id: jobId } },
      { t: 80, type: "call.ended", entityType: "call", entityId: ID.booking, summary: "Call ended after 1m 20s" },
    ],
  });

  await seedCall(ID.warranty, {
    transcript: [
      A(0, "Gulf Breeze Air, this is the front desk. How can I help you today?"),
      U(4, "You installed a new system last week and now the outdoor unit rattles. Is that covered?"),
      A(13, "Let me look. What's the service address?"),
      U(16, "50 Sargassum Glen Court, Coral Gables."),
      A(25, "The installation was completed August 31st, so labor is covered for a year and parts are under the manufacturer's warranty. A visit for that rattle wouldn't cost you anything."),
      U(36, "Good. Can someone confirm the parts registration went through?"),
      A(44, "Sure, I'll have the office call you tomorrow morning to confirm the registration."),
      U(49, "Thanks."),
    ],
    toolCalls: [{ id: "tc1", name: "check_warranty", args: {}, result: { status: "covered" }, ok: true, t: 23, durationMs: 105 }],
    events: [
      { t: 0, type: "call.started", entityType: "call", entityId: ID.warranty, summary: "Call started" },
      { t: 20, type: "call.identified", entityType: "call", entityId: ID.warranty, summary: "Caller identified by address" },
      { t: 54, type: "call.ended", entityType: "call", entityId: ID.warranty, summary: "Call ended after 54s" },
    ],
  });

  const taskId = `tsk_w3atest_${RUN}_handoff`;
  await seedCall(ID.handoff, {
    transcript: [
      A(0, "Gulf Breeze Air, this is the front desk. How can I help you today?"),
      U(4, "This is Marcy with Starfish Hospitality. Your invoice for unit 36W charges us twice for a capacitor. I need this fixed today."),
      A(17, "Billing questions need a person in the office, so let me transfer you now."),
      S(24, "Transferring to the office line…"),
      S(55, "Transfer failed: no answer after 30 s"),
      A(56, "I'm sorry, nobody could pick up. I've logged this as a priority handoff and someone will call you back within the hour."),
      U(66, "Within the hour, please, I've got guests checking in at four."),
      A(75, "Understood. Bye."),
    ],
    toolCalls: [
      { id: "tc1", name: "transfer_call", args: { reason: "billing dispute" }, result: { status: "no-answer" }, ok: false, t: 24, durationMs: 30400 },
      { id: "tc2", name: "create_task", args: { kind: "handoff" }, result: { task_id: taskId }, ok: true, t: 60, durationMs: 130 },
    ],
    events: [
      { t: 0, type: "call.started", entityType: "call", entityId: ID.handoff, summary: "Call started" },
      { t: 24, type: "call.transfer_attempted", entityType: "call", entityId: ID.handoff, summary: "Agent transferred the call to the office" },
      { t: 55, type: "call.transfer_failed", entityType: "call", entityId: ID.handoff, summary: "Transfer failed: no answer", extra: { reason: "no-answer" } },
      { t: 60, type: "task.created", entityType: "task", entityId: taskId, summary: "Created a handoff task: billing dispute, duplicate capacitor charge", extra: { kind: "handoff" } },
      { t: 78, type: "call.ended", entityType: "call", entityId: ID.handoff, summary: "Call ended after 1m 18s" },
    ],
    endedReason: "assistant-ended-call",
  });

  await seedCall(ID.refusal, { transcript: [A(0, "Hello?"), U(2, "Hi.")], events: [] });
  await seedCall(ID.empty, { transcript: [], events: [], endedReason: "customer-did-not-answer", matched: false });
  await seedCall(ID.live, { transcript: [A(0, "Hello?")], events: [], status: "in_progress" });
});

afterAll(async () => {
  await db.delete(tasks).where(inArray(tasks.callId, ALL));
  await db.delete(events).where(inArray(events.callId, ALL));
  await db.delete(idempotencyKeys).where(like(idempotencyKeys.key, `analyze-call:call_w3atest_${RUN}_%`));
  await db.delete(calls).where(inArray(calls.id, ALL));
});

// ---------------------------------------------------------------------------
// Fake model
// ---------------------------------------------------------------------------

function message(text: string, stop_reason: Anthropic.Message["stop_reason"] = "end_turn"): Anthropic.Message {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: ANALYSIS_MODEL,
    content: [{ type: "text", text, citations: null }],
    stop_reason,
    stop_sequence: null,
    stop_details: stop_reason === "refusal" ? { type: "refusal", category: "other", explanation: "test" } : null,
    usage: { input_tokens: 2400, output_tokens: 320, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
  } as unknown as Anthropic.Message;
}

const fake = (out: CallAnalysis, calls: Anthropic.MessageCreateParamsNonStreaming[] = []) => {
  return async (req: Anthropic.MessageCreateParamsNonStreaming) => {
    calls.push(req);
    return message(JSON.stringify(out));
  };
};

const tomorrow10 = new Date(start);
tomorrow10.setDate(tomorrow10.getDate() + 1);
tomorrow10.setHours(10, 0, 0, 0);

const OUT: Record<"booking" | "warranty" | "handoff", CallAnalysis> = {
  booking: {
    summary: "Eugene Maddox at 3279 Harborlight Hollow Ln reported a frozen upstairs unit. The agent advised switching the system off with the fan on and booked a diagnostic with Tanya Sawyer for tomorrow, 10 AM to noon.",
    outcome: "booked",
    caller_name: "Eugene",
    promises: [{ text: "Tanya out tomorrow between 10 and noon", kind: "timing", due_by: tomorrow10.toISOString(), backed_by_action: true, backed_by: "job.booked" }],
    needs_review: false,
    review_reason: null,
    caller_sentiment: "calm",
  },
  warranty: {
    summary: "Stuart Fraser at 50 Sargassum Glen Ct asked whether a rattling outdoor unit on his new install is covered. The agent said labor and parts are covered and promised the office would call tomorrow morning to confirm the parts registration.",
    outcome: "info_only",
    caller_name: "Stuart Fraser",
    promises: [
      { text: "labor is covered for a year and parts are under the manufacturer's warranty; a visit wouldn't cost anything", kind: "warranty", due_by: null, backed_by_action: false, backed_by: null },
      { text: "I'll have the office call you tomorrow morning to confirm the registration", kind: "callback", due_by: tomorrow10.toISOString(), backed_by_action: false, backed_by: null },
    ],
    needs_review: true,
    review_reason: "Warranty and no-charge statements; callback promise has no task behind it",
    caller_sentiment: "calm",
  },
  handoff: {
    summary: "Marcy from Starfish Hospitality disputed a duplicate capacitor charge on the unit 36W invoice. The transfer to the office rang out; the agent created a priority handoff task and promised a callback within the hour before guests arrive at four.",
    outcome: "handoff",
    caller_name: "Marcy (Starfish Hospitality)",
    promises: [{ text: "someone will call you back within the hour", kind: "callback", due_by: addSeconds(start, 3660).toISOString(), backed_by_action: true, backed_by: "task.created" }],
    needs_review: true,
    review_reason: "Transfer to the office failed (no answer); caller under time pressure",
    caller_sentiment: "urgent",
  },
};

async function analyzedEvents(callId: string) {
  return db.select().from(events).where(and(eq(events.callId, callId), eq(events.type, "call.analyzed"))).orderBy(events.id);
}
async function reviewTasks(callId: string) {
  return db.select().from(tasks).where(and(eq(tasks.callId, callId), eq(tasks.kind, "review")));
}

// ---------------------------------------------------------------------------
// Request shape and schema
// ---------------------------------------------------------------------------

describe("request", () => {
  it("is a single Opus 5 request with a JSON-schema output format, adaptive thinking, no prefill and no budget_tokens", async () => {
    const corpus = await loadCorpus(ID.booking);
    expect(corpus).toBeTruthy();
    const req = buildAnalysisRequest(corpus!);
    expect(req.model).toBe("claude-opus-5");
    expect(req.thinking).toEqual({ type: "adaptive" });
    expect(JSON.stringify(req)).not.toContain("budget_tokens");
    expect(req.output_config?.format).toMatchObject({ type: "json_schema" });
    expect((req.output_config?.format as { schema: unknown }).schema).toBe(ANALYSIS_OUTPUT_SCHEMA);
    expect(req.messages).toHaveLength(1);
    expect(req.messages[0].role).toBe("user");
    const user = req.messages[0].content as string;
    expect(user).toContain("[00:04] Caller: Hi, my upstairs unit is frozen solid.");
    expect(user).toContain("job.booked job=job_w3atest_");
    expect(user).toContain("book_job ok");
    expect(user).toContain(`Identified customer: ${customer.name}`);
    expect(typeof req.system === "string" && req.system).toContain("At most 60 words".replace("At most", "at most"));
  });

  it("output schema is strict everywhere and its enums match the parser", () => {
    const objects: Array<Record<string, unknown>> = [];
    const walk = (node: unknown) => {
      if (!node || typeof node !== "object") return;
      const n = node as Record<string, unknown>;
      if (n.type === "object") objects.push(n);
      for (const v of Object.values(n)) {
        if (Array.isArray(v)) v.forEach(walk);
        else walk(v);
      }
    };
    walk(ANALYSIS_OUTPUT_SCHEMA);
    expect(objects.length).toBe(2); // root + promise item
    for (const o of objects) {
      expect(o.additionalProperties).toBe(false);
      expect([...(o.required as string[])].sort()).toEqual(Object.keys(o.properties as object).sort());
    }
    const props = ANALYSIS_OUTPUT_SCHEMA.properties;
    expect(props.outcome.enum).toEqual([...OUTCOMES]);
    expect(props.caller_sentiment.enum).toEqual([...SENTIMENTS]);
    expect(props.promises.items.properties.kind.enum).toEqual([...PROMISE_KINDS]);
    // No keywords the structured-output compiler rejects.
    const text = JSON.stringify(ANALYSIS_OUTPUT_SCHEMA);
    for (const bad of ["minLength", "maxLength", "minimum", "maximum", "minItems", "maxItems", "pattern", "$ref"]) expect(text).not.toContain(bad);
  });

  it("fixture outputs validate against the real JSON schema and the zod parser; extras and bad enums fail", () => {
    for (const out of Object.values(OUT)) {
      expect(validate(ANALYSIS_OUTPUT_SCHEMA, out)).toEqual([]);
      expect(analysisOutput.safeParse(out).success).toBe(true);
    }
    const extra = { ...OUT.booking, sentiment: "calm" } as unknown as CallAnalysis;
    expect(validate(ANALYSIS_OUTPUT_SCHEMA, extra)).not.toEqual([]);
    expect(analysisOutput.safeParse(extra).success).toBe(false);
    const badEnum = { ...OUT.booking, outcome: "canceled" };
    expect(validate(ANALYSIS_OUTPUT_SCHEMA, badEnum)).not.toEqual([]);
    expect(analysisOutput.safeParse(badEnum).success).toBe(false);
    const missing = { ...OUT.booking } as Partial<CallAnalysis>;
    delete missing.review_reason;
    expect(validate(ANALYSIS_OUTPUT_SCHEMA, missing)).not.toEqual([]);
  });

  it("parseAnalysis rejects refusals, truncation and malformed JSON", () => {
    expect(() => parseAnalysis(message("{}", "refusal"))).toThrowError(AnalysisError);
    expect(() => parseAnalysis(message('{"summary": "x', "max_tokens"))).toThrow(/max_tokens/);
    expect(() => parseAnalysis(message("not json"))).toThrow(/JSON|token/i);
    expect(() => parseAnalysis(message(JSON.stringify({ ...OUT.booking, outcome: "nope" })))).toThrow(/outcome/);
    expect(parseAnalysis(message(JSON.stringify(OUT.booking))).analysis.outcome).toBe("booked");
  });
});

// ---------------------------------------------------------------------------
// analyzeCall against the three fixtures
// ---------------------------------------------------------------------------

describe("analyzeCall", () => {
  it("lists the fixtures as pending before analysis", async () => {
    const pending = await listUnanalyzedCallIds(10_000);
    expect(pending).toEqual(expect.arrayContaining([ID.booking, ID.warranty, ID.handoff]));
    expect(pending).not.toContain(ID.live);
  });

  it("clean booking: booked, promise backed by job.booked, no review, no task", async () => {
    const sent: Anthropic.MessageCreateParamsNonStreaming[] = [];
    const r = await analyzeCall(ID.booking, { model: fake(OUT.booking, sent) });
    expect(sent).toHaveLength(1);
    expect(r.status).toBe("analyzed");
    if (r.status !== "analyzed") return;
    expect(r.analysis.needs_review).toBe(false);
    expect(r.taskId).toBeNull();
    expect(r.costCents).toBe(2); // 2400 in + 320 out on Opus 5 = $0.02

    const [row] = await db.select().from(calls).where(eq(calls.id, ID.booking));
    expect(row.outcome).toBe("booked");
    expect(row.needsReview).toBe(false);
    expect(row.summary).toBe(OUT.booking.summary);
    expect(row.promises).toEqual([{ text: "Tanya out tomorrow between 10 and noon", kind: "timing", dueAt: tomorrow10.toISOString(), backedByAction: true, backedBy: "job.booked" }]);

    const evs = await analyzedEvents(ID.booking);
    expect(evs).toHaveLength(1);
    expect(evs[0].actor).toBe("system");
    expect(evs[0].payload).toMatchObject({ actor_label: "Analyzer", call_id: ID.booking, outcome: "booked", promises_count: 1, needs_review: false, cost_cents: 2 });
    expect(await reviewTasks(ID.booking)).toHaveLength(0);
  });

  it("warranty with a vague promise: needs review and exactly one review task, even when re-run", async () => {
    const r = await analyzeCall(ID.warranty, { model: fake(OUT.warranty) });
    expect(r.status).toBe("analyzed");
    if (r.status !== "analyzed") return;
    expect(r.analysis.outcome).toBe("info_only");
    expect(r.analysis.needs_review).toBe(true);
    expect(r.taskId).toMatch(/^tsk_/);

    const list = await reviewTasks(ID.warranty);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: r.taskId, kind: "review", status: "open", customerId: customer.id, callId: ID.warranty });
    expect(list[0].title).toBe(`Agent promised labor is covered for a year and parts are under the manufacturer's warranty; a visit wouldn't cost anything to ${customer.name} on call ${ID.warranty}`);
    expect(list[0].body).toContain("(callback) I'll have the office call you tomorrow morning");
    expect(list[0].dueAt?.toISOString()).toBe(tomorrow10.toISOString());

    const [row] = await db.select().from(calls).where(eq(calls.id, ID.warranty));
    expect(row.needsReview).toBe(true);
    expect(row.promises.map((p) => p.taskId)).toEqual([r.taskId, r.taskId]);

    const taskEvents = await db.select().from(events).where(and(eq(events.callId, ID.warranty), eq(events.type, "task.created")));
    expect(taskEvents).toHaveLength(1);
    expect(taskEvents[0].actor).toBe("system");

    // A forced re-run (the retry route) must not open a second task.
    const again = await analyzeCall(ID.warranty, { force: true, model: fake(OUT.warranty) });
    expect(again.status).toBe("analyzed");
    expect(again.status === "analyzed" && again.taskId).toBe(r.taskId);
    expect(await reviewTasks(ID.warranty)).toHaveLength(1);
  });

  it("failed transfer: handoff, needs review, callback backed by the handoff task so no review task", async () => {
    const r = await analyzeCall(ID.handoff, { model: fake(OUT.handoff) });
    expect(r.status).toBe("analyzed");
    if (r.status !== "analyzed") return;
    expect(r.analysis.outcome).toBe("handoff");
    expect(r.analysis.needs_review).toBe(true);
    expect(r.analysis.review_reason).toMatch(/transfer/i);
    expect(r.taskId).toBeNull();
    const [row] = await db.select().from(calls).where(eq(calls.id, ID.handoff));
    expect(row).toMatchObject({ outcome: "handoff", needsReview: true });
    expect(row.promises[0]).toMatchObject({ kind: "callback", backedByAction: true, backedBy: "task.created" });
    expect(row.promises[0].taskId).toBeUndefined();
    expect(await reviewTasks(ID.handoff)).toHaveLength(0);
  });

  it("promises the model calls backed but flags nothing else still force needs_review when one is unbacked", async () => {
    const out: CallAnalysis = { ...OUT.booking, needs_review: false, review_reason: null, promises: [{ ...OUT.booking.promises[0], backed_by_action: false, backed_by: null }] };
    const r = await analyzeCall(ID.refusal, { model: fake(out) });
    expect(r.status).toBe("analyzed");
    if (r.status !== "analyzed") return;
    expect(r.analysis.needs_review).toBe(true);
    expect(r.analysis.review_reason).toBe("1 promise not backed by an action");
    expect(r.taskId).toMatch(/^tsk_/);
  });

  it("backfill twice: the second pass finds nothing and writes nothing", async () => {
    const before = {
      pending: await listUnanalyzedCallIds(10_000),
      events: (await db.select({ id: events.id }).from(events).where(inArray(events.callId, ALL))).length,
      tasks: (await db.select({ id: tasks.id }).from(tasks).where(inArray(tasks.callId, ALL))).length,
    };
    for (const id of [ID.booking, ID.warranty, ID.handoff]) {
      expect(before.pending).not.toContain(id);
      const r = await analyzeCall(id, {
        model: async () => {
          throw new Error("model must not be called for an analyzed call");
        },
      });
      expect(r).toEqual({ status: "skipped", callId: id, reason: "already_analyzed" });
    }
    expect((await db.select({ id: events.id }).from(events).where(inArray(events.callId, ALL))).length).toBe(before.events);
    expect((await db.select({ id: tasks.id }).from(tasks).where(inArray(tasks.callId, ALL))).length).toBe(before.tasks);
  });

  it("a refusal writes nothing", async () => {
    await db.delete(events).where(and(eq(events.callId, ID.refusal), eq(events.type, "call.analyzed")));
    const [prev] = await db.select().from(calls).where(eq(calls.id, ID.refusal));
    await expect(analyzeCall(ID.refusal, { force: true, model: async () => message("{}", "refusal") })).rejects.toMatchObject({ code: "refusal" });
    const [row] = await db.select().from(calls).where(eq(calls.id, ID.refusal));
    expect(row.summary).toBe(prev.summary);
    expect(await analyzedEvents(ID.refusal)).toHaveLength(0);
  });

  it("an empty transcript is marked abandoned without calling the model; live calls are skipped", async () => {
    const r = await analyzeCall(ID.empty, {
      model: async () => {
        throw new Error("no model call expected");
      },
    });
    expect(r.status).toBe("analyzed");
    expect(r.status === "analyzed" && r.analysis.outcome).toBe("abandoned");
    expect(r.status === "analyzed" && r.costCents).toBe(0);
    expect(await analyzedEvents(ID.empty)).toHaveLength(1);
    expect(await analyzeCall(ID.live, { model: fake(OUT.booking) })).toEqual({ status: "skipped", callId: ID.live, reason: "not_ended" });
    expect(await analyzeCall("call_does_not_exist", { model: fake(OUT.booking) })).toEqual({ status: "not_found", callId: "call_does_not_exist" });
  });
});

describe("route and gate", () => {
  it("POST /api/voice/analyze needs the agent secret and a known call", async () => {
    const mk = (headers: Record<string, string>, body: string) => new NextRequest("http://localhost/api/voice/analyze", { method: "POST", headers, body });
    expect((await analyzeRoute(mk({}, JSON.stringify({ callId: ID.booking })))).status).toBe(401);
    const secret = { "x-agent-secret": process.env.VAPI_WEBHOOK_SECRET! };
    expect((await analyzeRoute(mk(secret, "{nope"))).status).toBe(400);
    expect((await analyzeRoute(mk(secret, JSON.stringify({})))).status).toBe(400);
    expect((await analyzeRoute(mk(secret, JSON.stringify({ callId: "call_missing" })))).status).toBe(404);
    expect((await analyzeRoute(mk(secret, JSON.stringify({ callId: ID.live })))).status).toBe(409);
  });

  it("auto-analysis is off under vitest and when ANALYZE_CALLS=0", () => {
    expect(shouldAutoAnalyze()).toBe(false);
    expect(shouldAutoAnalyze({})).toBe(true);
    expect(shouldAutoAnalyze({ ANALYZE_CALLS: "0" })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Minimal JSON-schema checker for the subset the output schema uses
// (type, enum, properties/required/additionalProperties, items, anyOf, format).
// ---------------------------------------------------------------------------

function validate(schema: unknown, value: unknown, path = "$"): string[] {
  const s = schema as Record<string, unknown>;
  if (Array.isArray(s.anyOf)) {
    const branches = s.anyOf.map((b) => validate(b, value, path));
    return branches.some((e) => e.length === 0) ? [] : [`${path}: matches no anyOf branch`];
  }
  const errs: string[] = [];
  const t = s.type as string;
  const actual = value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
  if (t && t !== actual && !(t === "number" && actual === "number")) return [`${path}: expected ${t}, got ${actual}`];
  if (Array.isArray(s.enum) && !s.enum.includes(value)) errs.push(`${path}: ${JSON.stringify(value)} not in enum`);
  if (t === "string" && s.format === "date-time" && Number.isNaN(Date.parse(value as string))) errs.push(`${path}: not a date-time`);
  if (t === "object") {
    const props = (s.properties ?? {}) as Record<string, unknown>;
    const obj = value as Record<string, unknown>;
    for (const k of (s.required as string[]) ?? []) if (!(k in obj)) errs.push(`${path}.${k}: missing`);
    for (const [k, v] of Object.entries(obj)) {
      if (!(k in props)) {
        if (s.additionalProperties === false) errs.push(`${path}.${k}: additional property`);
        continue;
      }
      errs.push(...validate(props[k], v, `${path}.${k}`));
    }
  }
  if (t === "array") (value as unknown[]).forEach((v, i) => errs.push(...validate(s.items, v, `${path}[${i}]`)));
  return errs;
}
