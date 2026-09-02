/**
 * Call rows (W2-A). Every Vapi call becomes one `calls` row keyed by the
 * provider call id; the voice webhook enriches it live and the end-of-call
 * report finalizes it. Tools receive OUR `calls.id` as `ctx.callId`
 * (`resolveCallId` in the domain matches on that column).
 */
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { PgUpdateSetSource } from "drizzle-orm/pg-core";
import { db } from "@/db";
import {
  addresses,
  calls,
  customerPhones,
  customers,
  events,
  type Call,
  type ToolCallRecord,
  type TranscriptTurn,
} from "@/db/schema";
import { emitEvent } from "@/lib/events";
import { newId } from "@/lib/ids";

export type CallDirection = "inbound" | "outbound" | "web";
export type CallStatus = "ringing" | "in_progress" | "forwarding" | "ended" | "failed";

const AGENT = { actor: "agent" as const, actorId: "vapi" };
const ACTOR_LABEL = "Agent";

/** `+13055551234` → `+1 (305) •••-1234`. Full numbers live only on `calls` / `customer_phones`. */
export function maskPhone(e164: string | null | undefined): string | null {
  if (!e164) return null;
  const digits = e164.replace(/\D/g, "");
  if (digits.length < 4) return "•••";
  const last4 = digits.slice(-4);
  if (digits.length === 11 && digits.startsWith("1")) return `+1 (${digits.slice(1, 4)}) •••-${last4}`;
  return `•••-${last4}`;
}

export function directionFromVapiType(type: string | null | undefined): CallDirection {
  if (type === "webCall" || type === "vapi.websocketCall") return "web";
  if (type === "outboundPhoneCall") return "outbound";
  return "inbound";
}

export function statusFromVapi(status: string | null | undefined): CallStatus | null {
  switch (status) {
    case "scheduled":
    case "queued":
    case "ringing":
      return "ringing";
    case "in-progress":
      return "in_progress";
    case "forwarding":
      return "forwarding";
    case "ended":
      return "ended";
    default:
      return null;
  }
}

export type CallMeta = {
  providerCallId: string;
  direction?: CallDirection;
  callerNumber?: string | null;
  startedAt?: Date | null;
};

/**
 * Insert-or-fetch the row for a provider call id. Whichever webhook message
 * arrives first creates the row and emits `call.started` exactly once.
 */
export async function ensureCall(meta: CallMeta): Promise<{ id: string; created: boolean }> {
  const id = newId("call");
  const direction = meta.direction ?? "inbound";
  const [row] = await db
    .insert(calls)
    .values({
      id,
      providerCallId: meta.providerCallId,
      direction,
      callerNumber: meta.callerNumber ?? null,
      startedAt: meta.startedAt ?? new Date(),
    })
    .onConflictDoUpdate({
      target: calls.providerCallId,
      set: { callerNumber: sql`coalesce(${calls.callerNumber}, excluded.caller_number)` },
    })
    .returning({ id: calls.id });
  const created = row.id === id;
  if (created) {
    const via = direction === "web" ? "web" : "phone";
    const masked = maskPhone(meta.callerNumber);
    await emitEvent({
      ...AGENT,
      type: "call.started",
      entityType: "call",
      entityId: row.id,
      callId: row.id,
      payload: {
        actor_label: ACTOR_LABEL,
        summary: via === "web" ? "Web call started" : `Call started from ${masked ?? "an unknown number"}`,
        call_id: row.id,
        direction,
        caller_number_masked: masked,
        via,
      },
    });
  }
  return { id: row.id, created };
}

export async function getCallByProviderId(providerCallId: string): Promise<Call | null> {
  const [row] = await db.select().from(calls).where(eq(calls.providerCallId, providerCallId)).limit(1);
  return row ?? null;
}

async function hasEvent(callId: string, type: string): Promise<boolean> {
  const [row] = await db
    .select({ id: events.id })
    .from(events)
    .where(and(eq(events.callId, callId), eq(events.type, type)))
    .limit(1);
  return Boolean(row);
}

