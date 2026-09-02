/**
 * Inbox tasks (W1-B). Contract: docs/TOOLS.md `create_task`; event `task.created`.
 */
import { eq } from "drizzle-orm";
import { customers, jobs, tasks } from "@/db/schema";
import { newId } from "@/lib/ids";
import { ToolError } from "@/agent/errors";
import { parseDateInput } from "./availability";
import { actorId, actorLabelFor, resolveCallId, runWrite, type WriteActor } from "./idempotency";

export const AGENT_TASK_KINDS = ["callback", "followup", "review", "handoff"] as const;
export type AgentTaskKind = (typeof AGENT_TASK_KINDS)[number];

export type CreateTaskInput = {
  kind: AgentTaskKind;
  title: string;
  body?: string;
  customer_id?: string;
  job_id?: string;
  due_at?: string;
  idempotency_key?: string;
};

export type CreateTaskResult = { task_id: string; kind: AgentTaskKind; speech_hint: string; [k: string]: unknown };

const SPEECH: Record<AgentTaskKind, string> = {
  callback: "I've put in a callback request; someone from the office will call you back.",
  followup: "I've made a note for the office to follow up on that.",
  review: "I've flagged that for the office to review.",
  handoff: "I've passed this to the office; they'll be in touch shortly.",
};

export async function createTask(input: CreateTaskInput, who: WriteActor): Promise<CreateTaskResult> {
  return runWrite<CreateTaskResult>({
    tool: "create_task",
    idempotencyKey: input.idempotency_key,
    execute: async (tx) => {
      let customerName: string | null = null;
      if (input.customer_id) {
        const [c] = await tx.select({ name: customers.displayName }).from(customers).where(eq(customers.id, input.customer_id)).limit(1);
        if (!c) throw new ToolError("not_found", `customer ${input.customer_id} not found`, "I lost the customer record, but I'll still flag this for the office.");
        customerName = c.name;
      }
      if (input.job_id) {
        const [j] = await tx.select({ id: jobs.id }).from(jobs).where(eq(jobs.id, input.job_id)).limit(1);
        if (!j) throw new ToolError("not_found", `job ${input.job_id} not found`, "I can't find that visit, but I'll still flag this for the office.");
      }
      const dueAt = input.due_at ? parseDateInput(input.due_at, "due_at") : null;
      const id = newId("tsk");
      const callId = await resolveCallId(tx, who.callId);
      await tx.insert(tasks).values({
        id,
        kind: input.kind,
        status: "open",
        title: input.title.trim(),
        body: input.body?.trim() || null,
        customerId: input.customer_id ?? null,
        jobId: input.job_id ?? null,
        callId,
        dueAt,
      });
      return {
        result: { task_id: id, kind: input.kind, speech_hint: SPEECH[input.kind] },
        event: {
          actor: who.actor,
          actorId: actorId(who),
          callId,
          type: "task.created",
          entityType: "task",
          entityId: id,
          payload: {
            actor_label: await actorLabelFor(tx, who),
            summary: `Created a ${input.kind} task${customerName ? ` for ${customerName}` : ""}: ${input.title.trim()}`,
            task_id: id,
            kind: input.kind,
            title: input.title.trim(),
            customer_id: input.customer_id ?? null,
            job_id: input.job_id ?? null,
            due_at: dueAt?.toISOString() ?? null,
          },
        },
      };
    },
  });
}
