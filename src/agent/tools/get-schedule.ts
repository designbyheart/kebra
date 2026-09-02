import { z } from "zod";
import { defineTool } from "@/agent/registry";
import { ToolError } from "@/agent/errors";
import { getSchedule } from "@/domain/schedule";

export const getScheduleTool = defineTool({
  description:
    "The board for one Eastern-Time day: every non-canceled job with its arrival window, status, customer, address " +
    "and techs, plus per-tech load and free gaps and an owner-style one-sentence summary. Use it for 'what does my " +
    "day look like' or 'is Tanya free at two' (pass employee_id to focus on one tech). Not for offering slots to a " +
    "customer; use find_availability for that.",
  input: z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD").describe("calendar day in Eastern Time, e.g. 2026-09-02"),
    employee_id: z.string().trim().min(1).max(64).optional(),
  }),
  handler: async (input) => {
    const s = await getSchedule(input.date, input.employee_id ?? null);
    if (!s) {
      throw new ToolError("validation", `invalid date ${input.date}`, "I need the date as a calendar day, like September second.", { date: input.date });
    }
    return s;
  },
});
