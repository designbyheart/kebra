import { cn } from "@/lib/utils";
import { PILL, TASK_STATUS_CLASS, TASK_STATUS_LABEL, type TaskStatusKey } from "@/lib/ui/job-status";

export type TaskStatusBadgeProps = { status: TaskStatusKey; className?: string };

/** Open / In progress / Done / Dismissed pill for inbox tasks. */
export function TaskStatusBadge({ status, className }: TaskStatusBadgeProps) {
  return <span className={cn(PILL, TASK_STATUS_CLASS[status], className)}>{TASK_STATUS_LABEL[status]}</span>;
}
