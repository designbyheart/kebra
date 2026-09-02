import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/atoms/ui/card";
import { InvoiceDisclosure } from "@/components/molecules/invoice-disclosure";
import type { InvoiceGroup } from "@/app/customers/queries";
import { fmtDate } from "@/lib/ui/format";

export type InvoicesCardProps = { groups: InvoiceGroup[] };

/** Invoices grouped by visit, newest first, each expandable to its lines. */
export function InvoicesCard({ groups }: InvoicesCardProps) {
  return (
    <Card size="sm">
      <CardHeader className="border-b pb-3">
        <CardTitle>Invoices</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {groups.length === 0 && <p className="text-sm text-muted-foreground">No invoices on file.</p>}
        {groups.map((g) => (
          <div key={g.job_id} className="space-y-1">
            <div className="flex flex-wrap items-baseline gap-x-3 text-sm text-muted-foreground">
              <Link href={`/jobs/${g.job_id}`} className="font-medium text-foreground hover:underline">
                {g.description ?? "Visit"}
              </Link>
              <span className="text-xs">{fmtDate(g.visit_date)}</span>
              {g.address_label && <span className="truncate">{g.address_label}</span>}
            </div>
            {g.invoices.map((inv) => (
              <InvoiceDisclosure key={inv.id} invoice={inv} />
            ))}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
