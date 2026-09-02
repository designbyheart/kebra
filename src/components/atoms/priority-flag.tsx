import { Flag } from "lucide-react";
import { cn } from "@/lib/utils";
import { PRIORITY_STYLE } from "@/lib/ui/board-status";
import type { JobPriority } from "@/lib/ui/board-types";

export type PriorityFlagProps = {
  priority: JobPriority;
  /** Show the label next to the flag (job sheet header). */
  withLabel?: boolean;
  className?: string;
};

/** Flag icon tinted by priority on the Today board; nothing for normal priority. */
export function PriorityFlag({ priority, withLabel = false, className }: PriorityFlagProps) {
  const pr = PRIORITY_STYLE[priority];
  if (!pr.show) return null;
  if (withLabel) {
    return (
      <span className={cn("inline-flex items-center gap-1 font-medium", pr.text, className)}>
        <Flag className="size-3" fill="currentColor" /> {pr.label}
      </span>
    );
  }
  return <Flag className={cn("size-3 shrink-0", pr.text, className)} aria-label={pr.label} fill="currentColor" />;
}
