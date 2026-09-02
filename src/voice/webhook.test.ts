/**
 * W2-A webhook tests against the local DATABASE_URL (imported data present).
 * Every row created here is tracked and deleted in afterAll.
 */
import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { addresses, calls, customerPhones, events } from "@/db/schema";
import { newId } from "@/lib/ids";
import { POST } from "@/app/api/voice/webhook/route";
import { getCallByProviderId } from "@/domain/calls";
import * as fx from "./fixtures";
import { handleVapiMessage, identificationFrom, parseToolCall, transcriptFromReport, verifyVapiSecret } from "./webhook";

const providerIds: string[] = [];
const seededPhones: string[] = [];
const testPhone = "+15550100" + String(Math.floor(Math.random() * 900) + 100);

function pid(): string {
  const id = `vapi_test_${newId("c").slice(2)}`;
  providerIds.push(id);
  return id;
}

async function eventsFor(callId: string, type?: string) {
  return db
    .select()
    .from(events)
    .where(type ? and(eq(events.callId, callId), eq(events.type, type)) : eq(events.callId, callId))
    .orderBy(events.id);
}

beforeAll(() => {
  process.env.VAPI_WEBHOOK_SECRET ||= "test-webhook-secret";
  process.env.VAPI_ASSISTANT_ID ||= "asst_test_0000";
});

afterAll(async () => {
  const rows = providerIds.length
    ? await db.select({ id: calls.id }).from(calls).where(inArray(calls.providerCallId, providerIds))
    : [];
  const ids = rows.map((r) => r.id);
  if (ids.length) {
    await db.delete(events).where(inArray(events.callId, ids));
    await db.delete(calls).where(inArray(calls.id, ids));
  }
  if (seededPhones.length) await db.delete(customerPhones).where(inArray(customerPhones.id, seededPhones));
});

describe("secret", () => {
  it("verifies x-vapi-secret with a timing-safe compare", () => {
    expect(verifyVapiSecret("abc", "abc")).toBe(true);
    expect(verifyVapiSecret("abd", "abc")).toBe(false);
    expect(verifyVapiSecret(null, "abc")).toBe(false);
    expect(verifyVapiSecret("abc", undefined)).toBe(false);
  });

  it("route returns 401 without the header and 400 on junk", async () => {
    const bad = await POST(
      new NextRequest("http://localhost/api/voice/webhook", { method: "POST", body: JSON.stringify({ message: { type: "hang" } }) }),
    );
    expect(bad.status).toBe(401);
    const junk = await POST(
      new NextRequest("http://localhost/api/voice/webhook", {
        method: "POST",
        headers: { "x-vapi-secret": process.env.VAPI_WEBHOOK_SECRET! },
        body: "{not json",
      }),
    );
    expect(junk.status).toBe(400);
  });
});

describe("assistant-request", () => {
  it("returns the assistant id and now_et for an unknown number", async () => {
    const c = fx.call({ id: pid(), number: "+15550109999" });
    const res = await handleVapiMessage(fx.assistantRequest(c));
    expect(res.status).toBe(200);
    const body = res.body as { assistantId: string; assistantOverrides: { variableValues: Record<string, string> } };
    expect(body.assistantId).toBe(process.env.VAPI_ASSISTANT_ID);
    expect(body.assistantOverrides.variableValues.now_et).toMatch(/\d{4}.*\d{1,2}:\d{2} (AM|PM)/);
    expect(body.assistantOverrides.variableValues.caller_name).toBe("");
    expect(body.assistantOverrides.variableValues.known_sites).toBe("");
  });

  it("recognizes a saved caller and lists their sites", async () => {
    const [site] = await db.select({ customerId: addresses.customerId, street: addresses.street }).from(addresses).limit(1);
    const phoneId = newId("phn");
    seededPhones.push(phoneId);
    await db.insert(customerPhones).values({ id: phoneId, customerId: site.customerId, phone: testPhone, label: "mobile", source: "office" });
    const c = fx.call({ id: pid(), number: testPhone });
    const res = await handleVapiMessage(fx.assistantRequest(c));
    const vv = (res.body as { assistantOverrides: { variableValues: Record<string, string> } }).assistantOverrides.variableValues;
    expect(vv.caller_name.length).toBeGreaterThan(0);
    expect(vv.known_sites).toContain(site.street);
  });
});

