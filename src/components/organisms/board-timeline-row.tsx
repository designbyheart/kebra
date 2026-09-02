import { cn } from "@/lib/utils";
import { JobCard } from "@/components/molecules/job-card";
import { laneRowStyle, nowLineStyle, positionFor, stackLanes } from "@/lib/ui/board-layout";
import type { Row } from "@/lib/ui/board-rows";
import type { Flash } from "@/lib/ui/board-types";

export type BoardTimelineRowProps = {
  row: Row;
  date: string;
  flash: Record<string, Flash>;
  selectedId: string | null;
  nowLeft: number | null;
  onSelect: (jobId: string) => void;
};

/** One tech (or Unassigned / Canceled) row: label cell plus the positioned cards. */
export function BoardTimelineRow({ row, date, flash, selectedId, nowLeft, onSelect }: BoardTimelineRowProps) {
  const { placed, lanes } = stackLanes(row.jobs);
  const isEmpty = row.jobs.length === 0;
  return (
    <div className={cn("grid grid-cols-[176px_1fr] border-b last:border-b-0", row.muted && "bg-muted/20")}>
      <div className="flex flex-col justify-center border-r px-3 py-1.5">
        <div className={cn("truncate text-sm font-medium", row.muted && "text-muted-foreground")}>{row.title}</div>
        {row.subtitle && <div className="truncate text-xs text-muted-foreground">{row.subtitle}</div>}
      </div>
      <div className="relative" style={laneRowStyle(lanes, isEmpty)}>
        {nowLeft !== null && <span aria-hidden className="absolute inset-y-0 z-[2] w-px bg-red-500/80" style={nowLineStyle(nowLeft)} />}
        {isEmpty && <span className="absolute inset-0 flex items-center px-3 text-sm text-muted-foreground">none</span>}
        {placed.map(({ item, lane }) => (
          <JobCard
            key={item.job_id}
            job={item}
            position={positionFor(item.window_start, item.window_end, date)}
            lane={lane}
            flash={flash[item.job_id]}
            selected={selectedId === item.job_id}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}
