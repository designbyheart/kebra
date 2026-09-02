import type { InboxTask, InboxUser } from "@/app/inbox/queries";
import { InboxGroup } from "@/components/organisms/inbox-group";
import type { CurrentUser } from "@/lib/auth";
import { groupByKind, inboxEmptyMessage, sortTasks, type StatusFilter, type TaskKind } from "@/lib/ui/inbox-grouping";

export type InboxListProps = {
  tasks: InboxTask[];
  status: StatusFilter;
  kind: TaskKind | null;
  users: InboxUser[];
  viewer: CurrentUser;
  /** Task id from `?task=` to highlight. */
  focus: string | null;
  now: Date;
};

/** Tasks grouped by kind (in KIND_ORDER, sorted by urgency), or the empty state. */
export function InboxList({ tasks, status, kind, users, viewer, focus, now }: InboxListProps) {
  if (tasks.length === 0) {
    return <p className="rounded-md border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">{inboxEmptyMessage(status, kind)}</p>;
  }
  const groups = groupByKind(tasks, kind).map((g) => ({ ...g, items: sortTasks(g.items, now) }));
  return (
    <div className="flex flex-col gap-6">
      {groups.map((g) => (
        <InboxGroup key={g.kind} kind={g.kind} items={g.items} status={status} users={users} viewer={viewer} focus={focus} now={now} />
      ))}
    </div>
  );
}