async function emitEnded(call: Call, endedReason: string | null, endedAt: Date) {
  if (await hasEvent(call.id, "call.ended")) return;
  const durationS = Math.max(0, Math.round((endedAt.getTime() - call.startedAt.getTime()) / 1000));
  await emitEvent({
    ...AGENT,
    type: "call.ended",
    entityType: "call",
    entityId: call.id,
    callId: call.id,
    payload: {
      actor_label: ACTOR_LABEL,
      summary: `Call ended after ${formatDuration(durationS)}${endedReason ? ` (${humanReason(endedReason)})` : ""}`,
      call_id: call.id,
      duration_s: durationS,
      ended_reason: endedReason,
      outcome: call.outcome ?? null,
    },
  });
}

/** `status-update` → row status; emits `call.ended` on the first transition to ended. */
export async function upsertCallFromStatus(
  input: CallMeta & { status: CallStatus; endedReason?: string | null; endedAt?: Date | null },
): Promise<{ id: string; created: boolean; changed: boolean; previous: CallStatus | null }> {
  const { id, created } = await ensureCall(input);
  const [before] = await db.select().from(calls).where(eq(calls.id, id)).limit(1);
  const terminal = before.status === "ended" || before.status === "failed";
  const next: CallStatus = terminal ? before.status : input.status;
  const changed = next !== before.status;
  if (changed || (input.endedReason && !before.endedReason)) {
    const endedAt = next === "ended" ? (input.endedAt ?? before.endedAt ?? new Date()) : before.endedAt;
    await db
      .update(calls)
      .set({ status: next, endedAt, endedReason: input.endedReason ?? before.endedReason })
      .where(eq(calls.id, id));
  }
  if (changed && next === "ended") {
    await emitEnded(before, input.endedReason ?? null, input.endedAt ?? new Date());
  }
  if (before.status === "forwarding" && next === "in_progress") {
    await emitEvent({
      ...AGENT,
      type: "call.transfer_failed",
      entityType: "call",
      entityId: id,
      callId: id,
      payload: {
        actor_label: ACTOR_LABEL,
        summary: "Transfer to the office did not connect; the agent resumed the call",
        call_id: id,
        reason: "returned_to_assistant",
      },
    });
  }
  return { id, created, changed, previous: created ? null : before.status };
}

/** Append turns to `calls.transcript` with a jsonb concat (no read-modify-write). */
export async function appendTranscript(callId: string, turns: TranscriptTurn[]): Promise<void> {
  if (turns.length === 0) return;
  await db
    .update(calls)
    .set({ transcript: sql`${calls.transcript} || ${JSON.stringify(turns)}::jsonb` })
    .where(eq(calls.id, callId));
}

/** Append one record to `calls.tool_calls`. */
export async function recordToolCall(callId: string, record: ToolCallRecord): Promise<void> {
  await db
    .update(calls)
    .set({ toolCalls: sql`${calls.toolCalls} || ${JSON.stringify([record])}::jsonb` })
    .where(eq(calls.id, callId));
}

export type Identification = {
  customerId: string;
  addressId?: string | null;
  method: "phone" | "address" | "name";
};

/**
 * Set matched customer / address the first time a tool identifies the caller
 * and emit `call.identified` once. Later calls only fill a missing address.
 */
export async function markIdentified(callId: string, ident: Identification): Promise<boolean> {
  const claimed = await db
    .update(calls)
    .set({ matchedCustomerId: ident.customerId, matchedAddressId: ident.addressId ?? null })
    .where(and(eq(calls.id, callId), isNull(calls.matchedCustomerId)))
    .returning({ id: calls.id });
  if (claimed.length === 0) {
    if (ident.addressId) {
      await db
        .update(calls)
        .set({ matchedAddressId: ident.addressId })
        .where(and(eq(calls.id, callId), isNull(calls.matchedAddressId)));
    }
    return false;
  }
  const [cust] = await db
    .select({ name: customers.displayName })
    .from(customers)
    .where(eq(customers.id, ident.customerId))
    .limit(1);
  await emitEvent({
    ...AGENT,
    type: "call.identified",
    entityType: "call",
    entityId: callId,
    callId,
    payload: {
      actor_label: ACTOR_LABEL,
      summary: `Caller identified as ${cust?.name ?? "a known customer"} by ${ident.method}`,
      call_id: callId,
      customer_id: ident.customerId,
      address_id: ident.addressId ?? null,
      method: ident.method,
    },
  });
  return true;
}

