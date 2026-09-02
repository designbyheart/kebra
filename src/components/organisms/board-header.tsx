import { BoardSummaryChips } from "@/components/molecules/board-summary-chips";
import { DateSwitcher } from "@/components/molecules/date-switcher";
import { LiveStatusButton } from "@/components/molecules/live-status-button";
import type { LiveStatus } from "@/lib/use-live-events";
import { longDateLabel } from "@/lib/ui/board-layout";
import type { BoardData, FetchState } from "@/lib/ui/board-types";

export type BoardHeaderProps = {
  date: string;
  isToday: boolean;
  speechHint: string;
  summary: BoardData["schedule"]["summary"];
  needsSchedulingTotal: number;
  liveStatus: LiveStatus;
  fetchState: FetchState;
  lastUpdate: Date | null;
  onRetry: () => void;
  onChangeDate: (date: string) => void;
};

/** Board title, speech hint, live pill, day switcher and the summary chips. */
export function BoardHeader({ date, isToday, speechHint, summary, needsSchedulingTotal, liveStatus, fetchState, lastUpdate, onRetry, onChangeDate }: BoardHeaderProps) {
  const heading = (isToday && "Today") || longDateLabel(date).split(",")[0];
  return (
    <header className="flex flex-col gap-3 border-b pb-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {heading}
            <span className="ml-2 text-base font-normal text-muted-foreground">{longDateLabel(date)}</span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{speechHint}</p>
        </div>
        <div className="flex items-center gap-3">
          <LiveStatusButton status={liveStatus} fetchState={fetchState} lastUpdate={lastUpdate} onRetry={onRetry} />
          <DateSwitcher date={date} onChange={onChangeDate} />
        </div>
      </div>
      <BoardSummaryChips summary={summary} needsSchedulingTotal={needsSchedulingTotal} />
    </header>
  );
}
