import { and, desc, eq, gte, ilike, or, sql, asc } from "drizzle-orm";
import { startOfDay } from "date-fns";
import { db } from "@/db";
import { addresses, calls, customers, events, tasks, type Promise_, type ToolCallRecord, type TranscriptTurn } from "@/db/schema";
import { fromET, nowET } from "@/lib/time";
import { callerLabel, deriveActions, hasHandoff, type ActionItem, type EventLike } from "@/lib/ui/call-derive";

/**
 * Read side of the Calls pages (W2-C). Reads `calls`, `events`, `tasks`
 * directly; writes go through `./actions.ts`. Every row is serialised to
 * plain JSON (ISO strings) so the same shape is used by the server render
 * and by `/api/calls*` for client refresh.
 */

export const CALL_FILTERS = ["all", "live", "today", "review", "handoffs"] as const;
export type CallFilter = (typeof CALL_FILTERS)[number];

export function parseFilter(v: string | undefined | null): CallFilter {
  return (CALL_FILTERS as readonly string[]).includes(v ?? "") ? (v as CallFilter) : "all";
}

export type CallListRow = {
  id: string;
  startedAt: string;
  endedAt: string | null;
  status: string;
  direction: string;
  caller: string;
  customerId: string | null;
  customerName: string | null;
  addressId: string | null;
  addressLabel: string | null;
  outcome: string | null;
  summary: string | null;
  actionsCount: number;
  needsReview: boolean;
  handoff: boolean;
};

export type CallListResult = {
  rows: CallListRow[];
  counts: { live: number; today: number; review: number; handoffs: number };
  serverTime: string;
};

const LIST_LIMIT = 200;

function addressLabel(street: string | null, unit: string | null, city: string | null): string | null {
  if (!street) return null;
  // "3284 Harborlight Hollow Ln, Miami Beach" / "10254 E Old Mangrove Rd, High Pointe Unit 36W, Pinecrest" / "… #4B, …"
  const unitLabel = unit ? (/^\d/.test(unit) ? `#${unit}` : unit) : null;
  return [street, unitLabel, city].filter(Boolean).join(", ");
}

/** Start of today (ET) as an instant. */
export function startOfTodayET(): Date {
  return fromET(startOfDay(nowET()));
}

const actionsCountSql = sql<number>`(
  select count(*)::int from ${events} e
  where e.call_id = ${calls.id} and e.type not like 'call.%'
)`;

const handoffSql = sql<boolean>`(
  ${calls.status} = 'forwarding' or ${calls.outcome} = 'handoff' or ${calls.handoffReason} is not null
  or exists (select 1 from ${events} e where e.call_id = ${calls.id} and e.type like 'call.transfer%')
)`;

const liveSql = sql`${calls.status} in ('ringing','in_progress','forwarding')`;

