import Link from "next/link";
import { ClipboardList } from "lucide-react";
import type { CallTask } from "@/app/calls/data";
import { callTaskTone } from "@/lib/ui/call-derive";
import { cn } from "@/lib/utils";

export type CallTaskItemProps = { task: CallTask };

/** Compact task row under "Actions taken", linking into the Inbox. */
export function CallTaskItem({ task }: CallTaskItemProps) {
  return (
    <li className="flex items-center gap-2 text-sm">
      <ClipboardList className="size-3 text-purple-700 dark:text-purple-300" />
      <Link href={`/inbox?task=${task.id}`} className="min-w-0 flex-1 truncate hover:underline">
        {task.title}
      </Link>
      <span className={cn("rounded-full px-1.5 py-px text-xs font-medium", callTaskTone(task.status))}>
        {task.kind} · {task.status.replace("_", " ")}
      </span>
    </li>
  );
}
