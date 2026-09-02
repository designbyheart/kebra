import { z } from "zod";
import { defineTool } from "@/agent/registry";
import { requestCancellation } from "@/domain/change-requests";

export const requestCancellationTool = defineTool({
  description:
    "Ask the office to cancel a visit. You cannot cancel outright: this marks the job pending cancellation, opens an " +
    "inbox task for the admins, and they confirm or call the customer back. Pass the job_id and the caller's reason. " +
    "Tell the caller the office will confirm; do not promise the cancellation is final.",
  input: z.object({
    job_id: z.string().trim().min(1).max(64),
    reason: z.string().trim().min(2).max(500).describe("Why the caller wants to cancel"),
    idempotency_key: z.string().trim().max(128).optional(),
  }),
  handler: async (input, ctx) =>
    requestCancellation(input, { actor: ctx.actor, actorId: ctx.actorId ?? null, callId: ctx.callId }),
});
