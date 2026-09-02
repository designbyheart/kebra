import { z } from "zod";
import { defineTool } from "@/agent/registry";
import { AGENT_TASK_KINDS, createTask } from "@/domain/tasks";
import { dateOrIso } from "@/agent/tools/find-availability";

export const createTaskTool = defineTool({
  description:
    "Open a task in the office inbox. kind: `callback` when someone must phone the caller back (say when), `handoff` " +
    "when a transfer to the office failed or the request is beyond you (billing, complaints, safety follow-up), " +
    "`followup` for something the office should do later, `review` when you are unsure a booking or note is right. " +
    "Title is one line the office can act on; put details, the caller's number and the promised time in body. " +
    "Attach customer_id / job_id when known.",
  input: z.object({
    kind: z.enum(AGENT_TASK_KINDS),
    title: z.string().trim().min(3).max(200),
    body: z.string().trim().max(2000).optional(),
    customer_id: z.string().trim().max(64).optional(),
    job_id: z.string().trim().max(64).optional(),
    due_at: dateOrIso.optional().describe("When it must be done by (ISO or YYYY-MM-DD)"),
    idempotency_key: z.string().trim().max(128).optional(),
  }),
  handler: async (input, ctx) => createTask(input, { actor: ctx.actor, actorId: ctx.actorId ?? null, callId: ctx.callId }),
});
