import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { relativeTime } from "@/lib/ui/board-layout";
import { PENDING_BANNER_STRIPES } from "@/lib/ui/board-status";
import type { PendingCancellation } from "@/lib/ui/board-types";

export type SheetPendingCancellationBannerProps = { pending: PendingCancellation };

/** Red striped banner under the sheet header while a cancellation request awaits review. */
export function SheetPendingCancellationBanner({ pending: p }: SheetPendingCancellationBannerProps) {
  const inboxHref = (p.taskId && `/inbox?task=${encodeURIComponent(p.taskId)}`) || "/inbox";
  return (
    <div
      className={cn(
        "flex items-start gap-2 border-b border-red-200 bg-red-50 px-4 py-3 text-sm text-red-950 dark:border-red-900 dark:bg-red-950/40 dark:text-red-50",
        PENDING_BANNER_STRIPES,
      )}
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-600" />
      <div className="min-w-0 flex-1">
        <div className="font-semibold">Cancellation requested {relativeTime(p.requestedAt)}</div>
        {p.reason && <div className="mt-0.5">Reason: {p.reason}</div>}
        <div className="mt-1 flex gap-3">
          <Link href={inboxHref} className="font-medium underline underline-offset-2">
            Approve or reject in Inbox →
          </Link>
          {p.callId && (
            <Link href={`/calls/${encodeURIComponent(p.callId)}`} className="underline underline-offset-2">
              View call
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
