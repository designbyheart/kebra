/**
 * Read model for the cancellation approval card (W2-E, PLAN §3 D12).
 *
 * Server-only: joins a change_request with its job, customer, address, techs,
 * the call it came from and the transcript passage where the caller asked to
 * cancel. No mutations live here; approve / reject go through
 * `src/domain/change-requests.ts` via `cancellation-resolve.ts`.
 */
import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  addresses,
  calls,
  changeRequests,
  customers,
  employees,
  jobAssignments,
  jobs,
  users,
  type TranscriptTurn,
} from "@/db/schema";
import { addressLabelOf, type WorkStatus } from "@/domain/jobs";

/** How much of the conversation to show around the request. */
export const EXCERPT_BEFORE = 3;
export const EXCERPT_AFTER = 2;

export type ExcerptTurn = {
  index: number;
  role: TranscriptTurn["role"];
  text: string;
  t: number;
  /** Part of the passage where the cancellation was requested. */
  highlight: boolean;
};

export type CancellationApprovalData = {
  id: string;
  status: "pending" | "approved" | "rejected";
  reason: string | null;
  previousStatus: WorkStatus | null;
  requestedAt: Date;
  resolvedAt: Date | null;
  resolvedBy: string | null;
  resolvedByName: string | null;
  resolutionNote: string | null;
  job: {
    id: string;
    invoiceNumber: string | null;
    description: string | null;
    workStatus: WorkStatus;
    scheduledStart: Date | null;
    scheduledEnd: Date | null;
    serviceType: string | null;
    customerId: string;
    customerName: string;
    addressId: string | null;
    addressLabel: string | null;
    techNames: string[];
  };
  call: {
    id: string;
    startedAt: Date;
    recordingUrl: string | null;
    callerNumberMasked: string | null;
    turnCount: number;
  } | null;
  transcriptRef: { from: number; to: number } | null;
  excerpt: ExcerptTurn[];
  /** Names of users who can approve (owner / admin), for the non-admin view. */
  approvers: string[];
};

/** `+1 (305) •••-1234` style: only the last four digits survive. */
export function maskPhone(e164: string | null | undefined): string | null {
  if (!e164) return null;
  const digits = e164.replace(/\D/g, "");
  if (digits.length < 4) return "•••";
  const last4 = digits.slice(-4);
  if (digits.length === 11 && digits.startsWith("1")) return `+1 (${digits.slice(1, 4)}) •••-${last4}`;
  if (digits.length === 10) return `(${digits.slice(0, 3)}) •••-${last4}`;
  return `•••-${last4}`;
}

/**
 * Pick the passage to show. `transcript_ref` is written by
 * `requestCancellation` as `{from, to}` = the transcript length at the moment
 * the tool ran, so the caller's request is the last user turn *before* `from`
 * and the agent's "the office will confirm" reply comes after it. We
 * highlight from that user turn through `to`, show `EXCERPT_BEFORE` turns of
 * context above and `EXCERPT_AFTER` below.
 */
export function buildExcerpt(
  transcript: TranscriptTurn[] | null | undefined,
  ref: { from: number; to: number } | null | undefined,
): ExcerptTurn[] {
  const turns = Array.isArray(transcript) ? transcript : [];
  if (!turns.length || !ref) return [];
  const last = turns.length - 1;
  const clamp = (n: number) => Math.max(0, Math.min(last, Math.trunc(n)));

  // Start of the highlight: the nearest user turn at or before `from`
  // (looking at from-1 first because `from` is the index of the *next* turn).
  let hlStart = clamp(ref.from - 1);
  for (let i = hlStart; i >= Math.max(0, hlStart - 2); i--) {
    if (turns[i]?.role === "user") {
      hlStart = i;
      break;
    }
  }
  const hlEnd = Math.max(hlStart, clamp(ref.to > ref.from ? ref.to : ref.from - 1));

  const start = Math.max(0, hlStart - EXCERPT_BEFORE);
  const end = Math.min(last, hlEnd + EXCERPT_AFTER);
  const out: ExcerptTurn[] = [];
  for (let i = start; i <= end; i++) {
    const t = turns[i];
    if (!t || typeof t.text !== "string") continue;
    out.push({ index: i, role: t.role, text: t.text, t: Number(t.t) || 0, highlight: i >= hlStart && i <= hlEnd });
  }
  return out;
}

export async function listApproverNames(): Promise<string[]> {
  const rows = await db
    .select({ name: users.name })
    .from(users)
    .where(inArray(users.role, ["owner", "admin"]))
    .orderBy(asc(users.name));
  return rows.map((r) => r.name);
}

