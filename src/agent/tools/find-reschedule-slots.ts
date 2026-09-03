import { z } from "zod";
import { addDays } from "date-fns";
import { defineTool } from "@/agent/registry";
import { ToolError } from "@/agent/errors";
import { db } from "@/db";
import { loadJobDetail, primaryTech, windowLabelOf } from "@/domain/jobs";
import { findAvailability, joinSpoken, spokenDay, spokenSlot } from "@/domain/availability";
import { dateOrIso } from "./find-availability";

export const findRescheduleSlotsTool = defineTool({
  description:
    "Find open arrival windows for rescheduling an existing visit. Pass the job_id and the earliest day the caller can do as `from`. " +
    "Returns up to `limit` (default 4) two-hour windows using the job's service type and current tech. Offer two, then call " +
    "reschedule_job with the chosen window_start (and employee_id only if changing tech).",
  input: z.object({
    job_id: z.string().trim().min(1).max(64),
    from: dateOrIso.describe("Earliest day/time to look from, e.g. '2026-09-03'"),
    to: dateOrIso.optional().describe("Last day to look at (inclusive when YYYY-MM-DD); default from + 3 days"),
    limit: z.number().int().min(1).max(8).optional().describe("How many windows to return (default 4)"),
  }),
  handler: async (input) => {
    const now = new Date();
    const job = await loadJobDetail(db, input.job_id);
    if (!job) {
      throw new ToolError(
        "not_found",
        `job ${input.job_id} not found`,
        "I can't find that visit. Could you give me the address again?",
      );
    }
    if (!job.serviceType) {
      throw new ToolError(
        "validation",
        `job ${job.id} has no service type`,
        "That visit doesn't have a service type on file, so I can't look for a window. Let me get the office to check it.",
      );
    }
    const currentTech = primaryTech(job);
    const { slots, range, closed_days } = await findAvailability(
      {
        from: input.from,
        to: input.to,
        service_type: job.serviceType,
        address_id: job.addressId ?? undefined,
        preferred_employee_id: currentTech?.id,
        limit: input.limit ?? 4,
        now,
      },
      db,
    );

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

    return {
      job_id: job.id,
      job_summary: {
        status: job.workStatus,
        old_window_label: windowLabelOf(job),
        service_type: job.serviceType,
        current_tech_name: currentTech?.name ?? null,
      },
      slots,
      closed_days,
      speech_hint,
    };
  },
});
