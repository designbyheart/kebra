import type { InboxTask, InboxUser } from "@/app/inbox/queries";
import { InboxItem } from "@/components/organisms/inbox-item";
import type { CurrentUser } from "@/lib/auth";
import { KIND_LABEL, groupEmptyMessage, type StatusFilter, type TaskKind } from "@/lib/ui/inbox-grouping";

export type InboxGroupProps = {
  kind: TaskKind;
  items: InboxTask[];
  status: StatusFilter;
  users: InboxUser[];
  viewer: CurrentUser;
  /** Task id from `?task=` to highlight. */
  focus: string | null;
  now: Date;
};

/** One kind section of the inbox: heading, count, hint, then the tasks. */
export function InboxGroup({ kind, items, status, users, viewer, focus, now }: InboxGroupProps) {
  return (
    <section aria-labelledby={`group-${kind}`}>
      <div className="mb-2 flex items-baseline gap-2">
        <h2 id={`group-${kind}`} className="text-lg font-semibold">
          {KIND_LABEL[kind].many}
        </h2>
        <span className="text-xs tabular-nums text-muted-foreground">{items.length}</span>
        <span className="hidden text-xs text-muted-foreground sm:inline">· {KIND_LABEL[kind].hint}</span>
      </div>
      {items.length === 0 && <p className="rounded-md border border-dashed px-3 py-3 text-sm text-muted-foreground">{groupEmptyMessage(status, kind)}</p>}
      {items.length > 0 && (
        <ul className="flex flex-col gap-2">
          {items.map((t) => (
            <InboxItem key={t.id} task={t} users={users} viewer={viewer} highlighted={focus === t.id} now={now} />
          ))}
        </ul>
      )}
    </section>
  );
}
