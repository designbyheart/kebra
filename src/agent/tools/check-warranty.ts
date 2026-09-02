import { z } from "zod";
import { defineTool } from "@/agent/registry";
import { ToolError } from "@/agent/errors";
import { checkWarranty, warrantySpeech } from "@/domain/warranty";

export const checkWarrantyTool = defineTool({
  description:
    "Whether work at a confirmed address is likely under warranty: our one-year labor warranty (from an install we did " +
    "or a '1 Yr Labor Warranty' tag) and the manufacturer parts warranty (5 years unregistered, 10 registered), with the " +
    "evidence behind it. State the basis and never promise coverage; when needs_office_confirmation is true, say the " +
    "office will confirm before quoting. Optional equipment_hint ('the upstairs air handler') is echoed for the office.",
  input: z.object({
    address_id: z.string().trim().min(1).max(64),
    equipment_hint: z.string().trim().max(120).optional(),
  }),
  handler: async (input) => {
    const now = new Date();
    const w = await checkWarranty(input.address_id, now);
    if (!w) throw new ToolError("not_found", `address ${input.address_id} not found`, "I couldn't find that address on file.");
    const hinted = input.equipment_hint
      ? w.equipment.filter((e) => new RegExp(input.equipment_hint!.split(/\s+/).filter((t) => t.length > 2).join("|"), "i").test(`${e.brand ?? ""} ${e.kind} ${e.line}`))
      : [];
    return {
      ...w,
      equipment_hint: input.equipment_hint ?? null,
      speech_hint: warrantySpeech(w, hinted.length ? hinted : w.equipment, now),
    };
  },
});
