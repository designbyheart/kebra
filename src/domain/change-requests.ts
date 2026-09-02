/**
 * Cancellation requests (W1-B). The agent may only *request* a cancellation
 * (docs/TOOLS.md `request_cancellation`); the office approves or rejects.
 * Events: job.cancellation_requested / _approved / _rejected.
 */
import { and, eq, sql } from "drizzle-orm";
import { calls, changeRequests, jobs, tasks } from "@/db/schema";
import { newId } from "@/lib/ids";
import { ToolError } from "@/agent/errors";
import { appendNote, requireJob, windowLabelOf, type WorkStatus } from "./jobs";
import { actorId, actorLabelFor, resolveCallId, runWrite, type Tx, type WriteActor } from "./idempotency";

const REQUESTABLE: WorkStatus[] = ["scheduled", "needs scheduling", "in progress"];

export type RequestCancellationInput = { job_id: string; reason: string; idempotency_key?: string };
export type RequestCancellationResult = {
  change_request_id: string;
  job_id: string;
  status: "pending";
  speech_hint: string;
  [k: string]: unknown;
};

export async function requestCancellation(input: RequestCancellationInput, who: WriteActor): Promise<RequestCancellationResult> {
  return runWrite<RequestCancellationResult>({
    tool: "request_cancellation",
    idempotencyKey: input.idempotency_key,
    execute: async (tx) => {
      const job = await requireJob(tx, input.job_id);
      if (job.workStatus === "pending_cancellation") {
        throw new ToolError(
          "invalid_state",
          `job ${job.id} already has a pending cancellation`,
          "There's already a cancellation request in for that visit; the office will confirm it shortly.",
          { work_status: job.workStatus },
        );
      }
      if (!REQUESTABLE.includes(job.workStatus)) {
        throw new ToolError(
          "invalid_state",
          `job ${job.id} is ${job.workStatus}`,
          job.workStatus.startsWith("complete")
            ? "That visit is already complete, so there's nothing to cancel."
            : "That visit is already canceled.",
          { work_status: job.workStatus },
        );
      }

      const callId = await resolveCallId(tx, who.callId);
      let transcriptRef: { from: number; to: number } | null = null;
      if (callId) {
        const [c] = await tx
          .select({ n: sql<number>`jsonb_array_length(${calls.transcript})` })
          .from(calls)
          .where(eq(calls.id, callId))
          .limit(1);
        const n = Number(c?.n ?? 0);
        transcriptRef = { from: n, to: n };
      }

      const reason = input.reason.trim();
      const id = newId("chg");
      await tx.insert(changeRequests).values({
        id,
        jobId: job.id,
        kind: "cancel",
        status: "pending",
        reason,
        previousStatus: job.workStatus,
        callId,
        transcriptRef,
      });
      await tx.update(jobs).set({ workStatus: "pending_cancellation", updatedAt: sql`now()` }).where(eq(jobs.id, job.id));

      const label = windowLabelOf(job);
      await tx.insert(tasks).values({
        id: newId("tsk"),
        kind: "cancellation",
        status: "open",
        title: `Cancellation request: ${job.customerName}${label ? ` — ${label}` : ""}`,
        body: `Reason: ${reason}${job.invoiceNumber ? `\nJob #${job.invoiceNumber}` : ""}${job.addressLabel ? `\n${job.addressLabel}` : ""}`,
        customerId: job.customerId,
        jobId: job.id,
        callId,
        dueAt: job.scheduledStart,
      });
      await appendNote(tx, {
        jobId: job.id,
        content: `Cancellation requested. Reason: ${reason}`,
        authorType: who.actor,
        authorId: actorId(who),
      });

      return {
        result: {
          change_request_id: id,
          job_id: job.id,
          status: "pending",
          speech_hint: "I've passed your cancellation request to the office. Nothing is canceled yet, they'll review it and confirm with you shortly. Anything else I can help with?",
        },
        event: {
          actor: who.actor,
          actorId: actorId(who),
          callId,
          type: "job.cancellation_requested",
          entityType: "job",
          entityId: job.id,
          payload: {
            actor_label: await actorLabelFor(tx, who),
            summary: `Cancellation requested for ${job.customerName}'s visit${label ? ` (${label})` : ""}: ${reason}`,
            job_id: job.id,
            change_request_id: id,
            reason,
          },
        },
      };
    },
  });
}

async function loadPending(tx: Tx, changeRequestId: string) {
  const [cr] = await tx.select().from(changeRequests).where(eq(changeRequests.id, changeRequestId)).limit(1);
  if (!cr) throw new ToolError("not_found", `change request ${changeRequestId} not found`, "That request no longer exists.");
  if (cr.status !== "pending") {
    throw new ToolError("invalid_state", `change request ${cr.id} is ${cr.status}`, `That request was already ${cr.status}.`, {
      status: cr.status,
    });
  }
  return cr;
}

