"use server";

/**
 * Office mutations on jobs. Every action authenticates, calls the W1-B domain
 * function with the office actor (so the event carries the user's name), and
 * revalidates the pages that show the job.
 */
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { runAction, type ActionResult } from "@/components/jobs/action-result";
import { findAvailability, type Slot } from "@/domain/availability";
import { assignJob, cancelJob, loadJobDetail, rescheduleJob, setJobStatus, WORK_STATUSES, type WorkStatus } from "@/domain/jobs";
import { addNote } from "@/domain/notes";
import { db } from "@/db";

async function revalidateJob(jobId: string) {
  const j = await loadJobDetail(db, jobId).catch(() => null);
  revalidatePath("/jobs");
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/today");
  revalidatePath("/inbox");
  if (j?.addressId) revalidatePath(`/addresses/${j.addressId}`);
  if (j?.customerId) revalidatePath(`/customers/${j.customerId}`);
}

export async function addNoteAction(jobId: string, content: string): Promise<ActionResult<{ note_id: string }>> {
  const user = await requireUser();
  const text = content.trim();
  if (!text) return { ok: false, code: "validation", message: "Write something first." };
  const res = await runAction(() => addNote({ job_id: jobId, content: text }, { actor: "office", actorId: user.id }));
  if (res.ok) await revalidateJob(jobId);
  return res;
}

export type FindSlotsInput = {
  from: string;
  to?: string;
  service_type: string;
  preferred_employee_id?: string;
  address_id?: string;
};

export async function findSlotsAction(input: FindSlotsInput): Promise<ActionResult<{ slots: Slot[]; closed_days: string[] }>> {
  await requireUser();
  return runAction(async () => {
    const r = await findAvailability({
      from: input.from,
      to: input.to,
      service_type: input.service_type,
      preferred_employee_id: input.preferred_employee_id || undefined,
      address_id: input.address_id || undefined,
      limit: 8,
    });
    return { slots: r.slots, closed_days: r.closed_days };
  });
}

export type RescheduleInput = { job_id: string; new_window_start: string; employee_id?: string; reason: string };

export async function rescheduleJobAction(input: RescheduleInput): Promise<ActionResult<{ job_id: string; new_window_label: string; employee_name: string }>> {
  const user = await requireUser();
  if (!input.reason.trim()) return { ok: false, code: "validation", message: "A reason is required." };
  const res = await runAction(() =>
    rescheduleJob(
      { job_id: input.job_id, new_window_start: input.new_window_start, employee_id: input.employee_id || undefined, reason: input.reason },
      { actor: "office", actorId: user.id },
    ),
  );
  if (res.ok) await revalidateJob(input.job_id);
  return res;
}

export async function assignJobAction(jobId: string, employeeId: string): Promise<ActionResult<{ job_id: string; employee_id: string }>> {
  const user = await requireUser();
  if (!employeeId) return { ok: false, code: "validation", message: "Pick a tech." };
  const res = await runAction(() => assignJob(jobId, employeeId, user.id));
  if (res.ok) await revalidateJob(jobId);
  return res;
}

export async function setJobStatusAction(jobId: string, status: string, note?: string): Promise<ActionResult<{ job_id: string; work_status: WorkStatus }>> {
  const user = await requireUser();
  if (!(WORK_STATUSES as readonly string[]).includes(status) || status === "pending_cancellation") {
    return { ok: false, code: "validation", message: "That status can't be set from here." };
  }
  const res = await runAction(() => setJobStatus(jobId, status as WorkStatus, user.id, note));
  if (res.ok) await revalidateJob(jobId);
  return res;
}

export async function cancelJobAction(
  jobId: string,
  reason: string,
  status: "user canceled" | "pro canceled" = "user canceled",
): Promise<ActionResult<{ job_id: string; work_status: WorkStatus }>> {
  const user = await requireUser();
  if (!reason.trim()) return { ok: false, code: "validation", message: "A reason is required." };
  const res = await runAction(() => cancelJob(jobId, user.id, reason, { status }));
  if (res.ok) await revalidateJob(jobId);
  return res;
}
