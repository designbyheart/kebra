/**
 * Authorization + validation shell around the W1-B domain functions. Server
 * actions (`src/app/inbox/actions.ts`) and tests call this with an explicit
 * user so the 403 path is testable without a cookie jar.
 */
import { z } from "zod";
import { ToolError } from "@/agent/errors";
import { approveCancellation, rejectCancellation, type ResolveResult } from "@/domain/change-requests";
import { isAdmin, type CurrentUser } from "@/lib/auth";

export const resolveInputSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve"), changeRequestId: z.string().trim().min(1).max(64) }),
  z.object({
    action: z.literal("reject"),
    changeRequestId: z.string().trim().min(1).max(64),
    note: z.string().trim().min(3, "A note for the callback is required").max(1000),
  }),
]);
export type ResolveInput = z.input<typeof resolveInputSchema>;

export type ResolveOutcome =
  | { ok: true; status: 200; result: ResolveResult & { callback_task_id?: string } }
  | { ok: false; status: 400 | 401 | 403 | 404 | 409 | 422 | 500; error: string };

/** Who may approve or reject: owner / admin only (PLAN §3 D12). */
export function canResolveCancellations(user: Pick<CurrentUser, "role"> | null | undefined): boolean {
  return isAdmin(user);
}

export async function resolveCancellationAs(user: CurrentUser | null | undefined, input: ResolveInput): Promise<ResolveOutcome> {
  if (!user) return { ok: false, status: 401, error: "Sign in to continue." };
  if (!canResolveCancellations(user)) {
    return { ok: false, status: 403, error: "Only an admin or the owner can approve or reject cancellations." };
  }
  const parsed = resolveInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, status: 400, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  }
  try {
    const result =
      parsed.data.action === "approve"
        ? await approveCancellation(parsed.data.changeRequestId, user.id)
        : await rejectCancellation(parsed.data.changeRequestId, user.id, parsed.data.note);
    return { ok: true, status: 200, result };
  } catch (e) {
    if (e instanceof ToolError) {
      const status = e.status === 404 ? 404 : e.status === 409 ? 409 : e.status === 422 ? 422 : 400;
      return { ok: false, status, error: e.speechHint || e.message };
    }
    return { ok: false, status: 500, error: e instanceof Error ? e.message : "Something went wrong." };
  }
}
