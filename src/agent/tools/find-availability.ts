import { z } from "zod";
import { defineTool } from "@/agent/registry";
import { SERVICE_TYPE_IDS, findAvailability, joinSpoken, spokenDay, spokenSlot } from "@/domain/availability";
import { addDays } from "date-fns";

/** "YYYY-MM-DD" (ET day) or ISO-8601 with offset. */
export const dateOrIso = z
  .string()
  .trim()
  .min(10)
  .max(40)
  .refine((v) => /^\d{4}-\d{2}-\d{2}$/.test(v) || !Number.isNaN(Date.parse(v)), "expected YYYY-MM-DD or an ISO-8601 timestamp");

export const findAvailabilityTool = defineTool({
  description:
    "Find open arrival windows for a visit. Pass the earliest day the caller can do as `from` (YYYY-MM-DD in Eastern " +
    "Time, or 'today' as today's date) and the kind of visit as `service_type`; `to` defaults to three more days. Give " +
    "`address_id` so the tech who was last on site is preferred, and `preferred_employee_id` if the caller asked for " +
    "someone by name. Returns up to `limit` (default 4) two-hour arrival windows spread across days, each with the tech's " +
    "name. Offer two of them, then call book_job with the chosen window_start and employee_id.",
  input: z.object({
    from: dateOrIso.describe("Earliest day/time to look from, e.g. '2026-09-03'"),
    to: dateOrIso.optional().describe("Last day to look at (inclusive when YYYY-MM-DD); default from + 3 days"),
    service_type: z.enum(SERVICE_TYPE_IDS).describe("diagnostic | repair | maintenance | install | callback | estimate"),
    priority: z.enum(["normal", "high", "emergency"]).optional(),
    preferred_employee_id: z.string().trim().max(64).optional().describe("Tech the caller asked for, if any"),
    address_id: z.string().trim().max(64).optional().describe("Service address; the tech who was last here is preferred"),
    limit: z.number().int().min(1).max(8).optional().describe("How many windows to return (default 4)"),
  }),
  handler: async (input) => {
    const now = new Date();
    const r = await findAvailability({ ...input, limit: input.limit ?? 4, now });
    const { slots, range, closed_days } = r;

    let speech_hint: string;
    if (slots.length === 0) {
      const lastDay = addDays(new Date(range.to), -1);
      const first = spokenDay(new Date(Math.max(new Date(range.from).getTime(), now.getTime())), now);
      const last = spokenDay(lastDay, now);
      speech_hint =
        first === last
          ? `I don't have anything open ${first}. Want me to check the next few days?`
          : `I don't have any openings between ${first} and ${last}. Want me to look at the following days?`;
    } else if (slots.length === 1) {
      speech_hint = `I have ${spokenSlot(slots[0], now, true)}. Does that work for you?`;
    } else {
      const phrases = slots.map((s, i) => spokenSlot(s, now, i === 0));
      speech_hint = `I have ${joinSpoken(phrases)}. Which works better for you?`;
    }
    return { slots, range, closed_days, speech_hint };
  },
});
