import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import type { Promise_ } from "@/db/schema";
import { formatDateTimeET } from "@/lib/time";

export type CallPromiseItemProps = { promise: Promise_ };

/** One promise the agent made, with kind, due date and a link to its task. */
export function CallPromiseItem({ promise }: CallPromiseItemProps) {
  return (
    <li className="flex items-start gap-2 p-2.5">
      <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-teal-700 dark:text-teal-300" />
      <div className="min-w-0 flex-1">
        <div className="text-sm leading-snug">{promise.text}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          {promise.kind && <span className="capitalize">{promise.kind}</span>}
          {promise.dueAt && <span>· due {formatDateTimeET(promise.dueAt)}</span>}
          {promise.taskId && (
            <Link href={`/inbox?task=${promise.taskId}`} className="hover:underline">
              · task
            </Link>
          )}
        </div>
      </div>
    </li>
  );
}
