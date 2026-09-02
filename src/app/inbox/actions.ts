"use server";

/**
 * Inbox server actions. Thin: resolve the session user, delegate to
 * `resolveCancellationAs` (W2-E) or `updateTask` (W2-D), revalidate the
 * screens that show the job.
 */
import { revalidatePath } from "next/cache";
import { getCurrentUser, requireUser } from "@/lib/auth";
import { resolveCancellationAs, type ResolveOutcome } from "@/app/inbox/cancellation-resolve";
import { runAction, type ActionResult } from "@/lib/action-result";
import { updateTask, type TaskStatus, type UpdateTaskResult } from "./update-task";

const AFFECTED_PATHS = ["/inbox", "/inbox/cancellations", "/today", "/jobs"];

function revalidateAffected(jobId?: string) {
  for (const p of AFFECTED_PATHS) revalidatePath(p);
  if (jobId) revalidatePath(`/jobs/${jobId}`);
}

export async function approveCancellationAction(changeRequestId: string): Promise<ResolveOutcome> {
  const user = await getCurrentUser();
  const out = await resolveCancellationAs(user, { action: "approve", changeRequestId });
  if (out.ok) revalidateAffected(out.result.job_id);
  return out;
}

export async function rejectCancellationAction(changeRequestId: string, note: string): Promise<ResolveOutcome> {
  const user = await getCurrentUser();
  const out = await resolveCancellationAs(user, { action: "reject", changeRequestId, note });
  if (out.ok) revalidateAffected(out.result.job_id);
  return out;
}

// --- tasks (W2-D) ----------------------------------------------------------

function revalidateTask(jobId: string | null) {
  revalidatePath("/inbox");
  if (jobId) revalidatePath(`/jobs/${jobId}`);
}

export async function setTaskStatusAction(taskId: string, status: TaskStatus): Promise<ActionResult<UpdateTaskResult>> {
  const user = await requireUser();
  const out = await runAction(() => updateTask(taskId, { status }, { actor: "office", actorId: user.id }));
  if (out.ok) revalidateTask(out.result.job_id);
  return out;
}

export async function assignTaskAction(taskId: string, userId: string | null): Promise<ActionResult<UpdateTaskResult>> {
  const user = await requireUser();
  const out = await runAction(() => updateTask(taskId, { assignedTo: userId || null }, { actor: "office", actorId: user.id }));
  if (out.ok) revalidateTask(out.result.job_id);
  return out;
}
