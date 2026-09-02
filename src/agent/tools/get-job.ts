import { z } from "zod";
import { defineTool } from "@/agent/registry";
import { ToolError } from "@/agent/errors";
import { speakStreet } from "@/agent/tools/find-address";
import { dollars, firstName, getJob, joinSpoken, spokenDate, spokenDay, spokenTime, type JobDetail } from "@/domain/history";

const STATUS_WORDS: Record<JobDetail["work_status"], string> = {
  scheduled: "scheduled",
  "in progress": "in progress right now",
  "complete rated": "complete",
  "complete unrated": "complete",
  "needs scheduling": "waiting to be scheduled",
  "user canceled": "canceled by the customer",
  "pro canceled": "canceled on our side",
  pending_cancellation: "pending cancellation",
};

export function jobSpeech(j: JobDetail, now: Date = new Date()): string {
  const label = `Job ${j.invoice_number ?? j.job_id}`;
  const where = j.address_label ? ` at ${speakStreet(j.address_label.split(",")[0])}` : "";
  const techs = j.tech.map((t) => firstName(t.name)).filter(Boolean);
  const who = techs.length ? joinSpoken(techs.slice(0, 3)) : null;
  const status = STATUS_WORDS[j.work_status] ?? j.work_status;
  let when = "";
  if (j.work_status === "scheduled" && j.window_start) {
    when = ` for ${spokenDay(j.window_start, now)}, ${spokenTime(j.window_start)}${j.window_end ? ` to ${spokenTime(j.window_end)}` : ""}`;
  } else if (j.visit_date && /complete|canceled/.test(j.work_status)) {
    when = ` on ${spokenDate(j.visit_date, { now })}`;
  }
  const bits = [`${label}${where} is ${status}${when}`];
  if (who) bits.push(j.work_status === "scheduled" ? `${who} ${techs.length > 1 ? "are" : "is"} assigned` : `${who} ${techs.length > 1 ? "were" : "was"} on it`);
  if (j.outstanding_cents > 0) bits.push(`there's ${dollars(j.outstanding_cents)} still open on it`);
  return `${bits.join("; ")}.`;
}

export const getJobTool = defineTool({
  description:
    "Look up one job by job_id or by the 4-digit invoice number staff and customers quote ('job fifty-five oh one'). " +
    "Returns status, arrival window, assigned techs, customer, address, totals, tags and the last tech note in one line. " +
    "Use it before rescheduling or canceling, or when a caller references a job number.",
  input: z
    .object({
      job_id: z.string().trim().min(1).max(64).optional(),
      invoice_number: z.string().trim().min(1).max(16).optional().describe("e.g. '5501'"),
    })
    .refine((v) => v.job_id || v.invoice_number, { message: "job_id or invoice_number is required" }),
  handler: async (input) => {
    const now = new Date();
    const j = await getJob({ jobId: input.job_id, invoiceNumber: input.invoice_number }, now);
    if (!j) {
      throw new ToolError(
        "not_found",
        `job ${input.job_id ?? input.invoice_number} not found`,
        input.invoice_number ? `I don't have a job number ${input.invoice_number}. Could you double-check the number?` : "I couldn't find that job.",
      );
    }
    return { ...j, speech_hint: jobSpeech(j, now) };
  },
});
