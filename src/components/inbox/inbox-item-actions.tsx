"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { assignTaskAction, setTaskStatusAction } from "@/app/inbox/actions";
import { Button } from "@/components/ui/button";
import type { InboxUser } from "@/app/inbox/queries";
import { transitionsFor, type TaskStatus } from "./inbox-grouping";

/**
 * Per-task controls: assignee select + status transitions. Each click is one
 * server action → one `task.updated` event; the page refreshes on success.
 */
export function InboxItemActions({
  taskId,
  status,
  assignedTo,
  users,
}: {
  taskId: string;
  status: TaskStatus;
  assignedTo: string | null;
  users: InboxUser[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const move = (to: TaskStatus, label: string) =>
    start(async () => {
      const r = await setTaskStatusAction(taskId, to);
      if (r.ok) {
        toast.success(`${label}: done.`);
        router.refresh();
      } else toast.error(r.message);
    });

  const assign = (userId: string) =>
    start(async () => {
      const r = await assignTaskAction(taskId, userId || null);
      if (r.ok) {
        toast.success(userId ? "Assigned." : "Assignee cleared.");
        router.refresh();
      } else toast.error(r.message);
    });

  const transitions = transitionsFor(status);
  const primary = transitions[0];
  const rest = transitions.slice(1);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <label className="sr-only" htmlFor={`assign-${taskId}`}>
        Assign to
      </label>
      <select
        id={`assign-${taskId}`}
        value={assignedTo ?? ""}
        disabled={pending}
        onChange={(e) => assign(e.target.value)}
        className="h-7 max-w-40 rounded-md border border-input bg-background px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
        title="Assign to"
      >
        <option value="">Unassigned</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </select>
      {primary ? (
        <Button size="xs" variant={primary.to === "done" ? "default" : "secondary"} disabled={pending} onClick={() => move(primary.to, primary.label)}>
          {primary.label}
        </Button>
      ) : null}
      {rest.map((t) => (
        <Button key={t.to} size="xs" variant="ghost" disabled={pending} onClick={() => move(t.to, t.label)}>
          {t.label}
        </Button>
      ))}
    </div>
  );
}
