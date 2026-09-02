import Link from "next/link";
import { PriorityBadge, SourceBadge, StatusBadge } from "@/components/jobs/status-badge";
import { fmtWindow, relativeDay } from "@/components/jobs/format";
import type { WorkStatus } from "@/lib/job-constants";

export type UpcomingItem = {
  job_id: string;
  invoice_number: string | null;
  description: string | null;
  work_status: WorkStatus;
  priority?: "normal" | "high" | "emergency";
  source?: "import" | "agent" | "office";
  window_start: string | null;
  window_end: string | null;
  tech_names: string[];
  address_id?: string | null;
  address_label?: string | null;
};

/** Compact list of upcoming visits; used on the customer and address pages. */
export function UpcomingJobs({ items, now, showAddress, emptyText = "Nothing scheduled." }: { items: UpcomingItem[]; now: Date; showAddress?: boolean; emptyText?: string }) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">{emptyText}</p>;
  return (
    <ul className="divide-y">
      {items.map((u) => (
        <li key={u.job_id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2 first:pt-0 last:pb-0">
          <Link href={`/jobs/${u.job_id}`} className="text-sm font-medium tabular-nums hover:underline">
            {fmtWindow(u.window_start, u.window_end)}
          </Link>
          <span className="text-xs text-muted-foreground">{relativeDay(u.window_start, now)}</span>
          <StatusBadge status={u.work_status} />
          {u.priority ? <PriorityBadge priority={u.priority} /> : null}
          {u.source ? <SourceBadge source={u.source} /> : null}
          <span className="basis-full text-sm text-muted-foreground sm:basis-auto">
            {u.description ?? "Visit"}
            {u.tech_names.length ? ` · ${u.tech_names.join(", ")}` : " · unassigned"}
          </span>
          {showAddress && u.address_label ? (
            <Link href={`/addresses/${u.address_id}`} className="basis-full text-xs text-muted-foreground hover:underline">
              {u.address_label}
            </Link>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
