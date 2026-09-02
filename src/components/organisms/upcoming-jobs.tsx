import { UpcomingJobItem } from "@/components/molecules/upcoming-job-item";
import type { UpcomingItem } from "@/lib/ui/customer-view";

export type UpcomingJobsProps = { items: UpcomingItem[]; now: Date; showAddress?: boolean; emptyText?: string };

/** Compact list of upcoming visits; used on the customer and address pages. */
export function UpcomingJobs({ items, now, showAddress, emptyText = "Nothing scheduled." }: UpcomingJobsProps) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">{emptyText}</p>;
  return (
    <ul className="divide-y">
      {items.map((u) => (
        <UpcomingJobItem key={u.job_id} item={u} now={now} showAddress={showAddress} />
      ))}
    </ul>
  );
}
