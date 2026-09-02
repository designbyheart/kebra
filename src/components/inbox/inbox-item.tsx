import Link from "next/link";
import { Phone, User, Wrench } from "lucide-react";
import type { InboxTask, InboxUser } from "@/app/inbox/queries";
import { fmtDateTime, relativeDay, relativeTime } from "@/components/jobs/format";
import { MaskedText } from "@/components/jobs/masked-text";
import { AgentBadge, StatusBadge, TaskStatusBadge } from "@/components/jobs/status-badge";
import { cn } from "@/lib/utils";
import { CancellationApprovalCard } from "./cancellation-approval";
import { loadCancellationApproval } from "./cancellation-data";
import { InboxItemActions } from "./inbox-item-actions";
import { KIND_LABEL, isOverdue } from "./inbox-grouping";
import type { CurrentUser } from "@/lib/auth";

/** One task row. Cancellation tasks embed W2-E's approval card underneath. */
export async function InboxItem({
  task,
  users,
  viewer,
  highlighted,
  now,
}: {
  task: InboxTask;
  users: InboxUser[];
  viewer: CurrentUser;
  highlighted: boolean;
  now: Date;
}) {
  const overdue = isOverdue(task, now);
  const approval = task.kind === "cancellation" && task.changeRequestId ? await loadCancellationApproval(task.changeRequestId) : null;
  return (
    <li
      id={`task-${task.id}`}
      data-task-id={task.id}
      data-kind={task.kind}
      data-status={task.status}
      className={cn(
        "rounded-lg border bg-card p-3 transition-shadow scroll-mt-24",
        highlighted && "ring-2 ring-primary/60",
        task.status === "done" || task.status === "dismissed" ? "opacity-75" : null,
      )}
    >
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <TaskStatusBadge status={task.status} />
            {task.fromAgent ? <AgentBadge /> : null}
            <span className="text-xs text-muted-foreground">{KIND_LABEL[task.kind].one}</span>
            <span className="text-xs text-muted-foreground" title={fmtDateTime(task.createdAt)}>
              · {relativeTime(task.createdAt, now)}
            </span>
            {task.dueAt ? (
              <span
                className={cn("text-xs", overdue ? "font-medium text-red-700 dark:text-red-300" : "text-muted-foreground")}
                title={fmtDateTime(task.dueAt)}
              >
                · due {relativeDay(task.dueAt, now)}
                {overdue ? " (overdue)" : ""}
              </span>
            ) : null}
            {task.assignedName ? <span className="text-xs text-muted-foreground">· {task.assignedName}</span> : null}
          </div>
          <h3 className="mt-1 text-sm font-medium leading-snug">
            <MaskedText text={task.title} />
          </h3>
          {task.body ? (
            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
              <MaskedText text={task.body} />
            </p>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            {task.customerId ? (
              <Link href={`/customers/${task.customerId}`} className="inline-flex items-center gap-1 font-medium hover:underline">
                <User className="size-3.5 text-muted-foreground" />
                {task.customerName ?? "Customer"}
              </Link>
            ) : null}
            {task.jobId ? (
              <Link href={`/jobs/${task.jobId}`} className="inline-flex items-center gap-1.5 font-medium hover:underline">
                <Wrench className="size-3.5 text-muted-foreground" />
                Job {task.jobInvoiceNumber ? `#${task.jobInvoiceNumber}` : ""}
                {task.jobStatus ? <StatusBadge status={task.jobStatus} /> : null}
              </Link>
            ) : null}
            {task.callId ? (
              <Link href={`/calls/${task.callId}`} className="inline-flex items-center gap-1 font-medium hover:underline">
                <Phone className="size-3.5 text-muted-foreground" />
                Call
              </Link>
            ) : null}
          </div>
        </div>
        <InboxItemActions taskId={task.id} status={task.status} assignedTo={task.assignedTo} users={users} />
      </div>
      {task.kind === "cancellation" ? (
        <div className="mt-3">
          {approval ? (
            // W2-E's card: reason, transcript passage, approve / reject (admins only).
            <CancellationApprovalCard data={approval} viewer={viewer} />
          ) : (
            <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
              No change request is linked to this task{task.jobId ? "" : " (no job on the task)"}. If the job was canceled directly by the office, resolve this task.
            </p>
          )}
        </div>
      ) : null}
    </li>
  );
}
