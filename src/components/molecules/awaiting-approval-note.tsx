import { approversLine } from "@/lib/ui/inbox-grouping";

export type AwaitingApprovalNoteProps = { approvers: string[] };

/** Footer of the approval card for viewers who cannot approve. */
export function AwaitingApprovalNote({ approvers }: AwaitingApprovalNoteProps) {
  return (
    <div className="flex flex-col gap-0.5 text-sm">
      <span className="font-medium">Awaiting admin approval</span>
      <span className="text-xs text-muted-foreground">{approversLine(approvers)}</span>
    </div>
  );
}
