import type { TimelineEntry } from "@/app/addresses/queries";
import { VisitEntry } from "@/components/molecules/visit-entry";

export type VisitTimelineProps = { entries: TimelineEntry[]; now: Date; highlightJobId?: string | null };

/**
 * Every job at the address, newest first. One line per visit; <details>
 * expands to the full notes (codes masked) and invoice lines.
 */
export function VisitTimeline({ entries, now, highlightJobId }: VisitTimelineProps) {
  if (entries.length === 0) return <p className="text-sm text-muted-foreground">No jobs at this address yet.</p>;
  return (
    <ol className="relative space-y-1 border-l border-border/70 pl-4">
      {entries.map((e) => (
        <VisitEntry key={e.job.id} entry={e} now={now} highlighted={highlightJobId === e.job.id} />
      ))}
    </ol>
  );
}
