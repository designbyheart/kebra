import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { fmtDateTime } from "./format";

export function PendingCancellationBanner({
  reason,
  requestedAt,
  taskId,
  callId,
}: {
  reason: string | null;
  requestedAt: Date;
  taskId: string | null;
  callId: string | null;
}) {
  const inboxHref = taskId ? `/inbox?kind=cancellation&task=${encodeURIComponent(taskId)}` : "/inbox?kind=cancellation";
  return (
    <div
      role="status"
      className="flex flex-wrap items-start gap-3 rounded-xl border border-red-300 bg-[repeating-linear-gradient(135deg,#fef2f2_0_6px,#fee2e2_6px_12px)] px-4 py-3 text-sm text-red-900 dark:border-red-800 dark:bg-[repeating-linear-gradient(135deg,#450a0a_0_6px,#3f0a0a_6px_12px)] dark:text-red-100"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="font-medium">Cancellation pending office approval</div>
        <div className="mt-0.5 text-red-800/90 dark:text-red-200/90">
          Requested {fmtDateTime(requestedAt)}
          {reason ? <> · “{reason}”</> : null}
        </div>
      </div>
      <div className="flex items-center gap-3 text-xs font-medium">
        {callId ? (
          <Link href={`/calls/${callId}`} className="underline-offset-2 hover:underline">
            View call
          </Link>
        ) : null}
        <Link href={inboxHref} className="rounded-md bg-red-700 px-2.5 py-1 text-white hover:bg-red-800">
          Review in Inbox
        </Link>
      </div>
    </div>
  );
}
