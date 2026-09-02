import Link from "next/link";
import { Building2, House } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { CustomerRow } from "@/app/customers/queries";
import type { AddressCandidate } from "@/domain/search";
import { kindLabel, money, pluralize, relativeDay } from "@/components/jobs/format";

export function KindPill({ kind, company }: { kind: string | null; company?: string | null }) {
  const label = kindLabel(kind, company);
  const Icon = label === "Business" ? Building2 : House;
  return (
    <span className="inline-flex h-5 items-center gap-1 rounded-md bg-muted px-1.5 text-[11px] font-medium text-muted-foreground ring-1 ring-inset ring-border">
      <Icon className="size-3" />
      {label}
    </span>
  );
}

export function CustomersTable({ rows, showMatch, now }: { rows: CustomerRow[]; showMatch?: boolean; now: Date }) {
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
          {showMatch ? <TableHead className="text-right">Match</TableHead> : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((c) => (
          <TableRow key={c.id}>
            <TableCell>
              <Link href={`/customers/${c.id}`} className="font-medium hover:underline">
                {c.display_name}
              </Link>
              {c.company && c.company !== c.display_name ? <span className="ml-2 text-xs text-muted-foreground">{c.company}</span> : null}
            </TableCell>
            <TableCell>
              <KindPill kind={c.kind} company={c.company} />
            </TableCell>
            <TableCell className="text-right tabular-nums">{c.sites_count}</TableCell>
            <TableCell className="text-right tabular-nums">{c.job_count}</TableCell>
            <TableCell className="text-muted-foreground">{relativeDay(c.last_job_at, now)}</TableCell>
            <TableCell className={`text-right tabular-nums ${c.open_balance_cents > 0 ? "font-medium text-red-700 dark:text-red-300" : "text-muted-foreground"}`}>
              {money(c.open_balance_cents, { dash: true })}
            </TableCell>
            {showMatch ? (
              <TableCell className="text-right text-xs text-muted-foreground tabular-nums">
                {c.matched_by === "phone" ? "phone" : `${Math.round((c.confidence ?? 0) * 100)}%`}
              </TableCell>
            ) : null}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function AddressMatches({ rows, now }: { rows: AddressCandidate[]; now: Date }) {
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
              {a.zip ? <span className="ml-2 text-xs text-muted-foreground">{a.zip}</span> : null}
            </TableCell>
            <TableCell>
              <Link href={`/customers/${a.customer_id}`} className="hover:underline">
                {a.customer_name}
              </Link>
            </TableCell>
            <TableCell className="text-muted-foreground">{relativeDay(a.last_visit_at, now)}</TableCell>
            <TableCell className="text-right text-xs text-muted-foreground tabular-nums">{Math.round(a.confidence * 100)}%</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function sitesLabel(n: number): string {
  return pluralize(n, "site");
}
