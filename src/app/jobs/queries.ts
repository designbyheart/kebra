/**
 * Read queries for the Jobs screens (server only). Mutations go through the
 * domain functions in src/app/jobs/actions.ts.
 */
import { and, asc, desc, eq, gte, ilike, inArray, lt, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  addresses,
  changeRequests,
  customers,
  employees,
  jobs,
  notes,
  serviceTypes,
  tasks,
  users,
  type ChangeRequest,
  type Job,
  type ServiceType,
  type Task,
} from "@/db/schema";
import { SCHEDULABLE_ROLE } from "@/domain/availability";
import { addressLabel, loadInvoices, loadTechs, windowEnd, type InvoiceWithItems, type TechRef } from "@/domain/history";
import { parseDateET } from "@/domain/schedule";
import type { NoteView } from "@/lib/ui/note-view";
import { shiftIsoDate, sortDirectionFor, type JobFilters } from "@/lib/ui/job-filter-params";
import { visibleTags } from "@/lib/ui/format";

export const JOB_LIST_LIMIT = 200;

export type JobRow = {
  id: string;
  invoiceNumber: string | null;
  description: string | null;
  workStatus: Job["workStatus"];
  priority: Job["priority"];
  source: Job["source"];
  scheduledStart: Date | null;
  windowEnd: Date | null;
  tags: string[];
  outstandingBalance: number;
  totalAmount: number;
  customerId: string;
  customerName: string;
  addressId: string | null;
  addressLabel: string | null;
  techs: TechRef[];
};

export type JobList = { rows: JobRow[]; total: number; direction: "asc" | "desc" };

function whereFor(f: JobFilters): SQL | undefined {
  const conds: (SQL | undefined)[] = [];
  if (f.statuses) conds.push(inArray(jobs.workStatus, f.statuses));
  if (f.source) conds.push(eq(jobs.source, f.source));
  if (f.tag) conds.push(sql`${f.tag} = any(${jobs.tags})`);
  if (f.tech) {
    conds.push(sql`exists (select 1 from job_assignments ja where ja.job_id = ${jobs.id} and ja.employee_id = ${f.tech})`);
  }
  if (f.from) {
    const d = parseDateET(f.from);
    if (d) conds.push(gte(jobs.scheduledStart, d.start));
  }
  if (f.to) {
    const d = parseDateET(shiftIsoDate(f.to, 1));
    if (d) conds.push(lt(jobs.scheduledStart, d.start));
  }
  if (f.q) {
    const like = `%${f.q.replace(/[%_]/g, (c) => `\\${c}`)}%`;
    conds.push(
      or(
        ilike(customers.displayName, like),
        ilike(addresses.street, like),
        ilike(jobs.invoiceNumber, like),
        ilike(jobs.description, like),
        ilike(customers.company, like),
      ),
    );
  }
  const live = conds.filter((c): c is SQL => Boolean(c));
  return live.length ? and(...live) : undefined;
}

export async function listJobs(f: JobFilters, todayIso: string): Promise<JobList> {
  const where = whereFor(f);
  const direction = sortDirectionFor(f, todayIso);
  const order = direction === "asc" ? sql`${jobs.scheduledStart} asc nulls last` : sql`${jobs.scheduledStart} desc nulls last`;

  const [rows, [{ count }]] = await Promise.all([
    db
      .select({ job: jobs, customerName: customers.displayName, address: addresses })
      .from(jobs)
      .innerJoin(customers, eq(customers.id, jobs.customerId))
      .leftJoin(addresses, eq(addresses.id, jobs.addressId))
      .where(where)
      .orderBy(order, asc(jobs.id))
      .limit(JOB_LIST_LIMIT),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(jobs)
      .innerJoin(customers, eq(customers.id, jobs.customerId))
      .leftJoin(addresses, eq(addresses.id, jobs.addressId))
      .where(where),
  ]);
  const techs = await loadTechs(rows.map((r) => r.job.id));
  return {
    direction,
    total: Number(count),
    rows: rows.map((r) => ({
      id: r.job.id,
      invoiceNumber: r.job.invoiceNumber,
      description: r.job.description,
      workStatus: r.job.workStatus,
      priority: r.job.priority,
      source: r.job.source,
      scheduledStart: r.job.scheduledStart,
      windowEnd: windowEnd(r.job),
      tags: visibleTags(r.job.tags),
      outstandingBalance: r.job.outstandingBalance,
      totalAmount: r.job.totalAmount,
      customerId: r.job.customerId,
      customerName: r.customerName,
      addressId: r.address?.id ?? null,
      addressLabel: r.address ? addressLabel(r.address) : null,
      techs: techs.get(r.job.id) ?? [],
    })),
  };
}

export type TechOption = { id: string; name: string };

