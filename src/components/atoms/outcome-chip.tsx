import { cn } from "@/lib/utils";
import { outcomeTone } from "@/lib/ui/call-derive";

export type OutcomeChipProps = { outcome: string | null | undefined; label: string; className?: string };

/** Call outcome pill (Booked, Rescheduled, Handoff, …) tinted by outcome. */
export function OutcomeChip({ outcome, label, className }: OutcomeChipProps) {
  return <span className={cn("inline-flex h-5 items-center rounded-full px-2 text-xs font-medium ring-1 ring-inset", outcomeTone(outcome), className)}>{label}</span>;
}
