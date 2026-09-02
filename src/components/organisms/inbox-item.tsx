import Link from "next/link";
import { Phone, User, Wrench } from "lucide-react";
import { loadCancellationApproval, type CancellationApprovalData } from "@/app/inbox/cancellation-data";
import type { InboxTask, InboxUser } from "@/app/inbox/queries";
import { AgentBadge } from "@/components/atoms/agent-badge";
import { MaskedText } from "@/components/atoms/masked-text";
import { StatusBadge } from "@/components/atoms/status-badge";
import { TaskStatusBadge } from "@/components/atoms/task-status-badge";
import { InboxCancellationBlock } from "@/components/organisms/inbox-cancellation-block";
import { InboxItemActions } from "@/components/organisms/inbox-item-actions";
import type { CurrentUser } from "@/lib/auth";
import { fmtDateTime, relativeDay, relativeTime } from "@/lib/ui/format";
import { KIND_LABEL, isOverdue, type TaskStatus } from "@/lib/ui/inbox-grouping";
import { cn } from "@/lib/utils";

/** Finished tasks fade back. */
const DIM: Record<TaskStatus, string | undefined> = { open: undefined, in_progress: undefined, done: "opacity-75", dismissed: "opacity-75" };
const DUE_CLASS = { overdue: "font-medium text-red-700 dark:text-red-300", due: "text-muted-foreground" } as const;

export type InboxItemProps = {
  task: InboxTask;
  users: InboxUser[];
  viewer: CurrentUser;
  highlighted: boolean;
  now: Date;
};

/** One task row. Cancellation tasks embed W2-E's approval card underneath. */
export async function InboxItem({ task, users, viewer, highlighted, now }: InboxItemProps) {
  const overdue = isOverdue(task, now);
  let approval: CancellationApprovalData | null = null;
  if (task.kind === "cancellation" && task.changeRequestId) approval = await loadCancellationApproval(task.changeRequestId);
  return (
    <li
      id={`task-${task.id}`}
      data-task-id={task.id}
      data-kind={task.kind}
      data-status={task.status}
      className={cn("rounded-lg border bg-card p-3 transition-shadow scroll-mt-24", highlighted && "ring-2 ring-primary/60", DIM[task.status])}
    >
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <TaskStatusBadge status={task.status} />
            {task.fromAgent && <AgentBadge />}
            <span className="text-xs text-muted-foreground">{KIND_LABEL[task.kind].one}</span>
            <span className="text-xs text-muted-foreground" title={fmtDateTime(task.createdAt)}>
              · {relativeTime(task.createdAt, now)}
            </span>
            {task.dueAt && (
              <span className={cn("text-xs", DUE_CLASS[(overdue && "overdue") || "due"])} title={fmtDateTime(task.dueAt)}>
                · due {relativeDay(task.dueAt, now)}
                {overdue && " (overdue)"}
              </span>
            )}
            {task.assignedName && <span className="text-xs text-muted-foreground">· {task.assignedName}</span>}
          </div>
          <div className="mt-1 text-sm font-medium leading-snug">
            <MaskedText text={task.title} />
          </div>
          {task.body && (
            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
              <MaskedText text={task.body} />
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            {task.customerId && (
              <Link href={`/customers/${task.customerId}`} className="inline-flex items-center gap-1 font-medium hover:underline">
                <User className="size-3.5 text-muted-foreground" />
                {task.customerName ?? "Customer"}
              </Link>
            )}
            {task.jobId && (
              <Link href={`/jobs/${task.jobId}`} className="inline-flex items-center gap-1.5 font-medium hover:underline">
                <Wrench className="size-3.5 text-muted-foreground" />
                Job {task.jobInvoiceNumber && `#${task.jobInvoiceNumber}`}
                {task.jobStatus && <StatusBadge status={task.jobStatus} />}
              </Link>
            )}
            {task.callId && (
              <Link href={`/calls/${task.callId}`} className="inline-flex items-center gap-1 font-medium hover:underline">
                <Phone className="size-3.5 text-muted-foreground" />
                Call
              </Link>
            )}
          </div>
        </div>
        <InboxItemActions taskId={task.id} status={task.status} assignedTo={task.assignedTo} users={users} />
      </div>
      {task.kind === "cancellation" && (
        <div className="mt-3">
          <InboxCancellationBlock approval={approval} viewer={viewer} hasJob={Boolean(task.jobId)} />
        </div>
      )}
    </li>
  );
}
