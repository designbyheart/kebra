import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/atoms/ui/table";
import type { AddressCandidate } from "@/domain/search";
import { confidencePct } from "@/lib/ui/customer-view";
import { relativeDay } from "@/lib/ui/format";

export type AddressMatchesProps = { rows: AddressCandidate[]; now: Date };

/** Service addresses matching a search; each row opens the dossier. */
export function AddressMatches({ rows, now }: AddressMatchesProps) {
  if (rows.length === 0) return null;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Address</TableHead>
          <TableHead>Customer</TableHead>
          <TableHead>Last visit</TableHead>
          <TableHead className="text-right">Match</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((a) => (
          <TableRow key={a.address_id}>
            <TableCell>
              <Link href={`/addresses/${a.address_id}`} className="font-medium hover:underline">
                {a.label}
              </Link>
              {a.zip && <span className="ml-2 text-xs text-muted-foreground">{a.zip}</span>}
            </TableCell>
            <TableCell>
              <Link href={`/customers/${a.customer_id}`} className="hover:underline">
                {a.customer_name}
              </Link>
            </TableCell>
            <TableCell className="text-muted-foreground">{relativeDay(a.last_visit_at, now)}</TableCell>
            <TableCell className="text-right text-xs text-muted-foreground tabular-nums">{confidencePct(a.confidence)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
