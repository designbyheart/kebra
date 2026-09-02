import { z } from "zod";
import { defineTool } from "@/agent/registry";
import { rescheduleJob } from "@/domain/jobs";

const isoInstant = z
  .string()
  .trim()
  .refine((v) => !Number.isNaN(Date.parse(v)), "expected an ISO-8601 timestamp");

export const rescheduleJobTool = defineTool({
  description:
    "Move an existing scheduled visit to a new window. First find the job (get_job / get_address_dossier), then call " +
    "find_availability for the new day and pass the chosen window_start as new_window_start (and its employee_id if the " +
    "tech changes; otherwise the current tech is kept). Give the caller's reason in one line. Only visits that are " +
    "scheduled or awaiting scheduling can be moved; completed or in-progress visits return `invalid_state`.",
  input: z.object({
    job_id: z.string().trim().min(1).max(64),
    new_window_start: isoInstant.describe("window_start of the new slot"),
    employee_id: z.string().trim().max(64).optional().describe("New tech; default keeps the current one"),
    reason: z.string().trim().min(2).max(500).describe("Why, in the caller's words"),
    idempotency_key: z.string().trim().max(128).optional(),
  }),
  handler: async (input, ctx) => rescheduleJob(input, { actor: ctx.actor, actorId: ctx.actorId ?? null, callId: ctx.callId }),
});
