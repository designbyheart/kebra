import { z } from "zod";
import { defineTool } from "@/agent/registry";
import { rescheduleJob } from "@/domain/jobs";

const isoInstant = z
  .string()
  .trim()
  .refine((v) => !Number.isNaN(Date.parse(v)), "expected an ISO-8601 timestamp");

export const rescheduleJobTool = defineTool({
  description:
    "Move an existing visit to a new time window. First look up the job, then call find_availability (or " +
    "find_reschedule_slots) and pass the exact returned window_start as new_window_start. Only include employee_id " +
    "if you want a different technician; otherwise the current technician is kept. Provide the caller's reason in one " +
    "line. Only visits with status `scheduled` or `needs scheduling` can be moved; other statuses return `invalid_state`.",
  input: z.object({
    job_id: z.string().trim().min(1).max(64),
    new_window_start: isoInstant.describe("window_start of the new slot"),
    employee_id: z.string().trim().max(64).optional().describe("New tech; default keeps the current one"),
    reason: z.string().trim().min(2).max(500).describe("Why, in the caller's words"),
    idempotency_key: z.string().trim().max(128).optional(),
  }),
  handler: async (input, ctx) => rescheduleJob(input, { actor: ctx.actor, actorId: ctx.actorId ?? null, callId: ctx.callId }),
});
