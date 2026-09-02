import Link from "next/link";
import type { JobRow as JobListRow } from "@/app/jobs/queries";
import { TableCell, TableRow } from "@/components/atoms/ui/table";
import { PriorityBadge } from "@/components/atoms/priority-badge";
import { SourceBadge } from "@/components/atoms/source-badge";
import { StatusBadge } from "@/components/atoms/status-badge";
import { TagBadge } from "@/components/atoms/tag-badge";
import { fmtWindow, money, relativeDay } from "@/lib/ui/format";

export type JobRowProps = { row: JobListRow };

/** One row of the /jobs table. */
export function JobRow({ row: r }: JobRowProps) {
  return (
    <TableRow className="align-top">
      <TableCell className="whitespace-nowrap">
        <Link href={`/jobs/${r.id}`} className="block hover:underline">
          {fmtWindow(r.scheduledStart, r.windowEnd)}
        </Link>
        {r.scheduledStart && <div className="text-xs text-muted-foreground">{relativeDay(r.scheduledStart)}</div>}
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap items-center gap-1">
          <StatusBadge status={r.workStatus} />
          <PriorityBadge priority={r.priority} />
        </div>
      </TableCell>
      <TableCell className="max-w-[280px]">
        <Link href={`/jobs/${r.id}`} className="font-medium hover:underline">
          {r.description?.trim() || "Service visit"}
        </Link>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {r.invoiceNumber && <span>#{r.invoiceNumber}</span>}
          <SourceBadge source={r.source} />
        </div>
      </TableCell>
      <TableCell className="max-w-[180px]">
        <Link href={`/customers/${r.customerId}`} className="hover:underline">
          {r.customerName}
        </Link>
      </TableCell>
      <TableCell className="max-w-[240px]">
        {r.addressId && (
          <Link href={`/addresses/${r.addressId}`} className="hover:underline">
            {r.addressLabel}
          </Link>
        )}
        {!r.addressId && <span className="text-muted-foreground">—</span>}
      </TableCell>
      <TableCell className="whitespace-nowrap">
        {r.techs.length > 0 && r.techs.map((t) => t.name).join(", ")}
        {r.techs.length === 0 && <span className="text-muted-foreground">Unassigned</span>}
      </TableCell>
      <TableCell>
        <div className="flex max-w-[220px] flex-wrap gap-1">
          {r.tags.slice(0, 3).map((t) => (
            <TagBadge key={t} tag={t} />
          ))}
          {r.tags.length > 3 && <span className="text-xs text-muted-foreground">+{r.tags.length - 3}</span>}
        </div>
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {r.outstandingBalance > 0 && <span className="font-medium text-red-700 dark:text-red-300">{money(r.outstandingBalance)}</span>}
        {r.outstandingBalance <= 0 && <span className="text-muted-foreground">—</span>}
      </TableCell>
    </TableRow>
  );
}
