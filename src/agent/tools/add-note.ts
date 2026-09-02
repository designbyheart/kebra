import { z } from "zod";
import { defineTool } from "@/agent/registry";
import { addNote } from "@/domain/notes";

export const addNoteTool = defineTool({
  description:
    "Attach a note for the technician or the office. Pass job_id for a specific visit, or address_id alone to note " +
    "something about the property (it attaches to the most recent visit there, tagged [address note]). Use it for " +
    "gate/door codes, pets, parking, where the unit is, and anything the caller wants the tech to know. Never read " +
    "codes back aloud.",
  input: z
    .object({
      job_id: z.string().trim().max(64).optional(),
      address_id: z.string().trim().max(64).optional(),
      content: z.string().trim().min(2).max(2000),
      idempotency_key: z.string().trim().max(128).optional(),
    })
    .refine((v) => Boolean(v.job_id || v.address_id), { message: "job_id or address_id is required", path: ["job_id"] }),
  handler: async (input, ctx) => addNote(input, { actor: ctx.actor, actorId: ctx.actorId ?? null, callId: ctx.callId }),
});
