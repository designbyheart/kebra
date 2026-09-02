/**
 * Server-side reads for the Today board. The day itself comes from W1-C's
 * `getSchedule`; the two thin extras here (canceled jobs on the day, the
 * needs-scheduling backlog) are reads only — every write goes through the
 * W1-B domain functions in ./actions.ts.
 */
import { and, desc, eq, gte, inArray, lt } from "drizzle-orm";
import { db } from "@/db";
import { addresses, customers, jobs } from "@/db/schema";
import { loadTechs as loadFieldTechs } from "@/domain/availability";
import { CANCELED_STATUSES, addressLabel, hasCallbackTag, loadTechs as loadJobTechs, spokenWindow, windowEnd } from "@/domain/history";
import { getSchedule, parseDateET } from "@/domain/schedule";
import { INSTALL_RE } from "@/domain/warranty";
import type { BoardData, BoardJob, UnscheduledJob } from "@/components/board/types";

const NEEDS_SCHEDULING_CAP = 24;

export async function loadBoard(date: string, now: Date = new Date()): Promise<BoardData | null> {
  const day = parseDateET(date);
  if (!day) return null;
  const [schedule, canceled, needsScheduling, techs] = await Promise.all([
    getSchedule(date, null, now),
    loadCanceledOn(day, now),
    loadNeedsScheduling(),
    loadFieldTechs(db),
  ]);
  if (!schedule) return null;
  return {
    date,
    schedule,
    canceled,
    needsScheduling,
    techs: techs.map((t) => ({ id: t.id, name: t.name })).sort((a, b) => a.name.localeCompare(b.name)),
    now: now.toISOString(),
  };
}

/** Canceled jobs whose window was on the day (getSchedule drops them; the board greys them out). */
async function loadCanceledOn(day: { start: Date; end: Date }, now: Date): Promise<BoardJob[]> {
  const rows = await db
    .select({ job: jobs, customerName: customers.displayName, address: addresses })
    .from(jobs)
    .innerJoin(customers, eq(customers.id, jobs.customerId))
    .leftJoin(addresses, eq(addresses.id, jobs.addressId))
    .where(
      and(
        gte(jobs.scheduledStart, day.start),
        lt(jobs.scheduledStart, day.end),
        inArray(jobs.workStatus, [...CANCELED_STATUSES]),
      ),
    )
    .orderBy(jobs.scheduledStart, jobs.id);
  const techMap = await loadJobTechs(rows.map((r) => r.job.id));
  return rows.map((r) => {
    const techs = techMap.get(r.job.id) ?? [];
    const start = r.job.scheduledStart!;
    const end = windowEnd(r.job);
    return {
      job_id: r.job.id,
      invoice_number: r.job.invoiceNumber,
      window_start: start.toISOString(),
      window_end: end ? end.toISOString() : null,
      window_label: spokenWindow(start, end, now),
      status: r.job.workStatus,
      priority: r.job.priority,
      description: r.job.description,
      customer_name: r.customerName,
      address_id: r.address?.id ?? null,
      address_label: r.address ? addressLabel(r.address) : null,
      tech_names: techs.map((t) => t.name),
      tech_ids: techs.map((t) => t.employee_id),
      tags: r.job.tags,
      source: r.job.source,
      is_install: Boolean(r.job.description && INSTALL_RE.test(r.job.description)),
      is_callback: hasCallbackTag(r.job.tags) || /callback/i.test(r.job.description ?? ""),
    };
  });
}

/** Jobs waiting for a window, newest activity first. Not tied to the day. */
async function loadNeedsScheduling(): Promise<BoardData["needsScheduling"]> {
  const rows = await db
    .select({ job: jobs, customerName: customers.displayName, address: addresses })
    .from(jobs)
    .innerJoin(customers, eq(customers.id, jobs.customerId))
    .leftJoin(addresses, eq(addresses.id, jobs.addressId))
    .where(eq(jobs.workStatus, "needs scheduling"))
    .orderBy(desc(jobs.updatedAt), desc(jobs.createdAt), jobs.id);
  const shown = rows.slice(0, NEEDS_SCHEDULING_CAP);
  const techMap = await loadJobTechs(shown.map((r) => r.job.id));
  const list: UnscheduledJob[] = shown.map((r) => {
    const techs = techMap.get(r.job.id) ?? [];
    return {
      job_id: r.job.id,
      invoice_number: r.job.invoiceNumber,
      description: r.job.description,
      status: r.job.workStatus,
      priority: r.job.priority,
      source: r.job.source,
      customer_name: r.customerName,
      address_label: r.address ? addressLabel(r.address) : null,
      tech_names: techs.map((t) => t.name),
      tech_ids: techs.map((t) => t.employee_id),
      updated_at: r.job.updatedAt.toISOString(),
    };
  });
  return { jobs: list, total: rows.length };
}