export async function loadCancellationApproval(changeRequestId: string): Promise<CancellationApprovalData | null> {
  const [row] = await db
    .select({
      id: changeRequests.id,
      status: changeRequests.status,
      reason: changeRequests.reason,
      previousStatus: changeRequests.previousStatus,
      requestedAt: changeRequests.requestedAt,
      resolvedAt: changeRequests.resolvedAt,
      resolvedBy: changeRequests.resolvedBy,
      resolutionNote: changeRequests.resolutionNote,
      callId: changeRequests.callId,
      transcriptRef: changeRequests.transcriptRef,
      jobId: jobs.id,
      invoiceNumber: jobs.invoiceNumber,
      description: jobs.description,
      workStatus: jobs.workStatus,
      scheduledStart: jobs.scheduledStart,
      scheduledEnd: jobs.scheduledEnd,
      serviceType: jobs.serviceType,
      customerId: jobs.customerId,
      customerName: customers.displayName,
      addressId: jobs.addressId,
      street: addresses.street,
      unit: addresses.unit,
      city: addresses.city,
    })
    .from(changeRequests)
    .innerJoin(jobs, eq(jobs.id, changeRequests.jobId))
    .innerJoin(customers, eq(customers.id, jobs.customerId))
    .leftJoin(addresses, eq(addresses.id, jobs.addressId))
    .where(eq(changeRequests.id, changeRequestId))
    .limit(1);
  if (!row) return null;

  const [techRows, callRow, resolver, approvers] = await Promise.all([
    db
      .select({ first: employees.firstName, last: employees.lastName })
      .from(jobAssignments)
      .innerJoin(employees, eq(employees.id, jobAssignments.employeeId))
      .where(eq(jobAssignments.jobId, row.jobId)),
    row.callId
      ? db
          .select({
            id: calls.id,
            startedAt: calls.startedAt,
            recordingUrl: calls.recordingUrl,
            callerNumber: calls.callerNumber,
            transcript: calls.transcript,
          })
          .from(calls)
          .where(eq(calls.id, row.callId))
          .limit(1)
          .then((r) => r[0] ?? null)
      : Promise.resolve(null),
    row.resolvedBy
      ? db
          .select({ name: users.name })
          .from(users)
          .where(eq(users.id, row.resolvedBy))
          .limit(1)
          .then((r) => r[0]?.name ?? null)
      : Promise.resolve(null),
    listApproverNames(),
  ]);

  const transcript = (callRow?.transcript ?? []) as TranscriptTurn[];
  return {
    id: row.id,
    status: row.status,
    reason: row.reason,
    previousStatus: row.previousStatus,
    requestedAt: row.requestedAt,
    resolvedAt: row.resolvedAt,
    resolvedBy: row.resolvedBy,
    resolvedByName: resolver,
    resolutionNote: row.resolutionNote,
    job: {
      id: row.jobId,
      invoiceNumber: row.invoiceNumber,
      description: row.description,
      workStatus: row.workStatus,
      scheduledStart: row.scheduledStart,
      scheduledEnd: row.scheduledEnd,
      serviceType: row.serviceType,
      customerId: row.customerId,
      customerName: row.customerName,
      addressId: row.addressId,
      addressLabel: row.street ? addressLabelOf({ street: row.street, unit: row.unit, city: row.city }) : null,
      techNames: techRows.map((t) => `${t.first} ${t.last}`.trim()),
    },
    call: callRow
      ? {
          id: callRow.id,
          startedAt: callRow.startedAt,
          recordingUrl: callRow.recordingUrl,
          callerNumberMasked: maskPhone(callRow.callerNumber),
          turnCount: transcript.length,
        }
      : null,
    transcriptRef: row.transcriptRef ?? null,
    excerpt: buildExcerpt(transcript, row.transcriptRef),
    approvers,
  };
}

/** Pending requests, oldest first (the office works the queue top-down). */
export async function listPendingCancellations(): Promise<CancellationApprovalData[]> {
  const ids = await db
    .select({ id: changeRequests.id })
    .from(changeRequests)
    .where(eq(changeRequests.status, "pending"))
    .orderBy(asc(changeRequests.requestedAt));
  const rows = await Promise.all(ids.map((r) => loadCancellationApproval(r.id)));
  return rows.filter((r): r is CancellationApprovalData => r !== null);
}

export async function countPendingCancellations(): Promise<number> {
  const rows = await db.select({ id: changeRequests.id }).from(changeRequests).where(eq(changeRequests.status, "pending"));
  return rows.length;
}