async function closeCancellationTask(tx: Tx, jobId: string) {
  await tx
    .update(tasks)
    .set({ status: "done", resolvedAt: sql`now()` })
    .where(and(eq(tasks.jobId, jobId), eq(tasks.kind, "cancellation"), eq(tasks.status, "open")));
}

export type ResolveResult = { change_request_id: string; job_id: string; status: "approved" | "rejected"; work_status: WorkStatus; [k: string]: unknown };

/** Office approves: the job becomes `user canceled`, the inbox task is closed. */
export async function approveCancellation(changeRequestId: string, byUserId: string): Promise<ResolveResult> {
  const who: WriteActor = { actor: "office", actorId: byUserId };
  return runWrite<ResolveResult>({
    tool: "approve_cancellation",
    execute: async (tx) => {
      const cr = await loadPending(tx, changeRequestId);
      const job = await requireJob(tx, cr.jobId);
      await tx
        .update(changeRequests)
        .set({ status: "approved", resolvedAt: sql`now()`, resolvedBy: byUserId })
        .where(eq(changeRequests.id, cr.id));
      await tx
        .update(jobs)
        .set({ workStatus: "user canceled", canceledAt: sql`now()`, updatedAt: sql`now()` })
        .where(eq(jobs.id, job.id));
      await closeCancellationTask(tx, job.id);
      await appendNote(tx, { jobId: job.id, content: "Cancellation approved by office.", authorType: "office", authorId: byUserId });
      const label = await actorLabelFor(tx, who);
      return {
        result: { change_request_id: cr.id, job_id: job.id, status: "approved", work_status: "user canceled" },
        event: {
          actor: "office",
          actorId: byUserId,
          callId: cr.callId,
          type: "job.cancellation_approved",
          entityType: "job",
          entityId: job.id,
          payload: {
            actor_label: label,
            summary: `${label} approved the cancellation of ${job.customerName}'s visit${windowLabelOf(job) ? ` (${windowLabelOf(job)})` : ""}.`,
            job_id: job.id,
            change_request_id: cr.id,
            approved_by: byUserId,
          },
        },
      };
    },
  });
}

/** Office rejects: restore the previous status and open a callback task so the customer hears why. */
export async function rejectCancellation(changeRequestId: string, byUserId: string, note: string): Promise<ResolveResult & { callback_task_id: string }> {
  const who: WriteActor = { actor: "office", actorId: byUserId };
  return runWrite<ResolveResult & { callback_task_id: string }>({
    tool: "reject_cancellation",
    execute: async (tx) => {
      const cr = await loadPending(tx, changeRequestId);
      const job = await requireJob(tx, cr.jobId);
      const restored: WorkStatus = cr.previousStatus ?? "scheduled";
      const resolution = note.trim();
      await tx
        .update(changeRequests)
        .set({ status: "rejected", resolvedAt: sql`now()`, resolvedBy: byUserId, resolutionNote: resolution })
        .where(eq(changeRequests.id, cr.id));
      await tx.update(jobs).set({ workStatus: restored, updatedAt: sql`now()` }).where(eq(jobs.id, job.id));
      await closeCancellationTask(tx, job.id);
      const callbackId = newId("tsk");
      await tx.insert(tasks).values({
        id: callbackId,
        kind: "callback",
        status: "open",
        title: `Call back ${job.customerName}: cancellation not approved`,
        body: `${resolution}${windowLabelOf(job) ? `\nVisit stays on the books: ${windowLabelOf(job)}` : ""}`,
        customerId: job.customerId,
        jobId: job.id,
        callId: cr.callId,
        dueAt: sql`now() + interval '2 hours'` as unknown as Date,
      });
      await appendNote(tx, {
        jobId: job.id,
        content: `Cancellation rejected by office; status restored to ${restored}. ${resolution}`,
        authorType: "office",
        authorId: byUserId,
      });
      const label = await actorLabelFor(tx, who);
      return {
        result: { change_request_id: cr.id, job_id: job.id, status: "rejected", work_status: restored, callback_task_id: callbackId },
        event: {
          actor: "office",
          actorId: byUserId,
          callId: cr.callId,
          type: "job.cancellation_rejected",
          entityType: "job",
          entityId: job.id,
          payload: {
            actor_label: label,
            summary: `${label} kept ${job.customerName}'s visit on the books: ${resolution}`,
            job_id: job.id,
            change_request_id: cr.id,
            rejected_by: byUserId,
            note: resolution,
            callback_task_id: callbackId,
          },
        },
      };
    },
  });
}
