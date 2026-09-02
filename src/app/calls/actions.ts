"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { calls } from "@/db/schema";
import { AGENT_TASK_KINDS, createTask } from "@/domain/tasks";
import { actorFromUser, requireUser } from "@/lib/auth";
import { emitEvent } from "@/lib/events";
import { ToolError } from "@/agent/errors";

/**
 * Office actions on a call record (W2-C). Both run as the signed-in user
 * (`actorFromUser`) and write one event each, per docs/EVENTS.md.
 */

export type ActionResult<T = Record<string, never>> = { ok: true } & T | { ok: false; error: string };

const CallId = z.string().trim().min(1).max(80);

/** Toggle `calls.needs_review`; emits `call.reviewed` with the new value. */
export async function setCallReviewed(callIdRaw: string, needsReview: boolean): Promise<ActionResult<{ needsReview: boolean }>> {
  const user = await requireUser();
  const callId = CallId.parse(callIdRaw);
  const [row] = await db
    .update(calls)
    .set({ needsReview })
    .where(eq(calls.id, callId))
    .returning({ id: calls.id, needsReview: calls.needsReview });
  if (!row) return { ok: false, error: "Call not found" };

  const actor = actorFromUser(user);
  await emitEvent({
    actor: "office",
    actorId: actor.userId,
    callId,
    type: "call.reviewed",
    entityType: "call",
    entityId: callId,
    payload: {
      actor_label: actor.label,
      summary: needsReview ? `${actor.label} flagged the call for review` : `${actor.label} marked the call reviewed`,
      call_id: callId,
      needs_review: needsReview,
    },
  });
  revalidatePath(`/calls/${callId}`);
  revalidatePath("/calls");
  return { ok: true, needsReview: row.needsReview };
}

const FollowUp = z.object({
  callId: CallId,
  title: z.string().trim().min(3, "Give the task a title").max(200),
  body: z.string().trim().max(2000).optional(),
  kind: z.enum(AGENT_TASK_KINDS).default("followup"),
  dueAt: z.string().trim().optional(),
});

/** "Create follow-up task" button: `createTask` (domain) with the office actor and this call id. */
export async function createFollowUpTask(input: z.input<typeof FollowUp>): Promise<ActionResult<{ taskId: string }>> {
  const user = await requireUser();
  const parsed = FollowUp.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { callId, title, body, kind, dueAt } = parsed.data;

  const [call] = await db.select({ id: calls.id, customerId: calls.matchedCustomerId }).from(calls).where(eq(calls.id, callId)).limit(1);
  if (!call) return { ok: false, error: "Call not found" };

  try {
    const res = await createTask(
      {
        kind,
        title,
        body: body || undefined,
        customer_id: call.customerId ?? undefined,
        due_at: dueAt || undefined,
      },
      { actor: "office", actorId: user.id, callId },
    );
    revalidatePath(`/calls/${callId}`);
    revalidatePath("/inbox");
    return { ok: true, taskId: res.task_id };
  } catch (err) {
    if (err instanceof ToolError) return { ok: false, error: err.message };
    throw err;
  }
}
