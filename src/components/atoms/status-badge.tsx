import { cn } from "@/lib/utils";
import type { WorkStatus } from "@/lib/job-constants";
import { NEUTRAL_PILL, PILL, STATUS_CLASS, STATUS_LABEL } from "@/lib/ui/job-status";

export type StatusBadgeProps = { status: WorkStatus; className?: string };

/** Work-status pill. */
export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <span className={cn(PILL, STATUS_CLASS[status] ?? NEUTRAL_PILL, className)} title={status}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}
