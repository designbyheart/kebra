"use client";

import Link from "next/link";
import { Phone } from "lucide-react";
import type { CallListRow } from "@/app/calls/data";
import { FlagPill } from "@/components/atoms/flag-pill";
import { LiveDot } from "@/components/atoms/live-dot";
import { TableCell, TableRow } from "@/components/atoms/ui/table";
import { CallOutcomeCell } from "@/components/molecules/call-outcome-cell";
import { durationSeconds, formatDuration, isLive, STATUS_LABEL } from "@/lib/ui/call-derive";
import { formatDayET, formatTimeET, isoDateET } from "@/lib/time";
import { cn } from "@/lib/utils";

export type CallRowProps = {
  row: CallListRow;
  /** Clock tick (ms) so live durations count up. */
  now: number;
  /** Today's ET date (yyyy-mm-dd) to shorten same-day timestamps. */
  todayIso: string;
  onOpen: () => void;
};

/** One row of the calls table; the whole row opens the call. */
export function CallRow({ row, now, todayIso, onOpen }: CallRowProps) {
  const live = isLive(row.status);
  const secs = durationSeconds(row.startedAt, row.endedAt, new Date(now));
  const sameDay = isoDateET(row.startedAt) === todayIso;
  const when = (sameDay && formatTimeET(row.startedAt)) || `${formatDayET(row.startedAt)}, ${formatTimeET(row.startedAt)}`;
  const identified = Boolean(row.customerName || row.addressLabel);
  return (
    <TableRow
      onClick={onOpen}
      className={cn("cursor-pointer", live && "bg-amber-50/60 hover:bg-amber-50 dark:bg-amber-950/20 dark:hover:bg-amber-950/30")}
      data-live={live || undefined}
    >
      <TableCell className="whitespace-nowrap tabular-nums">
        <div className="flex items-center gap-2">
          {live && <LiveDot />}
          {!live && <Phone className="size-3 text-muted-foreground" />}
          <Link href={`/calls/${row.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
            {when}
          </Link>
        </div>
        {live && <div className="pl-5 text-xs text-amber-700 dark:text-amber-400">{STATUS_LABEL[row.status] ?? row.status}</div>}
      </TableCell>
      <TableCell className="whitespace-nowrap font-mono text-sm">{row.caller}</TableCell>
      <TableCell className="max-w-0">
        {identified && (
          <div className="min-w-0">
            <div className="truncate font-medium">{row.customerName ?? "—"}</div>
            <div className="truncate text-sm text-muted-foreground">{row.addressLabel ?? ""}</div>
          </div>
        )}
        {!identified && <span className="text-muted-foreground">Not identified</span>}
        {row.summary && <div className="mt-0.5 truncate text-xs text-muted-foreground">{row.summary}</div>}
      </TableCell>
      <TableCell className={cn("text-right tabular-nums", live && "text-amber-700 dark:text-amber-400")}>{formatDuration(secs)}</TableCell>
      <TableCell>
        <CallOutcomeCell outcome={row.outcome} live={live} />
      </TableCell>
      <TableCell className="text-right tabular-nums">{row.actionsCount || <span className="text-muted-foreground">0</span>}</TableCell>
      <TableCell>
        <div className="flex items-center gap-1.5">
          {row.needsReview && <FlagPill kind="review" label="Review" title="Needs review" />}
          {row.handoff && <FlagPill kind="handoff" title="Transfer / handoff" />}
        </div>
      </TableCell>
    </TableRow>
  );
}
