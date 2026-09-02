/**
 * Task updates (W2-D). Wave 1 shipped createTask only; assign / start /
 * resolve / dismiss / reopen live here, one transaction + one `task.updated`
 * event each (docs/EVENTS.md), same `runWrite` plumbing the domain uses.
 * Server-only and NOT a server action: it takes the actor explicitly, so it
 * must never be exported from a "use server" file.
 */
import { eq, sql } from "drizzle-orm";
import { customers, tasks, users, type Task } from "@/db/schema";
import { ToolError } from "@/agent/errors";
import { actorLabelFor, runWrite, type WriteActor } from "@/domain/idempotency";

export type TaskStatus = Task["status"];
const TASK_STATUSES: readonly TaskStatus[] = ["open", "in_progress", "done", "dismissed"];

export type UpdateTaskResult = {
  task_id: string;
  from_status: TaskStatus;
  to_status: TaskStatus;
  assigned_to: string | null;
  job_id: string | null;
  [k: string]: unknown;
};

type UpdateTaskPatch = { status?: TaskStatus; assignedTo?: string | null };

/**
 * Server-only. `patch.status` moves the task (any → any except a no-op);
 * `patch.assignedTo` sets or clears the assignee (`null` clears). At least
 * one of the two must change something.
 */
export async function updateTask(taskId: string, patch: UpdateTaskPatch, who: WriteActor): Promise<UpdateTaskResult> {
  return runWrite<UpdateTaskResult>({
    tool: "update_task",
    execute: async (tx) => {
      const [t] = await tx
        .select({ task: tasks, customerName: customers.displayName })
        .from(tasks)
        .leftJoin(customers, eq(customers.id, tasks.customerId))
        .where(eq(tasks.id, taskId))
        .limit(1);
      if (!t) throw new ToolError("not_found", `task ${taskId} not found`, "That task no longer exists.");
      const task = t.task;

      const nextStatus = patch.status ?? task.status;
      if (patch.status !== undefined && !TASK_STATUSES.includes(patch.status)) {
        throw new ToolError("validation", `bad status ${String(patch.status)}`, "That is not a task status.");
      }
      const statusChanges = nextStatus !== task.status;
      const assigneeChanges = patch.assignedTo !== undefined && (patch.assignedTo ?? null) !== (task.assignedTo ?? null);
      if (patch.status !== undefined && !statusChanges && !assigneeChanges) {
        throw new ToolError("invalid_state", `task ${task.id} is already ${task.status}`, `That task is already ${task.status.replace("_", " ")}.`);
      }
      if (!statusChanges && !assigneeChanges) {
        throw new ToolError("invalid_state", "nothing to change", "Nothing to change on that task.");
      }

      let assigneeName: string | null = null;
      if (assigneeChanges && patch.assignedTo) {
        const [u] = await tx.select({ name: users.name }).from(users).where(eq(users.id, patch.assignedTo)).limit(1);
        if (!u) throw new ToolError("not_found", `user ${patch.assignedTo} not found`, "That user does not exist.");
        assigneeName = u.name;
      }

      const set: Partial<typeof tasks.$inferInsert> = {};
      if (statusChanges) {
        set.status = nextStatus;
        if (nextStatus === "done" || nextStatus === "dismissed") set.resolvedAt = sql`now()` as unknown as Date;
        else set.resolvedAt = null;
      }
      if (assigneeChanges) set.assignedTo = patch.assignedTo ?? null;
      await tx.update(tasks).set(set).where(eq(tasks.id, task.id));

      const label = await actorLabelFor(tx, who);
      const subject = `the ${KIND_WORD[task.kind]}${t.customerName ? ` for ${t.customerName}` : ""}`;
      const bits: string[] = [];
      if (statusChanges) bits.push(`${STATUS_VERB[nextStatus]} ${subject}`);
      if (assigneeChanges) bits.push(patch.assignedTo ? `assigned ${statusChanges ? "it" : subject} to ${assigneeName}` : `cleared the assignee${statusChanges ? "" : ` on ${subject}`}`);
      const summary = `${label} ${bits.join(" and ")}: ${task.title}`;

      return {
        result: {
          task_id: task.id,
          from_status: task.status,
          to_status: nextStatus,
          assigned_to: assigneeChanges ? (patch.assignedTo ?? null) : (task.assignedTo ?? null),
          job_id: task.jobId,
        },
        event: {
          actor: "office",
          actorId: who.actorId ?? null,
          callId: task.callId,
          type: "task.updated",
          entityType: "task",
          entityId: task.id,
          payload: {
            actor_label: label,
            summary,
            task_id: task.id,
            kind: task.kind,
            from_status: task.status,
            to_status: nextStatus,
            assigned_to: assigneeChanges ? (patch.assignedTo ?? null) : (task.assignedTo ?? null),
            job_id: task.jobId,
            customer_id: task.customerId,
          },
        },
      };
    },
  });
}

const KIND_WORD: Record<Task["kind"], string> = {
  cancellation: "cancellation request",
  handoff: "handoff",
  callback: "callback",
  review: "review",
  followup: "follow-up",
};
const STATUS_VERB: Record<TaskStatus, string> = {
  open: "reopened",
  in_progress: "started",
  done: "resolved",
  dismissed: "dismissed",
};