export type FinalizeInput = {
  summary?: string | null;
  recordingUrl?: string | null;
  endedReason?: string | null;
  costCents?: number | null;
  startedAt?: Date | null;
  endedAt?: Date | null;
  /** Full transcript from the report; replaces ours only when longer. */
  transcript?: TranscriptTurn[] | null;
  raw?: Record<string, unknown> | null;
};

/** `end-of-call-report` → summary, recording, cost, reason; emits `call.ended` if the status path missed it. */
export async function finalizeCall(callId: string, input: FinalizeInput): Promise<Call | null> {
  const [before] = await db.select().from(calls).where(eq(calls.id, callId)).limit(1);
  if (!before) return null;
  const endedAt = input.endedAt ?? before.endedAt ?? new Date();
  const set: PgUpdateSetSource<typeof calls> = {
    status: "ended",
    endedAt,
    summary: input.summary ?? before.summary,
    recordingUrl: input.recordingUrl ?? before.recordingUrl,
    endedReason: input.endedReason ?? before.endedReason,
    costCents: input.costCents ?? before.costCents,
    raw: input.raw ?? before.raw,
  };
  if (input.startedAt && before.startedAt.getTime() - input.startedAt.getTime() > 1000) set.startedAt = input.startedAt;
  if (input.transcript && input.transcript.length > 0) {
    set.transcript = sql`case when jsonb_array_length(${calls.transcript}) < ${input.transcript.length} then ${JSON.stringify(input.transcript)}::jsonb else ${calls.transcript} end`;
  }
  const [after] = await db.update(calls).set(set).where(eq(calls.id, callId)).returning();
  await emitEnded(after, input.endedReason ?? before.endedReason, endedAt);
  return after;
}

export async function emitCallEvent(
  callId: string,
  type: "call.hang" | "call.transfer_attempted" | "call.transfer_failed",
  payload: Record<string, unknown>,
): Promise<void> {
  await emitEvent({
    ...AGENT,
    type,
    entityType: "call",
    entityId: callId,
    callId,
    payload: { actor_label: ACTOR_LABEL, call_id: callId, ...payload },
  });
}

export type CallerContext = {
  customerId: string | null;
  callerName: string | null;
  knownSites: string[];
};

/** Who is calling, by E.164 number (for `assistant-request`). */
export async function lookupCaller(number: string | null | undefined): Promise<CallerContext> {
  const empty: CallerContext = { customerId: null, callerName: null, knownSites: [] };
  if (!number) return empty;
  const [hit] = await db
    .select({ customerId: customers.id, name: customers.displayName })
    .from(customerPhones)
    .innerJoin(customers, eq(customers.id, customerPhones.customerId))
    .where(eq(customerPhones.phone, number))
    .orderBy(desc(customerPhones.lastSeenAt))
    .limit(1);
  const match =
    hit ??
    (
      await db
        .select({ customerId: customers.id, name: customers.displayName })
        .from(customers)
        .where(eq(customers.phone, number))
        .limit(1)
    )[0];
  if (!match) return empty;
  const sites = await db
    .select({ street: addresses.street, unit: addresses.unit, city: addresses.city })
    .from(addresses)
    .where(eq(addresses.customerId, match.customerId))
    .limit(6);
  const knownSites = sites.map((s) => [s.street, s.unit ? `unit ${s.unit}` : null, s.city].filter(Boolean).join(", "));
  return { customerId: match.customerId, callerName: match.name, knownSites };
}

function formatDuration(s: number): string {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m}m ${r}s` : `${m}m`;
}

function humanReason(reason: string): string {
  return reason.replace(/[-_.]+/g, " ");
}
