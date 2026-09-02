"use server";

/**
 * Server actions behind the job side sheet. Reads are thin queries; every
 * write calls a W1-B domain function with the office actor from the session
 * (`actorFromUser`), so the audit trail and the live feed are identical to
 * what the voice agent produces.
 */
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { changeRequests, jobs, notes, serviceTypes, tasks } from "@/db/schema";
import { ToolError } from "@/agent/errors";
import { actorFromUser, requireUser } from "@/lib/auth";
import { SERVICE_TYPE_IDS, findAvailability } from "@/domain/availability";
import type { WriteActor } from "@/domain/idempotency";
import { WORK_STATUSES, assignJob, cancelJob, loadJobDetail, rescheduleJob, setJobStatus } from "@/domain/jobs";
import { addNote } from "@/domain/notes";
import type { ActionResult, JobSheetData, Slot } from "@/lib/ui/board-types";

const id = z.string().trim().min(1).max(64);
const isoInstant = z
  .string()
  .trim()
  .refine((s) => !Number.isNaN(new Date(s).getTime()), "invalid instant");

async function office(): Promise<{ userId: string; who: WriteActor }> {
  const user = await requireUser();
  const { userId } = actorFromUser(user);
  return { userId, who: { actor: "office", actorId: userId } };
}

function failure(err: unknown): ActionResult<never> {
  if (err instanceof ToolError) return { ok: false, error: err.message, code: err.code };
  if (err instanceof z.ZodError) return { ok: false, error: err.issues.map((i) => i.message).join("; "), code: "validation" };
  console.error("[today/actions]", err);
  return { ok: false, error: err instanceof Error ? err.message : "Something went wrong" };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getJobDetailAction(jobId: string): Promise<ActionResult<JobSheetData>> {
  try {
    await requireUser();
    const jid = id.parse(jobId);
    const j = await loadJobDetail(db, jid);
    if (!j) return { ok: false, error: "Job not found", code: "not_found" };

    const [[extra], noteRows, [pending], types] = await Promise.all([
      db
        .select({
          source: jobs.source,
          tags: jobs.tags,
          totalAmount: jobs.totalAmount,
          outstandingBalance: jobs.outstandingBalance,
          createdAt: jobs.createdAt,
        })
        .from(jobs)
        .where(eq(jobs.id, jid))
        .limit(1),
      db.select().from(notes).where(eq(notes.jobId, jid)).orderBy(asc(notes.seq), asc(notes.createdAt)),
      db
        .select()
        .from(changeRequests)
        .where(and(eq(changeRequests.jobId, jid), eq(changeRequests.status, "pending")))
        .orderBy(desc(changeRequests.requestedAt))
        .limit(1),
      db
        .select({ id: serviceTypes.id, name: serviceTypes.name, durationMinutes: serviceTypes.durationMinutes })
        .from(serviceTypes)
        .where(eq(serviceTypes.active, true)),
    ]);

    let taskId: string | null = null;
    if (pending) {
      const [t] = await db
        .select({ id: tasks.id })
        .from(tasks)
        .where(and(eq(tasks.jobId, jid), eq(tasks.kind, "cancellation"), inArray(tasks.status, ["open", "in_progress"])))
        .orderBy(desc(tasks.createdAt))
        .limit(1);
      taskId = t?.id ?? null;
    }

    return {
      ok: true,
      data: {
        job: {
          id: j.id,
          invoiceNumber: j.invoiceNumber,
          description: j.description,
          workStatus: j.workStatus,
          scheduledStart: j.scheduledStart?.toISOString() ?? null,
          scheduledEnd: j.scheduledEnd?.toISOString() ?? null,
          arrivalWindow: j.arrivalWindow,
          customerId: j.customerId,
          customerName: j.customerName,
          addressId: j.addressId,
          addressLabel: j.addressLabel,
          serviceType: j.serviceType,
          priority: j.priority,
          source: extra?.source ?? "import",
          tags: extra?.tags ?? [],
          totalAmount: extra?.totalAmount ?? 0,
          outstandingBalance: extra?.outstandingBalance ?? 0,
          createdAt: (extra?.createdAt ?? new Date()).toISOString(),
          techs: j.techs,
        },
        notes: noteRows.map((n) => ({
          id: n.id,
          content: n.content,
          authorType: n.authorType,
          authorId: n.authorId,
          createdAt: n.createdAt.toISOString(),
          seq: n.seq,
        })),
        pendingCancellation: pending
          ? {
              id: pending.id,
              reason: pending.reason,
              requestedAt: pending.requestedAt.toISOString(),
              callId: pending.callId,
              taskId,
            }
          : null,
        serviceTypes: types.sort((a, b) => a.name.localeCompare(b.name)),
      },
    };
  } catch (err) {
    return failure(err);
  }
}

const FindSlots = z.object({
  from: z.string().trim().min(8).max(40),
  service_type: z.enum(SERVICE_TYPE_IDS),
  preferred_employee_id: id.optional(),
  address_id: id.optional(),
  priority: z.enum(["normal", "high", "emergency"]).optional(),
});

export async function findSlotsAction(input: z.input<typeof FindSlots>): Promise<ActionResult<Slot[]>> {
  try {
    await requireUser();
    const p = FindSlots.parse(input);
    const { slots } = await findAvailability({ ...p, limit: 6 });
    return { ok: true, data: slots };
  } catch (err) {
    return failure(err);
  }
}

// ---------------------------------------------------------------------------
// Writes (W1-B domain functions, office actor)
// ---------------------------------------------------------------------------

export async function addNoteAction(jobId: string, content: string): Promise<ActionResult<{ note_id: string }>> {
  try {
    const { who } = await office();
    const text = z.string().trim().min(1, "Write something first").max(4000).parse(content);
    const r = await addNote({ job_id: id.parse(jobId), content: text }, who);
    return { ok: true, data: { note_id: r.note_id } };
  } catch (err) {
    return failure(err);
  }
}

const Reschedule = z.object({
  job_id: id,
  new_window_start: isoInstant,
  employee_id: id.optional(),
  reason: z.string().trim().min(1, "Give a reason").max(500),
});

export async function rescheduleAction(
  input: z.input<typeof Reschedule>,
): Promise<ActionResult<{ new_window_label: string; employee_name: string }>> {
  try {
    const { who } = await office();
    const p = Reschedule.parse(input);
    const r = await rescheduleJob(p, who);
    return { ok: true, data: { new_window_label: r.new_window_label, employee_name: r.employee_name } };
  } catch (err) {
    return failure(err);
  }
}

export async function reassignAction(jobId: string, employeeId: string): Promise<ActionResult<{ employee_id: string }>> {
  try {
    const { userId } = await office();
    const r = await assignJob(id.parse(jobId), id.parse(employeeId), userId);
    return { ok: true, data: { employee_id: r.employee_id } };
  } catch (err) {
    return failure(err);
  }
}

export async function setStatusAction(jobId: string, status: string, note?: string): Promise<ActionResult<{ work_status: string }>> {
  try {
    const { userId } = await office();
    const s = z.enum(WORK_STATUSES).parse(status);
    const n = note?.trim() ? note.trim().slice(0, 500) : undefined;
    const r = await setJobStatus(id.parse(jobId), s, userId, n);
    return { ok: true, data: { work_status: r.work_status } };
  } catch (err) {
    return failure(err);
  }
}

export async function cancelAction(
  jobId: string,
  reason: string,
  status: "user canceled" | "pro canceled" = "user canceled",
): Promise<ActionResult<{ work_status: string }>> {
  try {
    const { userId } = await office();
    const why = z.string().trim().min(1, "Give a reason").max(500).parse(reason);
    const r = await cancelJob(id.parse(jobId), userId, why, { status });
    return { ok: true, data: { work_status: r.work_status } };
  } catch (err) {
    return failure(err);
  }
}