export async function listCalls(opts: { filter?: CallFilter; q?: string | null } = {}): Promise<CallListResult> {
  const filter = opts.filter ?? "all";
  const q = opts.q?.trim() ?? "";
  const today = startOfTodayET();

  const where = [];
  if (filter === "live") where.push(liveSql);
  if (filter === "today") where.push(gte(calls.startedAt, today));
  if (filter === "review") where.push(eq(calls.needsReview, true));
  if (filter === "handoffs") where.push(handoffSql);
  if (q) {
    const like = `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`;
    where.push(
      or(
        ilike(calls.summary, like),
        sql`${calls.transcript}::text ilike ${like}`,
        ilike(calls.callerNumber, like),
        ilike(customers.displayName, like),
        ilike(addresses.street, like),
        ilike(calls.outcome, like),
      )!,
    );
  }

  const rows = await db
    .select({
      id: calls.id,
      startedAt: calls.startedAt,
      endedAt: calls.endedAt,
      status: calls.status,
      direction: calls.direction,
      callerNumber: calls.callerNumber,
      customerId: calls.matchedCustomerId,
      customerName: customers.displayName,
      addressId: calls.matchedAddressId,
      street: addresses.street,
      unit: addresses.unit,
      city: addresses.city,
      outcome: calls.outcome,
      summary: calls.summary,
      needsReview: calls.needsReview,
      actionsCount: actionsCountSql,
      handoff: handoffSql,
      live: sql<boolean>`${liveSql}`,
    })
    .from(calls)
    .leftJoin(customers, eq(customers.id, calls.matchedCustomerId))
    .leftJoin(addresses, eq(addresses.id, calls.matchedAddressId))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(sql`${liveSql}`), desc(calls.startedAt))
    .limit(LIST_LIMIT);

  const [c] = await db
    .select({
      live: sql<number>`count(*) filter (where ${liveSql})::int`,
      // Raw sql params are not column-typed: pass the instant as ISO text, not a Date.
      today: sql<number>`count(*) filter (where ${calls.startedAt} >= ${today.toISOString()}::timestamptz)::int`,
      review: sql<number>`count(*) filter (where ${calls.needsReview})::int`,
      handoffs: sql<number>`count(*) filter (where ${handoffSql})::int`,
    })
    .from(calls);

  return {
    rows: rows.map((r) => ({
      id: r.id,
      startedAt: r.startedAt.toISOString(),
      endedAt: r.endedAt?.toISOString() ?? null,
      status: r.status,
      direction: r.direction,
      caller: callerLabel({ direction: r.direction, callerNumber: r.callerNumber }),
      customerId: r.customerId,
      customerName: r.customerName,
      addressId: r.addressId,
      addressLabel: addressLabel(r.street, r.unit, r.city),
      outcome: r.outcome,
      summary: r.summary,
      actionsCount: r.actionsCount ?? 0,
      needsReview: r.needsReview,
      handoff: Boolean(r.handoff),
    })),
    counts: {
      live: c?.live ?? 0,
      today: c?.today ?? 0,
      review: c?.review ?? 0,
      handoffs: c?.handoffs ?? 0,
    },
    serverTime: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

export type CallTask = {
  id: string;
  kind: string;
  status: string;
  title: string;
  dueAt: string | null;
  createdAt: string;
};

export type CallDetail = {
  id: string;
  providerCallId: string | null;
  direction: string;
  startedAt: string;
  endedAt: string | null;
  status: string;
  caller: string;
  customerId: string | null;
  customerName: string | null;
  customerKind: string | null;
  addressId: string | null;
  addressLabel: string | null;
  transcript: TranscriptTurn[];
  toolCalls: ToolCallRecord[];
  summary: string | null;
  outcome: string | null;
  promises: Promise_[];
  handoffReason: string | null;
  recordingUrl: string | null;
  needsReview: boolean;
  endedReason: string | null;
  costCents: number | null;
  actions: ActionItem[];
  tasks: CallTask[];
  handoff: boolean;
  lastEventId: number;
  serverTime: string;
};

export async function getCall(id: string): Promise<CallDetail | null> {
  const [row] = await db
    .select({
      call: calls,
      customerName: customers.displayName,
      customerKind: customers.kind,
      street: addresses.street,
      unit: addresses.unit,
      city: addresses.city,
    })
    .from(calls)
    .leftJoin(customers, eq(customers.id, calls.matchedCustomerId))
    .leftJoin(addresses, eq(addresses.id, calls.matchedAddressId))
    .where(eq(calls.id, id))
    .limit(1);
  if (!row) return null;
  const c = row.call;

  const [evs, tks] = await Promise.all([
    db.select().from(events).where(eq(events.callId, id)).orderBy(asc(events.id)),
    db
      .select({ id: tasks.id, kind: tasks.kind, status: tasks.status, title: tasks.title, dueAt: tasks.dueAt, createdAt: tasks.createdAt })
      .from(tasks)
      .where(eq(tasks.callId, id))
      .orderBy(asc(tasks.createdAt)),
  ]);
  const eventLikes: EventLike[] = evs.map((e) => ({
    id: e.id,
    ts: e.ts,
    actor: e.actor,
    type: e.type,
    entityType: e.entityType,
    entityId: e.entityId,
    payload: e.payload ?? {},
  }));

  return {
    id: c.id,
    providerCallId: c.providerCallId,
    direction: c.direction,
    startedAt: c.startedAt.toISOString(),
    endedAt: c.endedAt?.toISOString() ?? null,
    status: c.status,
    caller: callerLabel({ direction: c.direction, callerNumber: c.callerNumber }),
    customerId: c.matchedCustomerId,
    customerName: row.customerName,
    customerKind: row.customerKind,
    addressId: c.matchedAddressId,
    addressLabel: addressLabel(row.street, row.unit, row.city),
    transcript: Array.isArray(c.transcript) ? c.transcript : [],
    toolCalls: Array.isArray(c.toolCalls) ? c.toolCalls : [],
    summary: c.summary,
    outcome: c.outcome,
    promises: Array.isArray(c.promises) ? c.promises : [],
    handoffReason: c.handoffReason,
    recordingUrl: c.recordingUrl,
    needsReview: c.needsReview,
    endedReason: c.endedReason,
    costCents: c.costCents,
    actions: deriveActions(eventLikes),
    tasks: tks.map((t) => ({
      id: t.id,
      kind: t.kind,
      status: t.status,
      title: t.title,
      dueAt: t.dueAt?.toISOString() ?? null,
      createdAt: t.createdAt.toISOString(),
    })),
    handoff: hasHandoff({ status: c.status, outcome: c.outcome, handoffReason: c.handoffReason, events: eventLikes }),
    lastEventId: evs.length ? evs[evs.length - 1].id : 0,
    serverTime: new Date().toISOString(),
  };
}
