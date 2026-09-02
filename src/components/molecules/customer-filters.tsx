import Link from "next/link";
import { Building2, House, X } from "lucide-react";
import { Button } from "@/components/atoms/ui/button";
import { Input } from "@/components/atoms/ui/input";
import { Label } from "@/components/atoms/ui/label";
import type { CustomerFilters } from "@/app/customers/queries";
import { cn } from "@/lib/utils";

export type CustomerFiltersProps = {
  filters: CustomerFilters;
  query: string;
  sortParam: string | undefined;
  dirParam: string | undefined;
};

function buildHref(params: Record<string, string | string[] | undefined>): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) continue;
    if (Array.isArray(value)) {
      for (const v of value) sp.append(key, v);
    } else {
      sp.set(key, value);
    }
  }
  const s = sp.toString();
  if (s) return `?${s}`;
  return "/customers";
}

export function CustomerFilters({ filters, query, sortParam, dirParam }: CustomerFiltersProps) {
  const kinds = filters.kinds ?? [];
  const hasFilters =
    kinds.length > 0 ||
    filters.balanceMin !== undefined ||
    filters.balanceMax !== undefined ||
    filters.jobsMin !== undefined ||
    filters.jobsMax !== undefined ||
    filters.sitesMin !== undefined ||
    filters.sitesMax !== undefined;

  function toggleKind(kind: "business" | "homeowner"): string[] {
    const set = new Set(kinds);
    if (set.has(kind)) set.delete(kind);
    else set.add(kind);
    return Array.from(set);
  }

  function dollars(cents: number | undefined): string {
    if (cents === undefined) return "";
    return (cents / 100).toFixed(2);
  }

  const baseParams: Record<string, string | string[] | undefined> = {
    q: query || undefined,
    sort: sortParam,
    dir: dirParam,
  };

  return (
    <div className="space-y-4 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center gap-4">
        <div className="space-y-2">
          <Label className="text-xs font-medium text-muted-foreground">Kind</Label>
          <div className="flex flex-wrap gap-2">
            <Link
              href={buildHref({ ...baseParams, kind: toggleKind("homeowner") })}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium ring-1 ring-inset transition-colors",
                kinds.includes("homeowner") && "bg-primary text-primary-foreground ring-primary",
                !kinds.includes("homeowner") && "bg-muted text-muted-foreground ring-border hover:bg-accent hover:text-foreground",
              )}
              aria-pressed={kinds.includes("homeowner")}
            >
              <House className="size-3" />
              Homeowner
            </Link>
            <Link
              href={buildHref({ ...baseParams, kind: toggleKind("business") })}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium ring-1 ring-inset transition-colors",
                kinds.includes("business") && "bg-primary text-primary-foreground ring-primary",
                !kinds.includes("business") && "bg-muted text-muted-foreground ring-border hover:bg-accent hover:text-foreground",
              )}
              aria-pressed={kinds.includes("business")}
            >
              <Building2 className="size-3" />
              Business
            </Link>
          </div>
        </div>

        <form method="get" action="/customers" className="contents">
          {query && <input type="hidden" name="q" value={query} />}
          {sortParam && <input type="hidden" name="sort" value={sortParam} />}
          {dirParam && <input type="hidden" name="dir" value={dirParam} />}
          {kinds.map((k) => (
            <input key={k} type="hidden" name="kind" value={k} />
          ))}

          <RangeField label="Open balance" nameMin="balance_min" nameMax="balance_max" min={dollars(filters.balanceMin)} max={dollars(filters.balanceMax)} step="0.01" />
          <RangeField label="Jobs" nameMin="jobs_min" nameMax="jobs_max" min={String(filters.jobsMin ?? "")} max={String(filters.jobsMax ?? "")} />
          <RangeField label="Sites" nameMin="sites_min" nameMax="sites_max" min={String(filters.sitesMin ?? "")} max={String(filters.sitesMax ?? "")} />

          <div className="flex items-end">
            <Button type="submit" variant="outline" size="sm" className="h-9">
              Apply
            </Button>
          </div>
        </form>
      </div>

      {hasFilters && (
        <div className="flex items-center gap-2 border-t pt-3">
          <span className="text-xs text-muted-foreground">Active filters:</span>
          <Link
            href={buildHref({ q: query || undefined, sort: sortParam, dir: dirParam })}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            <X className="size-3" />
            Clear all
          </Link>
        </div>
      )}
    </div>
  );
}

function RangeField({
  label,
  nameMin,
  nameMax,
  min,
  max,
  step = "1",
}: {
  label: string;
  nameMin: string;
  nameMax: string;
  min: string;
  max: string;
  step?: string;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-2">
        <Input name={nameMin} type="number" min="0" step={step} defaultValue={min} placeholder="Min" className="h-8 w-24 text-sm" />
        <span className="text-sm text-muted-foreground">–</span>
        <Input name={nameMax} type="number" min="0" step={step} defaultValue={max} placeholder="Max" className="h-8 w-24 text-sm" />
      </div>
    </div>
  );
}
