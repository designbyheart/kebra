/**
 * Cancellation approval card (W2-E, PLAN §3 D12). Server component.
 *
 * Usage from /inbox (W2-D):
 *   <CancellationApprovalCard changeRequestId={cr.id} />
 *   <CancellationApprovalCard data={await loadCancellationApproval(id)} />
 *
 * Loads the read model (unless given) and the viewer (unless given), then
 * renders `CancellationApprovalCardView`.
 */
import { loadCancellationApproval, type CancellationApprovalData } from "@/app/inbox/cancellation-data";
import { Card, CardContent } from "@/components/atoms/ui/card";
import { CancellationApprovalCardView } from "@/components/organisms/cancellation-approval-card-view";
import { getCurrentUser, type CurrentUser } from "@/lib/auth";

export type { CancellationApprovalData } from "@/app/inbox/cancellation-data";

export type CancellationApprovalCardProps = (
  | { changeRequestId: string; data?: undefined }
  | { data: CancellationApprovalData; changeRequestId?: undefined }
) & {
  /** Pass the session user when the page already has it; otherwise the card looks it up. */
  viewer?: CurrentUser | null;
  className?: string;
};

export async function CancellationApprovalCard(props: CancellationApprovalCardProps) {
  const data = props.data ?? (await loadCancellationApproval(props.changeRequestId));
  if (!data) {
    return (
      <Card size="sm" className={props.className}>
        <CardContent className="text-sm text-muted-foreground">This cancellation request no longer exists.</CardContent>
      </Card>
    );
  }
  let viewer: CurrentUser | null | undefined = props.viewer;
  if (viewer === undefined) viewer = await getCurrentUser();
  return <CancellationApprovalCardView data={data} viewer={viewer} className={props.className} />;
}