export async function listTechOptions(): Promise<TechOption[]> {
  const rows = await db
    .select({ id: employees.id, first: employees.firstName, last: employees.lastName })
    .from(employees)
    .where(and(eq(employees.role, SCHEDULABLE_ROLE), eq(employees.active, true)))
    .orderBy(desc(employees.jobs), asc(employees.firstName));
  return rows.map((r) => ({ id: r.id, name: `${r.first} ${r.last}`.trim() }));
}

export async function listTagOptions(): Promise<string[]> {
  const rows = (await db.execute(sql`select t as tag, count(*)::int as n from jobs, unnest(tags) t group by t order by n desc, t`)) as unknown as {
    tag: string;
    n: number;
  }[];
  return visibleTags(rows.map((r) => r.tag.trim()).filter(Boolean));
}

export async function listServiceTypes(): Promise<ServiceType[]> {
  return db.select().from(serviceTypes).where(eq(serviceTypes.active, true)).orderBy(asc(serviceTypes.durationMinutes), asc(serviceTypes.name));
}

// ---------------------------------------------------------------------------
// Job detail
// ---------------------------------------------------------------------------

export type JobPageData = {
  job: Job;
  customerName: string;
  customerKind: string | null;
  addressLabel: string | null;
  windowEnd: Date | null;
  techs: TechRef[];
  notes: NoteView[];
  invoices: InvoiceWithItems[];
  pending: (ChangeRequest & { taskId: string | null }) | null;
  tasks: (Task & { assignedName: string | null })[];
};

export async function loadJobPage(jobId: string): Promise<JobPageData | null> {
  const [head] = await db
    .select({ job: jobs, customerName: customers.displayName, customerKind: customers.kind, address: addresses })
    .from(jobs)
    .innerJoin(customers, eq(customers.id, jobs.customerId))
    .leftJoin(addresses, eq(addresses.id, jobs.addressId))
    .where(eq(jobs.id, jobId))
    .limit(1);
  if (!head) return null;

  const [techMap, noteRows, invs, pendingRows, taskRows] = await Promise.all([
    loadTechs([jobId]),
    db.select().from(notes).where(eq(notes.jobId, jobId)).orderBy(asc(notes.seq), asc(notes.createdAt)),
    loadInvoices([jobId]),
    db
      .select()
      .from(changeRequests)
      .where(and(eq(changeRequests.jobId, jobId), eq(changeRequests.status, "pending")))
      .orderBy(desc(changeRequests.requestedAt))
      .limit(1),
    db
      .select({ task: tasks, assignedName: users.name })
      .from(tasks)
      .leftJoin(users, eq(users.id, tasks.assignedTo))
      .where(eq(tasks.jobId, jobId))
      .orderBy(desc(tasks.createdAt)),
  ]);

  // Author names: office/agent notes carry users.id, tech notes an employees.id.
  const authorIds = [...new Set(noteRows.map((n) => n.authorId).filter((x): x is string => Boolean(x)))];
  const names = new Map<string, string>();
  if (authorIds.length) {
    const [u, e] = await Promise.all([
      db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, authorIds)),
      db.select({ id: employees.id, first: employees.firstName, last: employees.lastName }).from(employees).where(inArray(employees.id, authorIds)),
    ]);
    for (const r of u) names.set(r.id, r.name);
    for (const r of e) names.set(r.id, `${r.first} ${r.last}`.trim());
  }

  const pending = pendingRows[0] ?? null;
  const openCancelTask = pending ? taskRows.find((t) => t.task.kind === "cancellation" && t.task.status === "open") : null;

  return {
    job: head.job,
    customerName: head.customerName,
    customerKind: head.customerKind,
    addressLabel: head.address ? addressLabel(head.address) : null,
    windowEnd: windowEnd(head.job),
    techs: techMap.get(jobId) ?? [],
    notes: noteRows.map((n) => ({ ...n, authorName: n.authorId ? (names.get(n.authorId) ?? null) : null })),
    invoices: invs.sort((a, b) => (b.invoiceDate?.getTime() ?? 0) - (a.invoiceDate?.getTime() ?? 0)),
    pending: pending ? { ...pending, taskId: openCancelTask?.task.id ?? null } : null,
    tasks: taskRows.map((r) => ({ ...r.task, assignedName: r.assignedName })),
  };
}

/** Invoice-number → job id, so /jobs/<invoice number> also resolves. */
export async function resolveJobId(idOrInvoice: string): Promise<string | null> {
  const [byId] = await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.id, idOrInvoice)).limit(1);
  if (byId) return byId.id;
  if (/^\d+$/.test(idOrInvoice)) {
    const [byInv] = await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.invoiceNumber, idOrInvoice)).orderBy(desc(jobs.createdAt)).limit(1);
    if (byInv) return byInv.id;
  }
  return null;
}
