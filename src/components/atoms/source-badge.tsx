import { cn } from "@/lib/utils";
import type { JobSource } from "@/lib/job-constants";
import { PILL, SOURCE_CLASS, SOURCE_LABEL } from "@/lib/ui/job-status";

export type SourceBadgeProps = { source: JobSource; className?: string };

/** Agent (teal) / Office (neutral); nothing for imported jobs. */
export function SourceBadge({ source, className }: SourceBadgeProps) {
  const label = SOURCE_LABEL[source];
  if (!label) return null;
  return <span className={cn(PILL, SOURCE_CLASS[source], className)}>{label}</span>;
}
