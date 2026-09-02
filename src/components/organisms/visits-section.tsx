import { VisitTimeline, type VisitTimelineProps } from "@/components/organisms/visit-timeline";

export type VisitsSectionProps = VisitTimelineProps;

/** "Visits" heading plus the timeline on the address page. */
export function VisitsSection({ entries, now, highlightJobId }: VisitsSectionProps) {
  return (
    <section>
      <div className="mb-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Visits <span className="font-normal normal-case">· {entries.length} jobs, newest first · click a row for notes and invoice lines</span>
      </div>
      <VisitTimeline entries={entries} now={now} highlightJobId={highlightJobId} />
    </section>
  );
}
