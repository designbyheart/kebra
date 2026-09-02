import Link from "next/link";
import type { CustomerDetail } from "@/app/customers/queries";
import { fmtDateTime } from "@/lib/ui/format";

export type RecentCallItemProps = { call: CustomerDetail["calls"][number] };

/** One matched call on the customer page: when, direction/status/outcome, summary. */
export function RecentCallItem({ call }: RecentCallItemProps) {
  return (
    <li className="py-2 first:pt-0 last:pb-0">
      <Link href={`/calls/${call.id}`} className="flex flex-wrap items-baseline gap-x-2 text-sm hover:underline">
        <span className="font-medium">{fmtDateTime(call.startedAt)}</span>
        <span className="text-xs text-muted-foreground">
          {call.direction} · {call.status}
          {call.outcome && ` · ${call.outcome}`}
        </span>
        {call.needsReview && <span className="rounded bg-amber-50 px-1 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-200">needs review</span>}
      </Link>
      {call.summary && <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{call.summary}</p>}
    </li>
  );
}
