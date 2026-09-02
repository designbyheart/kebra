import { z } from "zod";
import { defineTool } from "@/agent/registry";
import { SERVICE_TYPE_IDS } from "@/domain/availability";
import { bookJob } from "@/domain/jobs";

export const e164 = z.string().trim().regex(/^\+[1-9]\d{6,14}$/, "E.164 phone, e.g. +13055551234");
const isoInstant = z
  .string()
  .trim()
  .refine((v) => !Number.isNaN(Date.parse(v)), "expected an ISO-8601 timestamp");

export const bookJobTool = defineTool({
  description:
    "Book a visit into a window returned by find_availability. Pass the exact window_start and employee_id from the " +
    "chosen slot, the customer_id and address_id already confirmed, the service_type, and a one-line issue_summary in " +
    "the caller's words. Add caller_name / caller_phone (E.164) when you have them and any gate or door details as " +
    "access_notes (they are stored, never read back). Re-checks the slot: on `slot_taken`, call find_availability again. " +
    "Read the confirmation_line back to the caller.",
  input: z.object({
    customer_id: z.string().trim().min(1).max(64),
    address_id: z.string().trim().min(1).max(64),
    service_type: z.enum(SERVICE_TYPE_IDS),
    window_start: isoInstant.describe("window_start from the chosen slot"),
    employee_id: z.string().trim().min(1).max(64).describe("employee_id from the chosen slot"),
    issue_summary: z.string().trim().min(3).max(1000).describe("What's wrong, in the caller's words"),
    priority: z.enum(["normal", "high", "emergency"]).optional(),
    caller_name: z.string().trim().max(120).optional(),
    caller_phone: e164.optional(),
    access_notes: z.string().trim().max(1000).optional().describe("Gate/door codes, parking, pets — stored on the job, never spoken"),
    idempotency_key: z.string().trim().max(128).optional().describe("The tool-call id; repeats return the same booking"),
  }),
  handler: async (input, ctx) => bookJob(input, { actor: ctx.actor, actorId: ctx.actorId ?? null, callId: ctx.callId }),
});