describe("call lifecycle", () => {
  it("status-update in-progress creates the row and call.started within 2 s", async () => {
    const c = fx.call({ id: pid() });
    const t0 = Date.now();
    const res = await handleVapiMessage(fx.statusUpdate(c, "in-progress"));
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(res.status).toBe(200);
    const row = await getCallByProviderId(c.id);
    expect(row).not.toBeNull();
    expect(row!.status).toBe("in_progress");
    expect(row!.direction).toBe("inbound");
    expect(row!.callerNumber).toBe("+13055550142");
    const started = await eventsFor(row!.id, "call.started");
    expect(started).toHaveLength(1);
    expect(started[0].payload.caller_number_masked).toBe("+1 (305) •••-0142");
    expect(started[0].payload.via).toBe("phone");
    expect(started[0].actor).toBe("agent");

    // A second in-progress is a no-op; ringing after in-progress does not regress.
    await handleVapiMessage(fx.statusUpdate(c, "in-progress"));
    expect(await eventsFor(row!.id, "call.started")).toHaveLength(1);
  });

  it("web calls get direction web and no caller number", async () => {
    const c = fx.call({ id: pid(), type: "webCall" });
    await handleVapiMessage(fx.statusUpdate(c, "in-progress"));
    const row = await getCallByProviderId(c.id);
    expect(row!.direction).toBe("web");
    expect(row!.callerNumber).toBeNull();
    const [ev] = await eventsFor(row!.id, "call.started");
    expect(ev.payload.via).toBe("web");
  });

  it("appends only final transcripts, in order, with seconds from start", async () => {
    const c = fx.call({ id: pid() });
    await handleVapiMessage(fx.statusUpdate(c, "in-progress"));
    await handleVapiMessage(fx.transcript(c, "assistant", "Gulf Breeze Air, this is Brianna.", "final", 1));
    await handleVapiMessage(fx.transcript(c, "user", "Thirty two", "partial", 4));
    await handleVapiMessage(fx.transcript(c, "user", "Thirty two eighty four Harborlight Hollow.", "final", 6));
    const row = await getCallByProviderId(c.id);
    expect(row!.transcript).toEqual([
      { role: "assistant", text: "Gulf Breeze Air, this is Brianna.", t: 1 },
      { role: "user", text: "Thirty two eighty four Harborlight Hollow.", t: 6 },
    ]);
  });

  it("status-update ended emits call.ended once with duration", async () => {
    const c = fx.call({ id: pid() });
    await handleVapiMessage(fx.statusUpdate(c, "in-progress"));
    await handleVapiMessage(fx.statusUpdate(c, "ended", { endedReason: "customer-ended-call", at: 61 }));
    await handleVapiMessage(fx.statusUpdate(c, "ended", { endedReason: "customer-ended-call", at: 61 }));
    const row = await getCallByProviderId(c.id);
    expect(row!.status).toBe("ended");
    expect(row!.endedAt).not.toBeNull();
    expect(row!.endedReason).toBe("customer-ended-call");
    const ended = await eventsFor(row!.id, "call.ended");
    expect(ended).toHaveLength(1);
    expect(ended[0].payload.ended_reason).toBe("customer-ended-call");
    expect(typeof ended[0].payload.duration_s).toBe("number");
  });

  it("end-of-call-report finalizes: summary, recording, cost, longer transcript, call.ended", async () => {
    const c = fx.call({ id: pid() });
    await handleVapiMessage(fx.statusUpdate(c, "in-progress"));
    await handleVapiMessage(fx.transcript(c, "assistant", "Gulf Breeze Air, this is Brianna.", "final", 1));
    await handleVapiMessage(fx.endOfCallReport(c, { cost: 0.4567 }));
    const row = await getCallByProviderId(c.id);
    expect(row!.status).toBe("ended");
    expect(row!.summary).toContain("Harborlight");
    expect(row!.recordingUrl).toBe("https://storage.vapi.ai/recordings/test.wav");
    expect(row!.costCents).toBe(46);
    expect(row!.endedReason).toBe("customer-ended-call");
    // report had 4 spoken turns (system dropped) > our 1
    expect(row!.transcript).toHaveLength(4);
    expect(row!.transcript[0].role).toBe("assistant");
    expect(await eventsFor(row!.id, "call.ended")).toHaveLength(1);
  });

  it("does not shrink a longer live transcript on finalize", async () => {
    const c = fx.call({ id: pid() });
    await handleVapiMessage(fx.statusUpdate(c, "in-progress"));
    for (let i = 0; i < 6; i++) await handleVapiMessage(fx.transcript(c, i % 2 ? "user" : "assistant", `turn ${i}`, "final", i));
    await handleVapiMessage(fx.endOfCallReport(c));
    const row = await getCallByProviderId(c.id);
    expect(row!.transcript).toHaveLength(6);
  });

  it("hang and transfer-update emit call.hang / call.transfer_attempted; forwarding→in-progress emits transfer_failed", async () => {
    const c = fx.call({ id: pid() });
    await handleVapiMessage(fx.statusUpdate(c, "in-progress"));
    await handleVapiMessage(fx.hang(c));
    await handleVapiMessage(fx.transferUpdate(c));
    await handleVapiMessage(fx.statusUpdate(c, "forwarding"));
    await handleVapiMessage(fx.statusUpdate(c, "in-progress"));
    const row = await getCallByProviderId(c.id);
    const types = (await eventsFor(row!.id)).map((e) => e.type);
    expect(types).toEqual(["call.started", "call.hang", "call.transfer_attempted", "call.transfer_failed"]);
    const [attempt] = await eventsFor(row!.id, "call.transfer_attempted");
    expect(attempt.payload.to_masked).toBe("+1 (305) •••-9999");
  });

  it("transfer failure ended reasons emit call.transfer_failed on the report", async () => {
    const c = fx.call({ id: pid() });
    await handleVapiMessage(fx.statusUpdate(c, "in-progress"));
    await handleVapiMessage(fx.endOfCallReport(c, { endedReason: "call.forwarding.operator-busy" }));
    const row = await getCallByProviderId(c.id);
    expect(await eventsFor(row!.id, "call.transfer_failed")).toHaveLength(1);
  });
});

