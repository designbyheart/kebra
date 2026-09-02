import Link from "next/link";
import { filtersToQuery, type JobFilters } from "@/lib/ui/job-filter-params";

export type DateRangeToggleProps = { filters: JobFilters };

/** "All dates" while a range is set; "Next 2 weeks" (the default range) otherwise. */
export function DateRangeToggle({ filters }: DateRangeToggleProps) {
  if (filters.from || filters.to) {
    return (
      <Link href={`/jobs${filtersToQuery(filters, { from: null, to: null, dates: "all" })}`} className="text-sm text-muted-foreground underline-offset-2 hover:underline">
        All dates
      </Link>
    );
  }
  return (
    <Link href={`/jobs${filtersToQuery(filters, { dates: null })}`} className="text-sm text-muted-foreground underline-offset-2 hover:underline">
      Next 2 weeks
    </Link>
  );
}
