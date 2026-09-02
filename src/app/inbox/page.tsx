import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { InboxItem } from "@/components/inbox/inbox-item";
import { InboxLiveRefresh } from "@/components/inbox/inbox-live";
import { PendingCancellationBadge } from "@/components/inbox/pending-badge";
import {
  KIND_LABEL,
  KIND_ORDER,
  STATUS_FILTERS,
  STATUS_FILTER_LABEL,
  groupByKind,
  parseKindFilter,
  parseStatusFilter,
  sortTasks,
  type StatusFilter,
} from "@/components/inbox/inbox-grouping";
import { requireUser } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { countOpenByKind, countTasksByStatus, listInboxTasks, listInboxUsers } from "./queries";

export const metadata = { title: "Inbox" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function href(status: StatusFilter, kind: string | null): string {
  const q = new URLSearchParams();
  if (status !== "open") q.set("status", status);
  if (kind) q.set("kind", kind);
  const s = q.toString();
  return s ? `/inbox?${s}` : "/inbox";
}

const EMPTY: Record<StatusFilter, string> = {
  open: "No open",
  in_progress: "Nothing in progress under",
  done: "Nothing done under",
  dismissed: "Nothing dismissed under",
  all: "No",
};

export default async function InboxPage({ searchParams }: { searchParams: SearchParams }) {
  const [user, sp] = await Promise.all([requireUser(), searchParams]);
  const status = parseStatusFilter(sp.status);
  const kind = parseKindFilter(sp.kind);
  const focus = Array.isArray(sp.task) ? sp.task[0] : sp.task;
  const now = new Date();

  const [tasks, counts, openByKind, users] = await Promise.all([
    listInboxTasks({ status, kind }),
    countTasksByStatus(kind),
    countOpenByKind(),
    listInboxUsers(),
  ]);
  const groups = groupByKind(tasks, kind).map((g) => ({ ...g, items: sortTasks(g.items, now) }));
  const pendingCancellations = openByKind.cancellation;

  return (
    <div>
      <InboxLiveRefresh />
      <PageHeader title="Inbox" description="Handoffs, callbacks, reviews, follow-ups and cancellation approvals. Every change here is one event on the feed." />

      <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-3">
        <nav aria-label="Status" className="flex flex-wrap items-center gap-1">
          {STATUS_FILTERS.map((s) => (
            <Link
              key={s}
              href={href(s, kind)}
              aria-current={s === status ? "page" : undefined}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors",
                s === status ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {STATUS_FILTER_LABEL[s]}
              <span className={cn("tabular-nums", s === status ? "opacity-80" : "opacity-70")}>{counts[s]}</span>
            </Link>
          ))}
        </nav>
        <nav aria-label="Kind" className="flex flex-wrap items-center gap-1 text-xs">
          <Link
            href={href(status, null)}
            className={cn("rounded-md px-2 py-1", !kind ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground")}
          >
            All kinds
          </Link>
          {KIND_ORDER.map((k) => (
            <Link
              key={k}
              href={href(status, k)}
              className={cn(
                "inline-flex items-center gap-1 rounded-md px-2 py-1",
                kind === k ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {KIND_LABEL[k].many}
              {openByKind[k] ? <span className="rounded bg-background px-1 text-xs tabular-nums ring-1 ring-border">{openByKind[k]}</span> : null}
            </Link>
          ))}
        </nav>
        {pendingCancellations > 0 ? (
          <Link href={href("open", "cancellation")} className="ml-auto">
            <PendingCancellationBadge label={`${pendingCancellations} pending cancellation${pendingCancellations === 1 ? "" : "s"}`} />
          </Link>
        ) : null}
      </div>

      {tasks.length === 0 ? (
        <p className="rounded-md border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
          {status === "open" && !kind
            ? "Inbox zero. New handoffs, callbacks and cancellation requests land here the moment the agent files them."
            : `${EMPTY[status]} ${kind ? KIND_LABEL[kind].many.toLowerCase() : "tasks"}${status === "open" ? "" : ""}.`}
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((g) => (
            <section key={g.kind} aria-labelledby={`group-${g.kind}`}>
              <div className="mb-2 flex items-baseline gap-2">
                <h2 id={`group-${g.kind}`} className="text-sm font-semibold">
                  {KIND_LABEL[g.kind].many}
                </h2>
                <span className="text-xs tabular-nums text-muted-foreground">{g.items.length}</span>
                <span className="hidden text-xs text-muted-foreground sm:inline">· {KIND_LABEL[g.kind].hint}</span>
              </div>
              {g.items.length === 0 ? (
                <p className="rounded-md border border-dashed px-3 py-3 text-xs text-muted-foreground">
                  {EMPTY[status]} {KIND_LABEL[g.kind].many.toLowerCase()}.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {g.items.map((t) => (
                    <InboxItem key={t.id} task={t} users={users} viewer={user} highlighted={focus === t.id} now={now} />
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
