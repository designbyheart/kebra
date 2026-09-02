"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { isoDateET } from "@/lib/time";
import { SERVICE_TYPE_IDS, findAvailability, type Slot } from "@/domain/availability";
import { bookJob, type BookJobResult } from "@/domain/jobs";
import { runAction, toActionError, type ActionResult } from "@/components/jobs/action-result";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

const findSlotsSchema = z.object({
  from: z.string().regex(DATE, "Pick a date"),
  to: z.string().regex(DATE).optional(),
  service_type: z.enum(SERVICE_TYPE_IDS),
  priority: z.enum(["normal", "high", "emergency"]).optional(),
  preferred_employee_id: z.string().min(1).optional(),
  address_id: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(12).optional(),
});

export type FindSlotsInput = z.input<typeof findSlotsSchema>;
export type FindSlotsResult = { slots: Slot[]; range: { from: string; to: string }; closed_days: string[] };

/** Office-side availability lookup for the Book / Reschedule dialogs. */
export async function findSlotsAction(input: FindSlotsInput): Promise<ActionResult<FindSlotsResult>> {
  await requireUser();
  const parsed = findSlotsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "validation", message: parsed.error.issues[0]?.message ?? "Invalid input", details: parsed.error.issues };
  const p = parsed.data;
  // A single-day search from today should still start "now": findAvailability never returns past windows.
  return runAction(() =>
    findAvailability({
      from: p.from,
      to: p.to ?? p.from,
      service_type: p.service_type,
      priority: p.priority,
      preferred_employee_id: p.preferred_employee_id,
      address_id: p.address_id,
      limit: p.limit ?? 8,
    }),
  );
}

const bookSchema = z.object({
  customer_id: z.string().min(1),
  address_id: z.string().min(1),
  service_type: z.enum(SERVICE_TYPE_IDS),
  window_start: z.string().min(1),
  employee_id: z.string().min(1, "Pick an opening"),
  issue_summary: z.string().trim().min(3, "Describe the issue").max(2000),
  priority: z.enum(["normal", "high", "emergency"]).optional(),
  caller_name: z.string().trim().max(120).optional(),
  caller_phone: z.string().trim().max(32).optional(),
  access_notes: z.string().trim().max(1000).optional(),
});

export type BookJobActionInput = z.input<typeof bookSchema>;

/** Books through the same domain function the agent uses, with the office user as actor. */
export async function bookJobAction(input: BookJobActionInput): Promise<ActionResult<BookJobResult>> {
  const user = await requireUser();
  const parsed = bookSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "validation", message: parsed.error.issues[0]?.message ?? "Invalid input", details: parsed.error.issues };
  const p = parsed.data;
  try {
    const result = await bookJob(
      {
        customer_id: p.customer_id,
        address_id: p.address_id,
        service_type: p.service_type,
        window_start: p.window_start,
        employee_id: p.employee_id,
        issue_summary: p.issue_summary,
        priority: p.priority,
        caller_name: p.caller_name || undefined,
        caller_phone: p.caller_phone ? normalizePhone(p.caller_phone) : undefined,
        access_notes: p.access_notes || undefined,
      },
      { actor: "office", actorId: user.id },
    );
    revalidatePath(`/addresses/${p.address_id}`);
    revalidatePath(`/customers/${p.customer_id}`);
    revalidatePath("/jobs");
    revalidatePath("/today");
    revalidatePath(`/today?date=${isoDateET(result.window_start)}`);
    return { ok: true, result };
  } catch (err) {
    return toActionError(err);
  }
}

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return raw;
}
