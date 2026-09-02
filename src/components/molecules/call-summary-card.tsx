import Link from "next/link";
import { ArrowRightLeft, ArrowUpRight, Phone } from "lucide-react";
import type { CallDetail as CallDetailData } from "@/app/calls/data";
import { FlagPill } from "@/components/atoms/flag-pill";
import { LiveDot } from "@/components/atoms/live-dot";
import { OutcomeChip } from "@/components/atoms/outcome-chip";
import { callStatusText, formatDuration, outcomeLabel, outcomePendingText } from "@/lib/ui/call-derive";
import { formatDateTimeET } from "@/lib/time";
import { cn } from "@/lib/utils";

export type CallSummaryCardProps = { call: CallDetailData; secs: number; live: boolean };

/** Caller, duration, customer / address / outcome facts and review flags. */
export function CallSummaryCard({ call, secs, live }: CallSummaryCardProps) {
  const outcome = outcomeLabel(call.outcome);
  const flag = (call.needsReview && "review") || "reviewed";
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {live && <LiveDot />}
            {!live && <Phone className="size-3.5 text-muted-foreground" />}
            <span className="font-mono text-sm">{call.caller}</span>
            <span className="text-xs text-muted-foreground capitalize">{call.direction}</span>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">{formatDateTimeET(call.startedAt)}</div>
        </div>
        <div className="text-right">
          <div className={cn("text-lg font-semibold tabular-nums", live && "text-amber-700 dark:text-amber-400")}>{formatDuration(secs)}</div>
          <div className="text-xs text-muted-foreground">{callStatusText(call, live)}</div>
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
        <dt className="text-xs text-muted-foreground">Customer</dt>
        <dd className="min-w-0 truncate">
          {call.customerId && (
            <Link href={`/customers/${call.customerId}`} className="inline-flex items-center gap-1 font-medium hover:underline">
              {call.customerName ?? call.customerId}
              <ArrowUpRight className="size-3 text-muted-foreground" />
            </Link>
          )}
          {!call.customerId && <span className="text-muted-foreground">Not identified</span>}
          {call.customerKind && <span className="ml-1.5 text-xs text-muted-foreground capitalize">{call.customerKind}</span>}
        </dd>
        <dt className="text-xs text-muted-foreground">Address</dt>
        <dd className="min-w-0 truncate">
          {call.addressId && (
            <Link href={`/customers/${call.customerId}#${call.addressId}`} className="inline-flex items-center gap-1 hover:underline">
              {call.addressLabel ?? call.addressId}
              <ArrowUpRight className="size-3 text-muted-foreground" />
            </Link>
          )}
          {!call.addressId && <span className="text-muted-foreground">—</span>}
        </dd>
        <dt className="text-xs text-muted-foreground">Outcome</dt>
        <dd>
          {outcome && <OutcomeChip outcome={call.outcome} label={outcome} />}
          {!outcome && <span className="text-muted-foreground">{outcomePendingText(live)}</span>}
        </dd>
        {call.handoff && (
          <>
            <dt className="text-xs text-muted-foreground">Handoff</dt>
            <dd className="flex items-center gap-1.5 text-amber-800 dark:text-amber-300">
              <ArrowRightLeft className="size-3.5" />
              {call.handoffReason ?? "Transfer attempted"}
            </dd>
          </>
        )}
      </dl>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <FlagPill kind={flag} />
        {call.costCents != null && <span className="text-xs text-muted-foreground">${(call.costCents / 100).toFixed(2)}</span>}
        {call.providerCallId && (
          <span className="ml-auto truncate font-mono text-xs text-muted-foreground" title={call.providerCallId}>
            {call.providerCallId.slice(0, 18)}
          </span>
        )}
      </div>
    </div>
  );
}
