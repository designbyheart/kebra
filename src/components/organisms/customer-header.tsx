import { KindPill } from "@/components/atoms/kind-pill";
import { CustomerPhoneLink } from "@/components/molecules/customer-phone-link";
import type { CustomerDetail } from "@/app/customers/queries";
import { BALANCE_FIGURE_CLASS, balanceState } from "@/lib/ui/customer-view";
import { fmtDate, money, pluralize } from "@/lib/ui/format";
import { cn } from "@/lib/utils";

export type CustomerHeaderProps = {
  customer: Pick<CustomerDetail["customer"], "displayName" | "kind" | "company" | "jobCount" | "firstJob" | "createdAt">;
  sitesCount: number;
  phones: CustomerDetail["phones"];
  balance: CustomerDetail["balance"];
};

/** Customer dossier header: name, kind, company, meta line with phones, open balance. */
export function CustomerHeader({ customer: c, sitesCount, phones, balance }: CustomerHeaderProps) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4 border-b pb-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{c.displayName}</h1>
          <KindPill kind={c.kind} company={c.company} />
          {c.company && c.company !== c.displayName && <span className="text-sm text-muted-foreground">{c.company}</span>}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span>{pluralize(sitesCount, "site")}</span>
          <span>{pluralize(c.jobCount, "job")}</span>
          <span>Customer since {fmtDate(c.firstJob ?? c.createdAt)}</span>
          {phones.length > 0 && (
            <span className="flex flex-wrap items-center gap-2">
              {phones.map((p) => (
                <CustomerPhoneLink key={p.id} phone={p} />
              ))}
            </span>
          )}
          {phones.length === 0 && <span>No phone on file</span>}
        </div>
      </div>
      <div className="text-right">
        <div className="text-xs text-muted-foreground">Open balance</div>
        <div className={cn("text-xl font-semibold tabular-nums", BALANCE_FIGURE_CLASS[balanceState(balance.total_cents)])}>{money(balance.total_cents)}</div>
        {balance.invoices.length > 0 && <div className="text-xs text-muted-foreground">{pluralize(balance.invoices.length, "open invoice")}</div>}
      </div>
    </header>
  );
}
