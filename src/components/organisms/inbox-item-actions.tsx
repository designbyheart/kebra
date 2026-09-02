"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { assignTaskAction, setTaskStatusAction } from "@/app/inbox/actions";
import type { InboxUser } from "@/app/inbox/queries";
import { NativeSelect } from "@/components/atoms/native-select";
import { Button } from "@/components/atoms/ui/button";
import { transitionsFor, type TaskStatus } from "@/lib/ui/inbox-grouping";

/** Resolving is the primary action; starting a task is secondary. */
const PRIMARY_VARIANT = { done: "default", other: "secondary" } as const;
const ASSIGN_TOAST = { assigned: "Assigned.", cleared: "Assignee cleared." } as const;

export type InboxItemActionsProps = {
  taskId: string;
  status: TaskStatus;
  assignedTo: string | null;
  users: InboxUser[];
};

/**
 * Per-task controls: assignee select + status transitions. Each click is one
 * server action → one `task.updated` event; the page refreshes on success.
 */
export function InboxItemActions({ taskId, status, assignedTo, users }: InboxItemActionsProps) {
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
        toast.success(ASSIGN_TOAST[(userId && "assigned") || "cleared"]);
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
      <NativeSelect
        id={`assign-${taskId}`}
        value={assignedTo ?? ""}
        disabled={pending}
        onChange={(e) => assign(e.target.value)}
        className="h-7 w-auto max-w-40 rounded-md"
        title="Assign to"
      >
        <option value="">Unassigned</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </NativeSelect>
      {primary && (
        <Button size="xs" variant={PRIMARY_VARIANT[(primary.to === "done" && "done") || "other"]} disabled={pending} onClick={() => move(primary.to, primary.label)}>
          {primary.label}
        </Button>
      )}
      {rest.map((t) => (
        <Button key={t.to} size="xs" variant="ghost" disabled={pending} onClick={() => move(t.to, t.label)}>
          {t.label}
        </Button>
      ))}
    </div>
  );
}
