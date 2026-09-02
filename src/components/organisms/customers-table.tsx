import Link from "next/link";
import { ArrowDown, ArrowUp } from "lucide-react";
import { KindPill } from "@/components/atoms/kind-pill";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/atoms/ui/table";
import type { CustomerFilters, CustomerRow, CustomerSort, CustomerSortColumn } from "@/app/customers/queries";
import { BALANCE_CELL_CLASS, balanceState, matchLabel } from "@/lib/ui/customer-view";
import { money, relativeDay } from "@/lib/ui/format";
import { cn } from "@/lib/utils";

export type CustomersTableProps = {
  rows: CustomerRow[];
  showMatch?: boolean;
  now: Date;
  sort: CustomerSort;
  query: string;
  filters?: CustomerFilters;
};

function sortHref(
  column: CustomerSortColumn,
  active: CustomerSort,
  query: string,
  filters: CustomerFilters,
): string {
  let direction: "asc" | "desc" = "asc";
  if (active.column === column && active.direction === "asc") direction = "desc";
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  params.set("sort", column);
  params.set("dir", direction);
  for (const kind of filters.kinds ?? []) params.append("kind", kind);
  if (filters.balanceMin !== undefined) params.set("balance_min", (filters.balanceMin / 100).toFixed(2));
  if (filters.balanceMax !== undefined) params.set("balance_max", (filters.balanceMax / 100).toFixed(2));
  if (filters.jobsMin !== undefined) params.set("jobs_min", String(filters.jobsMin));
  if (filters.jobsMax !== undefined) params.set("jobs_max", String(filters.jobsMax));
  if (filters.sitesMin !== undefined) params.set("sites_min", String(filters.sitesMin));
  if (filters.sitesMax !== undefined) params.set("sites_max", String(filters.sitesMax));
  const s = params.toString();
  if (s) return `?${s}`;
  return "/customers";
}

function SortHeader({
  column,
  align,
  active,
  children,
  query,
  filters,
}: {
  column: CustomerSortColumn;
  align?: "left" | "right";
  active: CustomerSort;
  children: React.ReactNode;
  query: string;
  filters: CustomerFilters;
}) {
  const isActive = active.column === column;
  let Icon = null;
  if (isActive && active.direction === "asc") Icon = ArrowUp;
  if (isActive && active.direction !== "asc") Icon = ArrowDown;
  const className = cn("inline-flex items-center gap-1 hover:text-foreground", isActive && "text-foreground", !isActive && "text-muted-foreground");
  const headClass = cn(align === "right" && "text-right");
  return (
    <TableHead className={headClass}>
      <Link href={sortHref(column, active, query, filters)} className={className}>
        {children}
        {Icon && <Icon className="size-3.5" />}
      </Link>
    </TableHead>
  );
}

/** Recent customers or search hits; the Match column only for searches. */
export function CustomersTable({ rows, showMatch, now, sort, query, filters = {} }: CustomersTableProps) {
  if (rows.length === 0) return <p className="py-6 text-sm text-muted-foreground">No customers match.</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <SortHeader column="name" active={sort} query={query} filters={filters}>Customer</SortHeader>
          <SortHeader column="kind" active={sort} query={query} filters={filters}>Kind</SortHeader>
          <SortHeader column="sites" align="right" active={sort} query={query} filters={filters}>Sites</SortHeader>
          <SortHeader column="jobs" align="right" active={sort} query={query} filters={filters}>Jobs</SortHeader>
          <SortHeader column="last_job" active={sort} query={query} filters={filters}>Last job</SortHeader>
          <SortHeader column="balance" align="right" active={sort} query={query} filters={filters}>Open balance</SortHeader>
          {showMatch && (
            <SortHeader column="match" align="right" active={sort} query={query} filters={filters}>Match</SortHeader>
          )}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((c) => (
          <TableRow key={c.id}>
            <TableCell>
              <Link href={`/customers/${c.id}`} className="font-medium hover:underline">
                {c.display_name}
              </Link>
              {c.company && c.company !== c.display_name && (
                <span className="ml-2 text-xs text-muted-foreground">{c.company}</span>
              )}
            </TableCell>
            <TableCell>
              <KindPill kind={c.kind} company={c.company} />
            </TableCell>
            <TableCell className="text-right tabular-nums">{c.sites_count}</TableCell>
            <TableCell className="text-right tabular-nums">{c.job_count}</TableCell>
            <TableCell className="text-muted-foreground">{relativeDay(c.last_job_at, now)}</TableCell>
            <TableCell className={cn("text-right tabular-nums", BALANCE_CELL_CLASS[balanceState(c.open_balance_cents)])}>
              {money(c.open_balance_cents, { dash: true })}
            </TableCell>
            {showMatch && <TableCell className="text-right text-xs text-muted-foreground tabular-nums">{matchLabel(c.matched_by, c.confidence)}</TableCell>}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
