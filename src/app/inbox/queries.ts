/**
 * Read side of /inbox (W2-D). Server-only. Tasks with their customer, job,
 * call and assignee, plus the change request behind each cancellation task.
 * Mutations live in ./actions.ts.
 */
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { changeRequests, customers, events, jobs, tasks, users, type Task } from "@/db/schema";
import type { WorkStatus } from "@/domain/jobs";
import type { StatusFilter, TaskKind } from "@/components/inbox/inbox-grouping";

export type InboxTask = {
  id: string;
  kind: Task["kind"];
  status: Task["status"];
  title: string;
  body: string | null;
  customerId: string | null;
  customerName: string | null;
  jobId: string | null;
  jobInvoiceNumber: string | null;
  jobStatus: WorkStatus | null;
  callId: string | null;
  dueAt: Date | null;
  assignedTo: string | null;
  assignedName: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
  /** The task.created event came from the phone agent. */
  fromAgent: boolean;
  /** For kind = cancellation: the change request to render (pending preferred, else latest). */
  changeRequestId: string | null;
};

export type InboxUser = { id: string; name: string; role: string };

export async function listInboxUsers(): Promise<InboxUser[]> {
  return db.select({ id: users.id, name: users.name, role: users.role }).from(users).orderBy(asc(users.name));
}

/** Counts per status for the filter pills (plus "all"). */
export async function countTasksByStatus(kind: TaskKind | null): Promise<Record<StatusFilter, number>> {
  const rows = await db
    .select({ status: tasks.status, n: sql<number>`count(*)::int` })
    .from(tasks)
    .where(kind ? eq(tasks.kind, kind) : undefined)
    .groupBy(tasks.status);
  const out: Record<StatusFilter, number> = { open: 0, in_progress: 0, done: 0, dismissed: 0, all: 0 };
  for (const r of rows) {
    out[r.status] = Number(r.n);
    out.all += Number(r.n);
  }
  return out;
}

export async function countOpenByKind(): Promise<Record<TaskKind, number>> {
  const rows = await db
    .select({ kind: tasks.kind, n: sql<number>`count(*)::int` })
    .from(tasks)
    .where(eq(tasks.status, "open"))
    .groupBy(tasks.kind);
  const out: Record<TaskKind, number> = { cancellation: 0, handoff: 0, callback: 0, review: 0, followup: 0 };
  for (const r of rows) out[r.kind] = Number(r.n);
  return out;
}

export async function listInboxTasks(opts: { status: StatusFilter; kind: TaskKind | null; limit?: number }): Promise<InboxTask[]> {
  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 500);
  const where = and(
    opts.status === "all" ? undefined : eq(tasks.status, opts.status),
    opts.kind ? eq(tasks.kind, opts.kind) : undefined,
  );
  const rows = await db
    .select({
      task: tasks,
      customerName: customers.displayName,
      jobInvoiceNumber: jobs.invoiceNumber,
      jobStatus: jobs.workStatus,
      assignedName: users.name,
    })
    .from(tasks)
    .leftJoin(customers, eq(customers.id, tasks.customerId))
    .leftJoin(jobs, eq(jobs.id, tasks.jobId))
    .leftJoin(users, eq(users.id, tasks.assignedTo))
    .where(where)
    .orderBy(desc(tasks.createdAt))
    .limit(limit);
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.task.id);
  const cancelJobIds = rows.filter((r) => r.task.kind === "cancellation" && r.task.jobId).map((r) => r.task.jobId as string);

  const [agentRows, crRows] = await Promise.all([
    db
      .select({ id: events.entityId })
      .from(events)
      .where(and(eq(events.entityType, "task"), eq(events.type, "task.created"), eq(events.actor, "agent"), inArray(events.entityId, ids))),
    cancelJobIds.length
      ? db
          .select({ id: changeRequests.id, jobId: changeRequests.jobId, status: changeRequests.status, requestedAt: changeRequests.requestedAt })
          .from(changeRequests)
          .where(inArray(changeRequests.jobId, cancelJobIds))
          .orderBy(desc(changeRequests.requestedAt))
      : Promise.resolve([] as { id: string; jobId: string; status: "pending" | "approved" | "rejected"; requestedAt: Date }[]),
  ]);
  const fromAgent = new Set(agentRows.map((r) => r.id).filter((x): x is string => Boolean(x)));
  // Pending first, else the most recent (rows are newest first).
  const crByJob = new Map<string, string>();
  for (const cr of crRows) if (!crByJob.has(cr.jobId)) crByJob.set(cr.jobId, cr.id);
  for (const cr of crRows) if (cr.status === "pending") crByJob.set(cr.jobId, cr.id);

  return rows.map((r) => ({
    id: r.task.id,
    kind: r.task.kind,
    status: r.task.status,
    title: r.task.title,
    body: r.task.body,
    customerId: r.task.customerId,
    customerName: r.customerName,
    jobId: r.task.jobId,
    jobInvoiceNumber: r.jobInvoiceNumber,
    jobStatus: r.jobStatus,
    callId: r.task.callId,
    dueAt: r.task.dueAt,
    assignedTo: r.task.assignedTo,
    assignedName: r.assignedName,
    createdAt: r.task.createdAt,
    resolvedAt: r.task.resolvedAt,
    fromAgent: fromAgent.has(r.task.id),
    changeRequestId: r.task.jobId ? (crByJob.get(r.task.jobId) ?? null) : null,
  }));
}
