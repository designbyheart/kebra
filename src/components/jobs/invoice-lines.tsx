import type { InvoiceWithItems } from "@/domain/history";
import { cn } from "@/lib/utils";
import { fmtDate, money } from "./format";

/** One invoice's line items as a dense table. Server-renderable. */
export function InvoiceLines({ invoice, className }: { invoice: InvoiceWithItems; className?: string }) {
  if (invoice.items.length === 0) {
    return <p className={cn("text-xs text-muted-foreground", className)}>No line items on this invoice.</p>;
  }
  return (
    <table className={cn("w-full text-xs", className)}>
      <thead>
        <tr className="text-left text-muted-foreground">
          <th className="py-1 pr-2 font-medium">Item</th>
          <th className="py-1 pr-2 font-medium">Type</th>
          <th className="py-1 pr-2 text-right font-medium">Qty</th>
          <th className="py-1 pr-2 text-right font-medium">Unit</th>
          <th className="py-1 text-right font-medium">Amount</th>
        </tr>
      </thead>
      <tbody>
        {invoice.items.map((it) => (
          <tr key={it.id} className="border-t border-border/60 align-top">
            <td className="py-1 pr-2">{it.name}</td>
            <td className="py-1 pr-2 text-muted-foreground">{it.type ?? "—"}</td>
            <td className="py-1 pr-2 text-right tabular-nums">{(it.qtyInHundredths / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}</td>
            <td className="py-1 pr-2 text-right tabular-nums">{money(it.unitPrice)}</td>
            <td className="py-1 text-right tabular-nums">{money(it.amount)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="border-t font-medium">
          <td className="py-1 pr-2" colSpan={4}>
            Total
          </td>
          <td className="py-1 text-right tabular-nums">{money(invoice.amount)}</td>
        </tr>
        {invoice.dueAmount > 0 ? (
          <tr className="text-red-700 dark:text-red-300">
            <td className="py-0.5 pr-2" colSpan={4}>
              Due
            </td>
            <td className="py-0.5 text-right tabular-nums">{money(invoice.dueAmount)}</td>
          </tr>
        ) : null}
      </tfoot>
    </table>
  );
}

/** Invoice header row + expandable lines, using <details> so it needs no JS. */
export function InvoiceDisclosure({ invoice, defaultOpen = false }: { invoice: InvoiceWithItems; defaultOpen?: boolean }) {
  return (
    <details className="group rounded-lg border" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center gap-3 px-3 py-2 text-sm hover:bg-muted/50 [&::-webkit-details-marker]:hidden">
        <span className="font-medium">Invoice #{invoice.invoiceNumber ?? "—"}</span>
        <span className="text-xs text-muted-foreground">{fmtDate(invoice.invoiceDate ?? invoice.serviceDate)}</span>
        <span className="ml-auto text-xs text-muted-foreground">{invoice.status ?? ""}</span>
        <span className="tabular-nums">{money(invoice.amount)}</span>
        {invoice.dueAmount > 0 ? <span className="text-xs font-medium text-red-700 dark:text-red-300">{money(invoice.dueAmount)} due</span> : null}
        <span className="text-xs text-muted-foreground group-open:hidden">{invoice.items.length} lines</span>
      </summary>
      <div className="border-t px-3 py-2">
        <InvoiceLines invoice={invoice} />
      </div>
    </details>
  );
}
