import Link from "next/link";
import type { JobRow } from "@/app/jobs/queries";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtWindow, money, relativeDay } from "./format";
import { PriorityBadge, SourceBadge, StatusBadge, TagBadge } from "./status-badge";

export function JobsTable({ rows, emptyText = "No jobs match these filters." }: { rows: JobRow[]; emptyText?: string }) {
  if (rows.length === 0) return <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{emptyText}</p>;
  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <Table className="text-sm">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-[190px]">Window</TableHead>
            <TableHead className="w-[130px]">Status</TableHead>
            <TableHead>Job</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead>Address</TableHead>
            <TableHead>Tech</TableHead>
            <TableHead>Tags</TableHead>
            <TableHead className="text-right">Due</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id} className="align-top">
              <TableCell className="whitespace-nowrap">
                <Link href={`/jobs/${r.id}`} className="block hover:underline">
                  {fmtWindow(r.scheduledStart, r.windowEnd)}
                </Link>
                {r.scheduledStart ? <div className="text-xs text-muted-foreground">{relativeDay(r.scheduledStart)}</div> : null}
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
                  {r.invoiceNumber ? <span>#{r.invoiceNumber}</span> : null}
                  <SourceBadge source={r.source} />
                </div>
              </TableCell>
              <TableCell className="max-w-[180px]">
                <Link href={`/customers/${r.customerId}`} className="hover:underline">
                  {r.customerName}
                </Link>
              </TableCell>
              <TableCell className="max-w-[240px]">
                {r.addressId ? (
                  <Link href={`/addresses/${r.addressId}`} className="hover:underline">
                    {r.addressLabel}
                  </Link>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="whitespace-nowrap">
                {r.techs.length ? r.techs.map((t) => t.name).join(", ") : <span className="text-muted-foreground">Unassigned</span>}
              </TableCell>
              <TableCell>
                <div className="flex max-w-[220px] flex-wrap gap-1">
                  {r.tags.slice(0, 3).map((t) => (
                    <TagBadge key={t} tag={t} />
                  ))}
                  {r.tags.length > 3 ? <span className="text-xs text-muted-foreground">+{r.tags.length - 3}</span> : null}
                </div>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {r.outstandingBalance > 0 ? <span className="font-medium text-red-700 dark:text-red-300">{money(r.outstandingBalance)}</span> : <span className="text-muted-foreground">—</span>}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
