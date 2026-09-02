import Link from "next/link";
import { KindPill } from "@/components/atoms/kind-pill";
import { WarrantyPillWithBasis } from "@/components/molecules/warranty-pill-with-basis";
import { BookJobDialog, type BookJobDialogProps } from "@/components/organisms/book-job-dialog";
import type { AddressDossier } from "@/domain/dossier-fallback";
import { money, pluralize, relativeDay, unitLabel } from "@/lib/ui/format";

export type AddressHeaderProps = {
  address: { street: string; unit: string | null; city: string | null; state: string | null; zip: string | null };
  customer: { id: string; displayName: string; kind: string | null; company: string | null };
  dossier: Pick<AddressDossier, "warranty" | "last_visit" | "visit_count_12m" | "open_balance_cents" | "open_balance_jobs">;
  /** The customer has more than one service address. */
  isPM: boolean;
  sitesCount: number;
  /** Other units in the same building for the same customer. */
  siblings: { id: string; unit: string | null }[];
  now: Date;
  booking: BookJobDialogProps;
};

/** Address dossier header: street + unit, warranty pill, customer line, last visit, balance, sibling units, Book a job. */
export function AddressHeader({ address: a, customer: c, dossier, isPM, sitesCount, siblings, now, booking }: AddressHeaderProps) {
  const unit = unitLabel(a.unit);
  return (
    <header className="flex flex-wrap items-start justify-between gap-4 border-b pb-4">
      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            {a.street}
            {unit && <span className="text-muted-foreground"> · {unit}</span>}
          </h1>
          <WarrantyPillWithBasis warranty={dossier.warranty} />
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span>{[a.city, a.state, a.zip].filter(Boolean).join(", ")}</span>
          <span className="flex items-center gap-1.5">
            <Link href={`/customers/${c.id}`} className="font-medium text-foreground hover:underline">
              {c.displayName}
            </Link>
            <KindPill kind={c.kind} company={c.company} />
            {isPM && (
              <span className="rounded-md bg-violet-50 px-1.5 py-0.5 text-xs font-medium text-violet-700 ring-1 ring-inset ring-violet-200 dark:bg-violet-950/60 dark:text-violet-300 dark:ring-violet-900">
                Property manager · {pluralize(sitesCount, "site")}
              </span>
            )}
          </span>
          <span>
            Last visit {(dossier.last_visit && relativeDay(dossier.last_visit.date, now)) || "none"} · {pluralize(dossier.visit_count_12m, "visit")} in 12 mo
          </span>
          {dossier.open_balance_cents > 0 && (
            <span className="font-medium text-red-700 dark:text-red-300">
              {money(dossier.open_balance_cents)} open across {pluralize(dossier.open_balance_jobs, "job")}
            </span>
          )}
        </div>
        {siblings.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
            <span>Other units here:</span>
            {siblings.map((s) => (
              <Link key={s.id} href={`/addresses/${s.id}`} className="rounded-md border px-1.5 py-0.5 hover:bg-muted">
                {s.unit ?? "(no unit)"}
              </Link>
            ))}
          </div>
        )}
      </div>
      <BookJobDialog {...booking} />
    </header>
  );
}
