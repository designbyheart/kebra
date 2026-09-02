import Link from "next/link";
import type { TimelineEntry } from "@/app/addresses/queries";
import { InvoiceLines } from "@/components/jobs/invoice-lines";
import { NoteList } from "@/components/jobs/note-list";
import { PriorityBadge, SourceBadge, STATUS_DOT, StatusBadge, TagBadge } from "@/components/jobs/status-badge";
import { fmtDate, fmtWindow, money, visibleTags } from "@/components/jobs/format";
import { MaskedText } from "@/components/jobs/masked-text";
import { cn } from "@/lib/utils";

/**
 * Every job at the address, newest first. One line per visit; <details>
 * expands to the full notes (codes masked) and invoice lines.
 */
export function VisitTimeline({ entries, now, highlightJobId }: { entries: TimelineEntry[]; now: Date; highlightJobId?: string | null }) {
  if (entries.length === 0) return <p className="text-sm text-muted-foreground">No jobs at this address yet.</p>;
  return (
    <ol className="relative space-y-1 border-l border-border/70 pl-4">
      {entries.map((e) => {
        const j = e.job;
        const future = j.scheduledStart ? j.scheduledStart.getTime() > now.getTime() : false;
        const tags = visibleTags(j.tags);
        return (
          <li key={j.id} id={`job-${j.id}`} className="relative">
            <span className={cn("absolute top-3 -left-[21.5px] size-2.5 rounded-full ring-2 ring-background", STATUS_DOT[j.workStatus])} aria-hidden />
            <details className={cn("group rounded-lg", highlightJobId === j.id && "ring-2 ring-ring/40")} open={highlightJobId === j.id}>
              <summary className="flex cursor-pointer list-none flex-wrap items-baseline gap-x-3 gap-y-1 rounded-lg px-2 py-2 hover:bg-muted/50 [&::-webkit-details-marker]:hidden">
                <span className="w-24 shrink-0 text-sm font-medium tabular-nums">{e.date ? fmtDate(e.date) : "Unscheduled"}</span>
                <StatusBadge status={j.workStatus} />
                <PriorityBadge priority={j.priority} />
                <SourceBadge source={j.source} />
                <span className="text-sm text-muted-foreground">{j.techs.map((t) => t.name).join(", ") || "Unassigned"}</span>
                <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                  #{j.invoiceNumber ?? "—"} · {money(j.totalAmount)}
                  {j.outstandingBalance > 0 ? <span className="ml-1 font-medium text-red-700 dark:text-red-300">{money(j.outstandingBalance)} due</span> : null}
                </span>
                <span className="basis-full text-sm leading-snug">
                  {future ? (
                    <span className="text-foreground">{j.description ?? "Visit"} · {fmtWindow(j.scheduledStart, e.window_end)}</span>
                  ) : (
                    <MaskedText text={e.one_line} />
                  )}
                </span>
                {tags.length ? (
                  <span className="flex basis-full flex-wrap gap-1">
                    {tags.slice(0, 4).map((t) => (
                      <TagBadge key={t} tag={t} />
                    ))}
                  </span>
                ) : null}
              </summary>
              <div className="mt-1 mb-3 space-y-4 rounded-lg border bg-card p-3">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>
                    <span className="font-medium text-foreground">{j.description ?? "Visit"}</span>
                  </span>
                  {j.scheduledStart ? <span>Window {fmtWindow(j.scheduledStart, e.window_end)}</span> : null}
                  {j.completedAt ? <span>Completed {fmtDate(j.completedAt)}</span> : null}
                  <Link href={`/jobs/${j.id}`} className="ml-auto font-medium text-foreground hover:underline">
                    Open job →
                  </Link>
                </div>
                <div>
                  <div className="mb-1.5 text-xs font-medium text-muted-foreground">Notes ({e.notes.length})</div>
                  <NoteList notes={e.notes} emptyText="No notes on this visit." />
                </div>
                {e.invoices.map((inv) => (
                  <div key={inv.id}>
                    <div className="mb-1.5 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      Invoice #{inv.invoiceNumber ?? "—"}
                      <span className="font-normal">{inv.status ?? ""}</span>
                    </div>
                    <InvoiceLines invoice={inv} />
                  </div>
                ))}
              </div>
            </details>
          </li>
        );
      })}
    </ol>
  );
}
