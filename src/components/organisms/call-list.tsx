"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/atoms/ui/table";
import { CallFilterChip } from "@/components/molecules/call-filter-chip";
import { CallRow } from "@/components/molecules/call-row";
import { CallSearchForm } from "@/components/molecules/call-search-form";
import { formatTimeET, isoDateET } from "@/lib/time";
import type { CallFilter, CallListResult } from "@/app/calls/data";
import { callListFooter, emptyCallsMessage, isLive, listPollMs } from "@/lib/ui/call-derive";
import { CALL_FILTER_CHIPS, callsHref } from "@/lib/ui/call-filters";
import { useCallFeed } from "@/hooks/use-call-feed";
import { useClock } from "@/hooks/use-clock";

export type CallListProps = { initial: CallListResult; filter: CallFilter; q: string };

/**
 * Filter chips, search, the calls table and the refresh footer. Live-refreshes
 * through `useCallFeed`; remount with a `key` when `filter` / `q` change.
 */
export function CallList({ initial, filter, q }: CallListProps) {
  const router = useRouter();
  const fetcher = useCallback(
    async (signal: AbortSignal) => {
      const params = new URLSearchParams();
      if (filter !== "all") params.set("f", filter);
      if (q) params.set("q", q);
      const res = await fetch(`/api/calls?${params.toString()}`, { signal, cache: "no-store" });
      if (!res.ok) throw new Error(`refresh failed (${res.status})`);
      const json = (await res.json()) as { ok: boolean } & CallListResult;
      if (!json.ok) return null;
      return json;
    },
    [filter, q],
  );

  const anyLive = initial.rows.some((r) => isLive(r.status)) || initial.counts.live > 0;
  const { data, lastRefreshAt, sse } = useCallFeed<CallListResult>({
    initial,
    fetcher,
    intervalMs: listPollMs(anyLive),
  });
  const live = data.rows.some((r) => isLive(r.status));
  const now = useClock(1000, live);
  const todayIso = useMemo(() => isoDateET(now), [now]);
  const refreshed = (lastRefreshAt != null && formatTimeET(lastRefreshAt)) || null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Filter calls">
          {CALL_FILTER_CHIPS.map((c) => {
            const n = (c.count && data.counts[c.count]) ?? null;
            return <CallFilterChip key={c.key} href={callsHref(c.key, q)} label={c.label} active={c.key === filter} count={n} liveDot={c.key === "live" && n != null && n > 0} />;
          })}
        </div>
        <CallSearchForm filter={filter} q={q} clearHref={callsHref(filter, "")} />
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
            {data.rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                  {emptyCallsMessage(q, filter)}
                </TableCell>
              </TableRow>
            )}
            {data.rows.map((r) => (
              <CallRow key={r.id} row={r} now={now} todayIso={todayIso} onOpen={() => router.push(`/calls/${r.id}`)} />
            ))}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">{callListFooter({ count: data.rows.length, live, sse, refreshed })}</p>
    </div>
  );
}
