"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo } from "react";
import { AlertTriangle, ArrowRightLeft, Phone, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatTimeET, formatDayET, isoDateET } from "@/lib/time";
import type { CallFilter, CallListResult, CallListRow } from "@/app/calls/data";
import { durationSeconds, formatDuration, isLive, outcomeLabel, outcomeTone, STATUS_LABEL } from "./derive";
import { useCallFeed, useNow } from "./use-call-feed";
import { AgentBadge, LiveDot } from "./bits";

type Props = { initial: CallListResult; filter: CallFilter; q: string };

const CHIPS: { key: CallFilter; label: string; count?: keyof CallListResult["counts"] }[] = [
  { key: "all", label: "All" },
  { key: "live", label: "Live", count: "live" },
  { key: "today", label: "Today", count: "today" },
  { key: "review", label: "Needs review", count: "review" },
  { key: "handoffs", label: "Handoffs", count: "handoffs" },
];

export function CallList({ initial, filter, q }: Props) {
  const router = useRouter();
  const fetcher = useCallback(
    async (signal: AbortSignal) => {
      const params = new URLSearchParams();
      if (filter !== "all") params.set("f", filter);
      if (q) params.set("q", q);
      const res = await fetch(`/api/calls?${params.toString()}`, { signal, cache: "no-store" });
      if (!res.ok) throw new Error(`refresh failed (${res.status})`);
      const json = (await res.json()) as { ok: boolean } & CallListResult;
      return json.ok ? json : null;
    },
    [filter, q],
  );

  const anyLive = initial.rows.some((r) => isLive(r.status)) || initial.counts.live > 0;
  const { data, lastRefreshAt, sse } = useCallFeed<CallListResult>({
    initial,
    fetcher,
    intervalMs: anyLive ? 2000 : 6000,
  });
  const live = data.rows.some((r) => isLive(r.status));
  const now = useNow(1000, live);
  const todayIso = useMemo(() => isoDateET(now), [now]);

  const hrefFor = (f: CallFilter) => {
    const p = new URLSearchParams();
    if (f !== "all") p.set("f", f);
    if (q) p.set("q", q);
    const s = p.toString();
    return s ? `/calls?${s}` : "/calls";
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Filter calls">
          {CHIPS.map((c) => {
            const active = c.key === filter;
            const n = c.count ? data.counts[c.count] : null;
            return (
              <Link
                key={c.key}
                href={hrefFor(c.key)}
                role="tab"
                aria-selected={active}
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors",
                  active ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {c.key === "live" && n ? <LiveDot className="size-1.5" /> : null}
                {c.label}
                {n != null && n > 0 ? (
                  <span className={cn("rounded-full px-1.5 text-[10px] tabular-nums", active ? "bg-background/20" : "bg-muted")}>{n}</span>
                ) : null}
              </Link>
            );
          })}
        </div>
        <form method="get" action="/calls" className="ml-auto flex items-center gap-2">
          {filter !== "all" ? <input type="hidden" name="f" value={filter} /> : null}
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input name="q" defaultValue={q} placeholder="Search transcripts and summaries" className="h-8 w-72 pl-7 text-sm" aria-label="Search calls" />
          </div>
          {q ? (
            <Link href={hrefFor(filter)} className="text-xs text-muted-foreground hover:text-foreground">
              Clear
            </Link>
          ) : null}
        </form>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table className="text-sm">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-36">When</TableHead>
              <TableHead className="w-40">Caller</TableHead>
              <TableHead>Customer / address</TableHead>
              <TableHead className="w-20 text-right">Duration</TableHead>
              <TableHead className="w-32">Outcome</TableHead>
              <TableHead className="w-16 text-right">Actions</TableHead>
              <TableHead className="w-28">Flags</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                  {q ? `No calls match “${q}”.` : filter === "all" ? "No calls yet. The first call the agent takes will show up here." : "Nothing here right now."}
                </TableCell>
              </TableRow>
            ) : (
              data.rows.map((r) => <Row key={r.id} row={r} now={now} todayIso={todayIso} onOpen={() => router.push(`/calls/${r.id}`)} />)
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-[11px] text-muted-foreground">
        {data.rows.length} call{data.rows.length === 1 ? "" : "s"}
        {live ? " · live view refreshes every 2 s" : ""}
        {sse === "open" ? " · event feed connected" : sse === "closed" ? " · event feed reconnecting" : ""}
        {lastRefreshAt ? ` · refreshed ${formatTimeET(lastRefreshAt)}` : ""}
      </p>
    </div>
  );
}

