import Link from "next/link";
import { KindPill } from "@/components/atoms/kind-pill";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/atoms/ui/table";
import type { CustomerRow } from "@/app/customers/queries";
import { BALANCE_CELL_CLASS, balanceState, matchLabel } from "@/lib/ui/customer-view";
import { money, relativeDay } from "@/lib/ui/format";
import { cn } from "@/lib/utils";

export type CustomersTableProps = { rows: CustomerRow[]; showMatch?: boolean; now: Date };

/** Recent customers or search hits; the Match column only for searches. */
export function CustomersTable({ rows, showMatch, now }: CustomersTableProps) {
  if (rows.length === 0) return <p className="py-6 text-sm text-muted-foreground">No customers match.</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Customer</TableHead>
          <TableHead>Kind</TableHead>
          <TableHead className="text-right">Sites</TableHead>
          <TableHead className="text-right">Jobs</TableHead>
          <TableHead>Last job</TableHead>
          <TableHead className="text-right">Open balance</TableHead>
          {showMatch && <TableHead className="text-right">Match</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((c) => (
          <TableRow key={c.id}>
            <TableCell>
              <Link href={`/customers/${c.id}`} className="font-medium hover:underline">
                {c.display_name}
              </Link>
              {c.company && c.company !== c.display_name && <span className="ml-2 text-xs text-muted-foreground">{c.company}</span>}
            </TableCell>
            <TableCell>
              <KindPill kind={c.kind} company={c.company} />
            </TableCell>
            <TableCell className="text-right tabular-nums">{c.sites_count}</TableCell>
            <TableCell className="text-right tabular-nums">{c.job_count}</TableCell>
            <TableCell className="text-muted-foreground">{relativeDay(c.last_job_at, now)}</TableCell>
            <TableCell className={cn("text-right tabular-nums", BALANCE_CELL_CLASS[balanceState(c.open_balance_cents)])}>{money(c.open_balance_cents, { dash: true })}</TableCell>
            {showMatch && <TableCell className="text-right text-xs text-muted-foreground tabular-nums">{matchLabel(c.matched_by, c.confidence)}</TableCell>}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
