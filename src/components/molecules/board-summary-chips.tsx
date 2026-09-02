import { SummaryChip } from "@/components/atoms/summary-chip";
import { shortRange } from "@/lib/ui/board-layout";
import type { BoardData } from "@/lib/ui/board-types";
import { pluralWord } from "@/lib/ui/format";

export type BoardSummaryChipsProps = {
  summary: BoardData["schedule"]["summary"];
  needsSchedulingTotal: number;
};

/** The count chips under the board title, plus the keyboard hint on the right. */
export function BoardSummaryChips({ summary: s, needsSchedulingTotal }: BoardSummaryChipsProps) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <SummaryChip>
        {s.total} {pluralWord(s.total, "job")}
      </SummaryChip>
      <SummaryChip>
        {s.techs_working} {pluralWord(s.techs_working, "tech")}
      </SummaryChip>
      {s.first_start && s.last_end && <SummaryChip>{shortRange(s.first_start, s.last_end)}</SummaryChip>}
      {s.in_progress > 0 && <SummaryChip tone="amber">{s.in_progress} in progress</SummaryChip>}
      {s.unassigned > 0 && <SummaryChip tone="blue">{s.unassigned} unassigned</SummaryChip>}
      {s.pending_cancellation > 0 && <SummaryChip tone="red">{s.pending_cancellation} pending cancellation</SummaryChip>}
      {needsSchedulingTotal > 0 && <SummaryChip tone="violet">{needsSchedulingTotal} need scheduling</SummaryChip>}
      {s.canceled > 0 && <SummaryChip tone="gray">{s.canceled} canceled</SummaryChip>}
      {s.installs > 0 && (
        <SummaryChip>
          {s.installs} {pluralWord(s.installs, "install")}
        </SummaryChip>
      )}
      {s.callbacks > 0 && (
        <SummaryChip>
          {s.callbacks} {pluralWord(s.callbacks, "callback")}
        </SummaryChip>
      )}
      <span className="ml-auto hidden text-muted-foreground sm:inline">← → days · t today · all times ET</span>
    </div>
  );
}
