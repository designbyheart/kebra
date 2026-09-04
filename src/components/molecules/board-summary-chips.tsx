"use client";

import { SummaryChip } from "@/components/atoms/summary-chip";
import { shortRange } from "@/lib/ui/board-layout";
import { filterLabel, type BoardFilterKey } from "@/lib/ui/board-filter";
import type { BoardData } from "@/lib/ui/board-types";
import { pluralWord } from "@/lib/ui/format";

export type BoardSummaryChipsProps = {
  summary: BoardData["schedule"]["summary"];
  needsSchedulingTotal: number;
  /** The chip currently narrowing the day, or null for the whole day. */
  filter: BoardFilterKey | null;
  onFilter: (key: BoardFilterKey | null) => void;
};

/** The count chips under the board title: each one filters the day to its own slice. */
export function BoardSummaryChips({ summary: s, needsSchedulingTotal, filter, onFilter }: BoardSummaryChipsProps) {
  const chip = (key: BoardFilterKey) => ({
    onClick: () => onFilter(key),
    active: filter === key,
    title: (filter === key && "Show the whole day") || `Show only ${filterLabel(key)}`,
  });

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <SummaryChip onClick={() => onFilter(null)} active={filter === null} title="Show the whole day">
        {s.total} {pluralWord(s.total, "job")}
      </SummaryChip>
      <SummaryChip {...chip("techs")}>
        {s.techs_working} {pluralWord(s.techs_working, "tech")}
      </SummaryChip>
      {/* The day's span, not a slice of it — nothing to filter to. */}
      {s.first_start && s.last_end && <SummaryChip>{shortRange(s.first_start, s.last_end)}</SummaryChip>}
      {s.in_progress > 0 && (
        <SummaryChip tone="amber" {...chip("in_progress")}>
          {s.in_progress} in progress
        </SummaryChip>
      )}
      {s.unassigned > 0 && (
        <SummaryChip tone="blue" {...chip("unassigned")}>
          {s.unassigned} unassigned
        </SummaryChip>
      )}
      {s.pending_cancellation > 0 && (
        <SummaryChip tone="red" {...chip("pending_cancellation")}>
          {s.pending_cancellation} pending cancellation
        </SummaryChip>
      )}
      {needsSchedulingTotal > 0 && (
        <SummaryChip tone="violet" {...chip("needs_scheduling")}>
          {needsSchedulingTotal} need scheduling
        </SummaryChip>
      )}
      {s.canceled > 0 && (
        <SummaryChip tone="gray" {...chip("canceled")}>
          {s.canceled} canceled
        </SummaryChip>
      )}
      {s.installs > 0 && (
        <SummaryChip {...chip("installs")}>
          {s.installs} {pluralWord(s.installs, "install")}
        </SummaryChip>
      )}
      {s.callbacks > 0 && (
        <SummaryChip {...chip("callbacks")}>
          {s.callbacks} {pluralWord(s.callbacks, "callback")}
        </SummaryChip>
      )}
      <span className="ml-auto hidden text-muted-foreground sm:inline">
        {filter && "esc clears the filter · "}← → days · t today · all times ET
      </span>
    </div>
  );
}
