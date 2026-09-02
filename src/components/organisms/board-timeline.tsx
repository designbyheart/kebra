"use client";

import { useMemo } from "react";
import type { TechDay } from "@/domain/schedule";
import { gridBackgroundStyle, hourTicks, hourTickStyle, nowLineStyle, nowPct, shortRange } from "@/lib/ui/board-layout";
import { buildRows } from "@/lib/ui/board-rows";
import type { BoardJob, BoardTech, Flash, UnscheduledJob } from "@/lib/ui/board-types";
import { BoardTimelineRow } from "./board-timeline-row";
import { NeedsSchedulingLane } from "./needs-scheduling-lane";

const TICKS = hourTicks();

export type BoardTimelineProps = {
  date: string;
  /** Live jobs from getSchedule plus canceled jobs on the day. */
  jobs: BoardJob[];
  techs: TechDay[];
  allTechs: BoardTech[];
  needsScheduling: { jobs: UnscheduledJob[]; total: number };
  flash: Record<string, Flash>;
  selectedId: string | null;
  now: Date;
  onSelect: (jobId: string) => void;
};

/** The 7 AM – 9 PM grid, one row per tech, plus the "Needs scheduling" lane. */
export function BoardTimeline({ date, jobs, techs, allTechs, needsScheduling, flash, selectedId, now, onSelect }: BoardTimelineProps) {
  const rows = useMemo(() => buildRows(jobs, techs, allTechs), [jobs, techs, allTechs]);
  const nowLeft = nowPct(now, date);
  const hasAny = jobs.length > 0;

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-lg border bg-card">
        <div className="min-w-[960px]">
          {/* Hour header */}
          <div className="grid grid-cols-[176px_1fr] border-b bg-muted/40 text-xs text-muted-foreground">
            <div className="px-3 py-1.5 font-medium">Tech</div>
            <div className="relative h-7">
              {TICKS.map((t) => (
                <span key={t.hour} className="absolute top-1.5 border-l border-border pl-1 font-mono tabular-nums" style={hourTickStyle(t.leftPct)}>
                  {t.label}
                </span>
              ))}
              {nowLeft !== null && (
                <span className="absolute top-0 z-10 -translate-x-1/2 rounded-b bg-red-500 px-1 font-mono text-xs font-medium tabular-nums text-white" style={nowLineStyle(nowLeft)}>
                  {shortRange(now, null)}
                </span>
              )}
            </div>
          </div>

          {!hasAny && (
            <div className="grid grid-cols-[176px_1fr]">
              <div className="px-3 py-6 text-sm text-muted-foreground">No techs working</div>
              <div className="relative flex items-center px-4 py-6 text-sm text-muted-foreground" style={gridBackgroundStyle()}>
                Nothing on the board for this day.
              </div>
            </div>
          )}

          {rows.map((row) => (
            <BoardTimelineRow key={row.key} row={row} date={date} flash={flash} selectedId={selectedId} nowLeft={nowLeft} onSelect={onSelect} />
          ))}
        </div>
      </div>

      <NeedsSchedulingLane needsScheduling={needsScheduling} flash={flash} selectedId={selectedId} onSelect={onSelect} />
    </div>
  );
}
