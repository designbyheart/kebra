import { z } from "zod";
import { defineTool } from "@/agent/registry";
import { ToolError } from "@/agent/errors";
import { speakStreet } from "@/agent/tools/find-address";
import { firstName, getVisitHistory, joinSpoken, numberWord, spokenDate, type Visit } from "@/domain/history";

export function visitHistorySpeech(visits: Visit[], where: string | null, now: Date = new Date()): string {
  const place = where ? ` at ${where}` : "";
  if (visits.length === 0) return `I don't see any completed visits${place} on file.`;
  const v = visits[0];
  const names = v.tech_names.map(firstName).filter(Boolean);
  const who = names.length ? joinSpoken(names.slice(0, 2)) : "the tech";
  const when = v.date ? spokenDate(v.date, { now }) : "an unknown date";
  const count = visits.length === 1 ? "one visit" : `${numberWord(visits.length)} visits`;
  const note = v.one_line && v.one_line !== "Service visit" ? `${who} noted "${v.one_line[0].toLowerCase()}${v.one_line.slice(1)}"` : `${who} was out`;
  return `I see ${count}${place}; the most recent was ${when}, when ${note}.`;
}

export const getVisitHistoryTool = defineTool({
  description:
    "Recent completed visits for an address or a customer, newest first, each with the date, techs, a one-line " +
    "summary of what the tech wrote, totals and tags. Use it when the caller asks about past visits beyond the last " +
    "one, or to page further back with `before`. Pass address_id when you have it; customer_id covers all their sites.",
  input: z
    .object({
      address_id: z.string().trim().min(1).max(64).optional(),
      customer_id: z.string().trim().min(1).max(64).optional(),
      limit: z.number().int().min(1).max(25).optional().describe("default 5"),
      before: z.string().datetime({ offset: true }).optional().describe("only visits before this ISO instant"),
    })
    .refine((v) => v.address_id || v.customer_id, { message: "address_id or customer_id is required" }),
  handler: async (input) => {
    const r = await getVisitHistory({
      addressId: input.address_id,
      customerId: input.customer_id,
      limit: input.limit ?? 5,
      before: input.before,
    });
    if (input.address_id && !r.address_label && r.visits.length === 0) {
      throw new ToolError("not_found", `address ${input.address_id} not found`, "I couldn't find that address on file.");
    }
    if (input.customer_id && !input.address_id && !r.customer_name && r.visits.length === 0) {
      throw new ToolError("not_found", `customer ${input.customer_id} not found`, "I couldn't find that customer on file.");
    }
    const where = r.address_label ? speakStreet(r.address_label.split(",")[0]) : r.customer_name ? `for ${r.customer_name}` : null;
    return {
      visits: r.visits,
      address_label: r.address_label,
      customer_name: r.customer_name,
      speech_hint: visitHistorySpeech(r.visits, where),
    };
  },
});
