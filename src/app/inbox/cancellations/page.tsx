import { listPendingCancellations } from "@/app/inbox/cancellation-data";
import { canResolveCancellations } from "@/app/inbox/cancellation-resolve";
import { CancellationLiveRefresh } from "@/components/organisms/cancellation-live-refresh";
import { CancellationsQueue } from "@/components/organisms/cancellations-queue";
import { ListPage } from "@/components/templates/list-page";
import { requireUser } from "@/lib/auth";
import { cancellationsDescription } from "@/lib/ui/inbox-grouping";

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
    <ListPage before={<CancellationLiveRefresh />} title="Cancellations" description={cancellationsDescription(admin)}>
      <CancellationsQueue pending={pending} viewer={user} />
    </ListPage>
  );
}
