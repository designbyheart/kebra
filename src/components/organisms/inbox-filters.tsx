import Link from "next/link";
import { PendingCancellationBadge } from "@/components/atoms/pending-cancellation-badge";
import { KindFilterLink } from "@/components/molecules/kind-filter-link";
import { StatusFilterLink } from "@/components/molecules/status-filter-link";
import { pluralize } from "@/lib/ui/format";
import { KIND_LABEL, KIND_ORDER, STATUS_FILTERS, inboxHref, type StatusFilter, type TaskKind } from "@/lib/ui/inbox-grouping";

export type InboxFiltersProps = {
  status: StatusFilter;
  kind: TaskKind | null;
  counts: Record<StatusFilter, number>;
  openByKind: Record<TaskKind, number>;
};

/** Status tabs, kind chips and the pending-cancellations shortcut above the inbox list. */
export function InboxFilters({ status, kind, counts, openByKind }: InboxFiltersProps) {
  const pendingCancellations = openByKind.cancellation;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-3">
      <nav aria-label="Status" className="flex flex-wrap items-center gap-1">
        {STATUS_FILTERS.map((s) => (
          <StatusFilterLink key={s} status={s} href={inboxHref(s, kind)} active={s === status} count={counts[s]} />
        ))}
      </nav>
      <nav aria-label="Kind" className="flex flex-wrap items-center gap-1 text-xs">
        <KindFilterLink variant="all" href={inboxHref(status, null)} active={!kind}>
          All kinds
        </KindFilterLink>
        {KIND_ORDER.map((k) => (
          <KindFilterLink key={k} href={inboxHref(status, k)} active={kind === k} count={openByKind[k]}>
            {KIND_LABEL[k].many}
          </KindFilterLink>
        ))}
      </nav>
      {pendingCancellations > 0 && (
        <Link href={inboxHref("open", "cancellation")} className="ml-auto">
          <PendingCancellationBadge label={pluralize(pendingCancellations, "pending cancellation")} />
        </Link>
      )}
    </div>
  );
}