describe("tool-calls", () => {
  it("parses Vapi's string arguments and alternate shapes", () => {
    expect(parseToolCall({ id: "a", function: { name: "ping", arguments: '{"echo":"hi"}' } })).toEqual({ name: "ping", args: { echo: "hi" } });
    expect(parseToolCall({ id: "b", name: "ping", parameters: { echo: "x" } })).toEqual({ name: "ping", args: { echo: "x" } });
    expect(parseToolCall({ id: "c", function: { name: "ping", arguments: "" } })).toEqual({ name: "ping", args: {} });
  });

  it("find_address round-trips as a Vapi-shaped result with the speech_hint inside and identifies the call once", async () => {
    const c = fx.call({ id: pid() });
    await handleVapiMessage(fx.statusUpdate(c, "in-progress"));
    const t0 = Date.now();
    const res = await handleVapiMessage(
      fx.toolCalls(c, [{ id: "toolu_01", name: "find_address", args: { query: "thirty two eighty four Harborlight Hollow" } }]),
    );
    const ms = Date.now() - t0;
    expect(res.status).toBe(200);
    const body = res.body as { results: Array<{ toolCallId: string; name: string; result: string }> };
    expect(body.results).toHaveLength(1);
    expect(body.results[0].toolCallId).toBe("toolu_01");
    expect(body.results[0].name).toBe("find_address");
    expect(typeof body.results[0].result).toBe("string");
    const env = JSON.parse(body.results[0].result) as {
      ok: boolean;
      speech_hint: string;
      result: { candidates: Array<{ address_id: string; customer_id: string; street: string; confidence: number }> };
    };
    expect(env.ok).toBe(true);
    expect(env.speech_hint.length).toBeGreaterThan(10);
    expect(env.result.candidates[0].street).toMatch(/^3284 Harborlight Hollow/);
    expect(env.result.candidates[0].confidence).toBeGreaterThanOrEqual(0.85);
    console.log(`find_address via webhook: ${ms} ms`);

    const row = await getCallByProviderId(c.id);
    expect(row!.toolCalls).toHaveLength(1);
    expect(row!.toolCalls[0].name).toBe("find_address");
    expect(row!.toolCalls[0].ok).toBe(true);
    expect(row!.matchedAddressId).toBe(env.result.candidates[0].address_id);
    expect(row!.matchedCustomerId).toBe(env.result.candidates[0].customer_id);
    expect(await eventsFor(row!.id, "call.identified")).toHaveLength(1);

    // Same lookup again: still exactly one call.identified
    await handleVapiMessage(fx.toolCalls(c, [{ id: "toolu_02", name: "find_address", args: { query: "3284 Harborlight Hollow Ln" } }]));
    expect(await eventsFor(row!.id, "call.identified")).toHaveLength(1);
    expect((await getCallByProviderId(c.id))!.toolCalls).toHaveLength(2);
  });

  it("runs several tool calls in parallel and shapes errors as envelopes", async () => {
    const c = fx.call({ id: pid() });
    const res = await handleVapiMessage(
      fx.toolCalls(c, [
        { id: "t1", name: "ping", args: { echo: "x" } },
        { id: "t2", name: "no_such_tool", args: {} },
        { id: "t3", name: "find_address", args: { nope: 1 } },
        { id: "t — duplicate id of t1" , name: "ping", args: { echo: "x" } },
        { id: "t4", name: "find_address", args: { query: "zzzzqqq nowhere street 99999" } },
      ]),
    );
    const results = (res.body as { results: Array<{ toolCallId: string; result: string }> }).results;
    const byId = Object.fromEntries(results.map((r) => [r.toolCallId, JSON.parse(r.result)]));
    expect(byId.t1.ok).toBe(true);
    expect(byId.t1.result.pong).toBe(true);
    expect(byId.t2.ok).toBe(false);
    expect(byId.t2.error.code).toBe("not_found");
    expect(byId.t3.ok).toBe(false);
    expect(byId.t3.error.code).toBe("validation");
    expect(byId.t4.ok).toBe(false);
    expect(byId.t4.error.code).toBe("not_found");
    for (const r of Object.values(byId) as Array<{ speech_hint: string | null }>) {
      expect(r.speech_hint === null || typeof r.speech_hint === "string").toBe(true);
    }
    // the row was created by the tool-calls message itself
    const row = await getCallByProviderId(c.id);
    expect(row).not.toBeNull();
    // duplicate id collapses to a single recorded tool call
    expect(row!.toolCalls).toHaveLength(4);
    expect(await eventsFor(row!.id, "call.started")).toHaveLength(1);
  });

  it("identificationFrom only fires on confident, unambiguous matches", () => {
    const ok = (result: unknown) => ({ ok: true as const, result, speech_hint: null });
    expect(identificationFrom("find_address", {}, ok({ candidates: [{ customer_id: "c", address_id: "a", confidence: 0.9 }] }))).toEqual({
      customerId: "c",
      addressId: "a",
      method: "address",
    });
    expect(identificationFrom("find_address", {}, ok({ needs_unit: true, candidates: [{ customer_id: "c", address_id: "a", confidence: 0.95 }] }))).toBeNull();
    expect(
      identificationFrom(
        "find_address",
        {},
        ok({ candidates: [{ customer_id: "c", address_id: "a", confidence: 0.9, label: "x" }, { customer_id: "d", address_id: "b", confidence: 0.88, label: "y" }] }),
      ),
    ).toBeNull();
    expect(identificationFrom("find_customer", {}, ok({ candidates: [{ customer_id: "c", matched_by: "phone", confidence: 1 }] }))).toEqual({ customerId: "c", method: "phone" });
    expect(identificationFrom("book_job", { customer_id: "c", address_id: "a" }, ok({ job_id: "j" }))).toEqual({ customerId: "c", addressId: "a", method: "address" });
    expect(identificationFrom("book_job", { customer_id: "c" }, { ok: false, error: { code: "slot_taken", message: "" }, speech_hint: "" })).toBeNull();
  });

  it("maps report messages to transcript turns", () => {
    const c = fx.call({ id: "x" });
    const turns = transcriptFromReport(fx.endOfCallReport(c));
    expect(turns.map((t) => t.role)).toEqual(["assistant", "user", "assistant", "user"]);
    expect(turns[1].t).toBe(6);
  });
});