function Row({ row, now, todayIso, onOpen }: { row: CallListRow; now: number; todayIso: string; onOpen: () => void }) {
  const live = isLive(row.status);
  const secs = durationSeconds(row.startedAt, row.endedAt, new Date(now));
  const dayIso = isoDateET(row.startedAt);
  const when = dayIso === todayIso ? formatTimeET(row.startedAt) : `${formatDayET(row.startedAt)}, ${formatTimeET(row.startedAt)}`;
  const outcome = outcomeLabel(row.outcome);
  return (
    <TableRow
      onClick={onOpen}
      className={cn("cursor-pointer", live && "bg-amber-50/60 hover:bg-amber-50 dark:bg-amber-950/20 dark:hover:bg-amber-950/30")}
      data-live={live || undefined}
    >
      <TableCell className="whitespace-nowrap tabular-nums">
        <div className="flex items-center gap-2">
          {live ? <LiveDot /> : <Phone className="size-3 text-muted-foreground" />}
          <Link href={`/calls/${row.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
            {when}
          </Link>
        </div>
        {live ? <div className="pl-5 text-[11px] text-amber-700 dark:text-amber-400">{STATUS_LABEL[row.status] ?? row.status}</div> : null}
      </TableCell>
      <TableCell className="whitespace-nowrap font-mono text-xs">{row.caller}</TableCell>
      <TableCell className="max-w-0">
        {row.customerName || row.addressLabel ? (
          <div className="min-w-0">
            <div className="truncate font-medium">{row.customerName ?? "—"}</div>
            <div className="truncate text-xs text-muted-foreground">{row.addressLabel ?? ""}</div>
          </div>
        ) : (
          <span className="text-muted-foreground">Not identified</span>
        )}
        {row.summary ? <div className="mt-0.5 truncate text-xs text-muted-foreground">{row.summary}</div> : null}
      </TableCell>
      <TableCell className={cn("text-right tabular-nums", live && "text-amber-700 dark:text-amber-400")}>{formatDuration(secs)}</TableCell>
      <TableCell>
        {outcome ? (
          <span className={cn("inline-flex h-5 items-center rounded-full px-2 text-[11px] font-medium ring-1 ring-inset", outcomeTone(row.outcome))}>{outcome}</span>
        ) : live ? (
          <AgentBadge label="On the line" />
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="text-right tabular-nums">{row.actionsCount || <span className="text-muted-foreground">0</span>}</TableCell>
      <TableCell>
        <div className="flex items-center gap-1.5">
          {row.needsReview ? (
            <span className="inline-flex h-5 items-center gap-1 rounded-full bg-red-50 px-1.5 text-[11px] font-medium text-red-700 ring-1 ring-red-600/20 ring-inset dark:bg-red-950/40 dark:text-red-300" title="Needs review">
              <AlertTriangle className="size-3" /> Review
            </span>
          ) : null}
          {row.handoff ? (
            <span className="inline-flex h-5 items-center gap-1 rounded-full bg-amber-50 px-1.5 text-[11px] font-medium text-amber-800 ring-1 ring-amber-600/20 ring-inset dark:bg-amber-950/40 dark:text-amber-300" title="Transfer / handoff">
              <ArrowRightLeft className="size-3" /> Handoff
            </span>
          ) : null}
        </div>
      </TableCell>
    </TableRow>
  );
}
