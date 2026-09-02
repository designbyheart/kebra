import Link from "next/link";
import type { CancellationApprovalData } from "@/app/inbox/cancellation-data";
import { CancellationApprovalCard } from "@/components/organisms/cancellation-approval-card";
import type { CurrentUser } from "@/lib/auth";

export type CancellationsQueueProps = {
  pending: CancellationApprovalData[];
  viewer: CurrentUser;
};

/** /inbox/cancellations body: the pending count, a way back, and one card per request. */
export function CancellationsQueue({ pending, viewer }: CancellationsQueueProps) {
  return (
    <>
      <div className="mb-4 flex items-center gap-3 text-sm">
        <span className="font-medium">{pending.length} pending</span>
        <Link href="/inbox" className="text-muted-foreground hover:underline">
          ← Inbox
        </Link>
      </div>
      {pending.length === 0 && (
        <p className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          Nothing waiting. New requests appear here as soon as the agent files them.
        </p>
      )}
      {pending.length > 0 && (
        <div className="flex flex-col gap-4">
          {pending.map((cr) => (
            <CancellationApprovalCard key={cr.id} data={cr} viewer={viewer} />
          ))}
        </div>
      )}
    </>
  );
}
