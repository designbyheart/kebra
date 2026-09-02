import { cn } from "@/lib/utils";
import type { JobPriority } from "@/lib/job-constants";
import { PILL, PRIORITY_CLASS, PRIORITY_LABEL } from "@/lib/ui/job-status";

export type PriorityBadgeProps = { priority: JobPriority; className?: string };

/** High priority / Emergency pill; renders nothing for normal priority. */
export function PriorityBadge({ priority, className }: PriorityBadgeProps) {
  const label = PRIORITY_LABEL[priority];
  if (!label) return null;
  return <span className={cn(PILL, PRIORITY_CLASS[priority], className)}>{label}</span>;
}
