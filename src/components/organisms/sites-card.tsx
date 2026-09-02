import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/atoms/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/atoms/ui/table";
import type { SiteRow } from "@/app/customers/queries";
import { BALANCE_CELL_CLASS, balanceState } from "@/lib/ui/customer-view";
import { money, relativeDay } from "@/lib/ui/format";
import { cn } from "@/lib/utils";

export type SitesCardProps = { sites: SiteRow[]; now: Date };

/** The customer's service addresses with job counts, visits and balance. */
export function SitesCard({ sites, now }: SitesCardProps) {
  return (
    <Card size="sm">
      <CardHeader className="border-b pb-3">
        <CardTitle>Sites ({sites.length})</CardTitle>
      </CardHeader>
      <CardContent className="px-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-3">Address</TableHead>
              <TableHead className="text-right">Jobs</TableHead>
              <TableHead>Last visit</TableHead>
              <TableHead>Next</TableHead>
              <TableHead className="pr-3 text-right">Balance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sites.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="pl-3">
                  <Link href={`/addresses/${s.id}`} className="font-medium hover:underline">
                    {s.label}
                  </Link>
                  {s.zip && <span className="ml-2 text-xs text-muted-foreground">{s.zip}</span>}
                </TableCell>
                <TableCell className="text-right tabular-nums">{s.job_count}</TableCell>
                <TableCell className="text-muted-foreground">{relativeDay(s.last_visit_at, now)}</TableCell>
                <TableCell className="text-muted-foreground">{relativeDay(s.next_visit_at, now)}</TableCell>
                <TableCell className={cn("pr-3 text-right tabular-nums", BALANCE_CELL_CLASS[balanceState(s.open_balance_cents)])}>{money(s.open_balance_cents, { dash: true })}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
