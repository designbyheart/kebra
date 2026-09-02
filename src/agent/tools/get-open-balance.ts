import { z } from "zod";
import { defineTool } from "@/agent/registry";
import { ToolError } from "@/agent/errors";
import { dollars, getOpenBalance, numberWord, spokenDate, type OpenBalance } from "@/domain/history";

export function openBalanceSpeech(b: OpenBalance, now: Date = new Date()): string {
  if (b.total_cents <= 0 || b.invoices.length === 0) return `${b.customer_name} has no open balance with us.`;
  const oldest = b.invoices[0];
  const since = oldest.service_date ? ` going back to ${spokenDate(oldest.service_date, { now })}` : "";
  if (b.invoices.length === 1) {
    return `${b.customer_name} has an open balance of ${dollars(b.total_cents)} on job ${oldest.invoice_number ?? oldest.job_id}${since}.`;
  }
  return `${b.customer_name} has an open balance of ${dollars(b.total_cents)} across ${numberWord(b.invoices.length)} jobs${since}.`;
}

export const getOpenBalanceTool = defineTool({
  description:
    "Open balance for a customer across all their jobs, with the per-job amounts and service dates. Use it when a " +
    "caller asks what they owe or before booking for an account with a large balance. Never negotiate or dispute " +
    "amounts; billing questions go to the office.",
  input: z.object({ customer_id: z.string().trim().min(1).max(64) }),
  handler: async (input) => {
    const b = await getOpenBalance(input.customer_id);
    if (!b) throw new ToolError("not_found", `customer ${input.customer_id} not found`, "I couldn't find that customer on file.");
    return { ...b, speech_hint: openBalanceSpeech(b) };
  },
});
