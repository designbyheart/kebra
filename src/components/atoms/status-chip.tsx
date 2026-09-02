import { cn } from "@/lib/utils";
import { statusStyle } from "@/lib/ui/board-status";
import type { WorkStatus } from "@/lib/ui/board-types";

export type StatusChipProps = { status: WorkStatus; className?: string };

/** Board status chip with a colour dot (job sheet header). */
export function StatusChip({ status, className }: StatusChipProps) {
  const st = statusStyle(status);
  return (
    <span className={cn("inline-flex h-5 items-center gap-1 rounded-full px-2 font-medium", st.chip, st.stripes, className)}>
      <span className={cn("size-1.5 rounded-full", st.dot)} aria-hidden />
      {st.label}
    </span>
  );
}
