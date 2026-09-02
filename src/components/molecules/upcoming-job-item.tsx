import Link from "next/link";
import { PriorityBadge } from "@/components/atoms/priority-badge";
import { SourceBadge } from "@/components/atoms/source-badge";
import { StatusBadge } from "@/components/atoms/status-badge";
import { techSuffix, type UpcomingItem } from "@/lib/ui/customer-view";
import { fmtWindow, relativeDay } from "@/lib/ui/format";

export type UpcomingJobItemProps = {
  item: UpcomingItem;
  now: Date;
  /** Show the service address under the row (customer page). */
  showAddress?: boolean;
};

/** One upcoming visit: window, badges, description and techs. */
export function UpcomingJobItem({ item: u, now, showAddress }: UpcomingJobItemProps) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2 first:pt-0 last:pb-0">
      <Link href={`/jobs/${u.job_id}`} className="text-sm font-medium tabular-nums hover:underline">
        {fmtWindow(u.window_start, u.window_end)}
      </Link>
      <span className="text-xs text-muted-foreground">{relativeDay(u.window_start, now)}</span>
      <StatusBadge status={u.work_status} />
      {u.priority && <PriorityBadge priority={u.priority} />}
      {u.source && <SourceBadge source={u.source} />}
      <span className="basis-full text-sm text-muted-foreground sm:basis-auto">
        {u.description ?? "Visit"}
        {techSuffix(u.tech_names)}
      </span>
      {showAddress && u.address_label && (
        <Link href={`/addresses/${u.address_id}`} className="basis-full text-sm text-muted-foreground hover:underline">
          {u.address_label}
        </Link>
      )}
    </li>
  );
}
