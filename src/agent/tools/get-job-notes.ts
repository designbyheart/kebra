import { z } from "zod";
import { defineTool } from "@/agent/registry";
import { ToolError } from "@/agent/errors";
import { firstSentence, getJobNotes, numberWord, pickTechNote } from "@/domain/history";

export const getJobNotesTool = defineTool({
  description:
    "Every note on one job in order, redacted (door codes, phones and emails appear as [code], [phone], [email]). " +
    "Use it for follow-ups like 'what exactly did the tech write?' after get_address_dossier or get_visit_history " +
    "gave you the job_id. Read short excerpts, never the whole list.",
  input: z.object({ job_id: z.string().trim().min(1).max(64) }),
  handler: async (input) => {
    const r = await getJobNotes(input.job_id);
    if (!r) throw new ToolError("not_found", `job ${input.job_id} not found`, "I couldn't find that job.");
    const tech = pickTechNote(r.notes.map((n) => ({ authorType: n.author_type, content: n.content_redacted, seq: n.seq })));
    const label = `Job ${r.invoice_number ?? r.job_id}`;
    const speech_hint =
      r.notes.length === 0
        ? `${label} has no notes on it.`
        : tech
          ? `${label} has ${numberWord(r.notes.length)} note${r.notes.length === 1 ? "" : "s"}; the tech wrote: ${firstSentence(tech.content, 160)}`
          : `${label} has ${numberWord(r.notes.length)} office note${r.notes.length === 1 ? "" : "s"} and nothing from the tech yet.`;
    return { ...r, speech_hint };
  },
});
