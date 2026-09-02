import type { InvoiceWithItems } from "@/domain/history";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/atoms/ui/card";
import { InvoiceDisclosure } from "@/components/molecules/invoice-disclosure";

export type JobInvoicesCardProps = { invoices: InvoiceWithItems[] };

/** Invoices on the job, newest open by default. */
export function JobInvoicesCard({ invoices }: JobInvoicesCardProps) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Invoices ({invoices.length})</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {invoices.length > 0 && invoices.map((inv, i) => <InvoiceDisclosure key={inv.id} invoice={inv} defaultOpen={i === 0} />)}
        {invoices.length === 0 && <p className="text-sm text-muted-foreground">No invoice on file.</p>}
      </CardContent>
    </Card>
  );
}
