/**
 * Option shapes and small pure helpers shared by the job dialogs (reschedule,
 * cancel) and the job actions bar. No React.
 */
import type { Slot } from "@/domain/availability";

export type ServiceTypeOption = { id: string; name: string; durationMinutes: number };
export type TechOption = { id: string; name: string };

/** Why the availability search proposed a given tech for a slot. */
export const SLOT_REASON_LABEL: Record<Slot["reason"], string> = {
  last_tech_here: "last tech here",
  least_loaded: "least loaded",
  only_available: "only one free",
};

/** Stable identity for a slot row (same window, same tech). */
export function slotKey(s: Pick<Slot, "window_start" | "employee_id">): string {
  return `${s.window_start}|${s.employee_id}`;
}

/** Preselect the job's current service type when it is still offered; otherwise the diagnostic default. */
export function initialServiceType(current: string | null, options: readonly { id: string }[]): string {
  if (current && options.some((s) => s.id === current)) return current;
  return "diagnostic";
}

/** Footer button of the reschedule dialog. */
export function rescheduleConfirmLabel(saving: boolean, picked: Pick<Slot, "window_label"> | null): string {
  if (saving) return "Moving…";
  if (picked) return `Move to ${picked.window_label}`;
  return "Pick an opening";
}
