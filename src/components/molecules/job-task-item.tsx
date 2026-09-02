import Link from "next/link";
import type { JobPageData } from "@/app/jobs/queries";
import { TaskStatusBadge } from "@/components/atoms/task-status-badge";
import { relativeDay } from "@/lib/ui/format";
import { KIND_LABEL } from "@/lib/ui/inbox-grouping";

export type JobTaskItemProps = { task: JobPageData["tasks"][number] };

/** One inbox task linked from the job page. */
export function JobTaskItem({ task: t }: JobTaskItemProps) {
  return (
    <li className="flex items-start gap-2">
      <TaskStatusBadge status={t.status} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <Link href={`/inbox?task=${encodeURIComponent(t.id)}`} className="font-medium hover:underline">
          {t.title}
        </Link>
        <div className="text-xs text-muted-foreground">
          {KIND_LABEL[t.kind].one}
          {t.assignedName && ` · ${t.assignedName}`}
          {t.dueAt && ` · due ${relativeDay(t.dueAt)}`}
        </div>
      </div>
    </li>
  );
}
