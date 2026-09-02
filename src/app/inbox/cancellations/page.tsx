import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { CancellationApprovalCard } from "@/components/inbox/cancellation-approval";
import { listPendingCancellations } from "@/components/inbox/cancellation-data";
import { CancellationLiveRefresh } from "@/components/inbox/cancellation-live";
import { canResolveCancellations } from "@/components/inbox/cancellation-resolve";
import { requireUser } from "@/lib/auth";

export const metadata = { title: "Cancellations" };
export const dynamic = "force-dynamic";

/**
 * Standalone queue of pending cancellation requests (W2-E). The main /inbox
 * (W2-D) embeds the same card; this route exists so the approval flow is
 * testable on its own.
 */
export default async function CancellationsPage() {
  const user = await requireUser();
  const pending = await listPendingCancellations();
  const admin = canResolveCancellations(user);

  return (
    <div>
      <CancellationLiveRefresh />
      <PageHeader
        title="Cancellations"
        description={
          admin
            ? "Requests the agent took on the phone. Approve to cancel the job, or reject with a note and we call the customer back."
            : "Requests the agent took on the phone. Only an admin or the owner can approve them."
        }
      />
      <div className="mb-4 flex items-center gap-3 text-sm">
        <span className="font-medium">{pending.length} pending</span>
        <Link href="/inbox" className="text-muted-foreground hover:underline">
          ← Inbox
        </Link>
      </div>
      {pending.length === 0 ? (
        <p className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          Nothing waiting. New requests appear here as soon as the agent files them.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {pending.map((cr) => (
            <CancellationApprovalCard key={cr.id} data={cr} viewer={user} />
          ))}
        </div>
      )}
    </div>
  );
}
