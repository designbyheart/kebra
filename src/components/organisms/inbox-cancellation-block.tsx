import type { CancellationApprovalData } from "@/app/inbox/cancellation-data";
import { CancellationApprovalCard } from "@/components/organisms/cancellation-approval-card";
import type { CurrentUser } from "@/lib/auth";

export type InboxCancellationBlockProps = {
  approval: CancellationApprovalData | null;
  viewer: CurrentUser;
  /** The task points at a job (so a change request could have existed). */
  hasJob: boolean;
};

/** Under a cancellation task: the approval card, or a note when no change request is linked. */
export function InboxCancellationBlock({ approval, viewer, hasJob }: InboxCancellationBlockProps) {
  if (!approval) {
    return (
      <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
        No change request is linked to this task{!hasJob && " (no job on the task)"}. If the job was canceled directly by the office, resolve this task.
      </p>
    );
  }
  // W2-E's card: reason, transcript passage, approve / reject (admins only).
  return <CancellationApprovalCard data={approval} viewer={viewer} />;
}
