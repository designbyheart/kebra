import type { InvoiceWithItems } from "@/domain/history";
import { fmtDate, money } from "@/lib/ui/format";
import { InvoiceLines } from "./invoice-lines";

export type InvoiceDisclosureProps = { invoice: InvoiceWithItems; defaultOpen?: boolean };

/** Invoice header row + expandable lines, using <details> so it needs no JS. */
export function InvoiceDisclosure({ invoice, defaultOpen = false }: InvoiceDisclosureProps) {
  return (
    <details className="group rounded-lg border" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center gap-3 px-3 py-2 text-sm hover:bg-muted/50 [&::-webkit-details-marker]:hidden">
        <span className="font-medium">Invoice #{invoice.invoiceNumber ?? "—"}</span>
        <span className="text-xs text-muted-foreground">{fmtDate(invoice.invoiceDate ?? invoice.serviceDate)}</span>
        <span className="ml-auto text-xs text-muted-foreground">{invoice.status ?? ""}</span>
        <span className="tabular-nums">{money(invoice.amount)}</span>
        {invoice.dueAmount > 0 && <span className="text-xs font-medium text-red-700 dark:text-red-300">{money(invoice.dueAmount)} due</span>}
        <span className="text-xs text-muted-foreground group-open:hidden">{invoice.items.length} lines</span>
      </summary>
      <div className="border-t px-3 py-2">
        <InvoiceLines invoice={invoice} />
      </div>
    </details>
  );
}
