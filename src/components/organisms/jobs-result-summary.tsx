import { jobRangeText, sortOrderLabel, type JobFilters } from "@/lib/ui/job-filter-params";

export type JobsResultSummaryProps = {
  /** Rows actually rendered (already capped by the query). */
  shown: number;
  total: number;
  limit: number;
  filters: JobFilters;
  direction: "asc" | "desc";
};

/** "Showing 40 of 120 · 2026-09-02 → 2026-09-16 · soonest first" */
export function JobsResultSummary({ shown, total, limit, filters, direction }: JobsResultSummaryProps) {
  return (
    <div className="flex items-center justify-between text-xs text-muted-foreground">
      <span>
        Showing {Math.min(shown, limit)} of {total} · {jobRangeText(filters)} · {sortOrderLabel(direction)}
      </span>
      {total > limit && <span>Narrow the filters to see the rest.</span>}
    </div>
  );
}
