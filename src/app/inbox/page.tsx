import { InboxFilters } from "@/components/organisms/inbox-filters";
import { InboxList } from "@/components/organisms/inbox-list";
import { InboxLiveRefresh } from "@/components/organisms/inbox-live-refresh";
import { ListPage } from "@/components/templates/list-page";
import { requireUser } from "@/lib/auth";
import { parseKindFilter, parseStatusFilter, parseTaskFocus } from "@/lib/ui/inbox-grouping";
import { countOpenByKind, countTasksByStatus, listInboxTasks, listInboxUsers } from "./queries";

export const metadata = { title: "Inbox" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function InboxPage({ searchParams }: { searchParams: SearchParams }) {
  const [user, sp] = await Promise.all([requireUser(), searchParams]);
  const status = parseStatusFilter(sp.status);
  const kind = parseKindFilter(sp.kind);
  const focus = parseTaskFocus(sp.task);
  const now = new Date();

  const [tasks, counts, openByKind, users] = await Promise.all([
    listInboxTasks({ status, kind }),
    countTasksByStatus(kind),
    countOpenByKind(),
    listInboxUsers(),
  ]);

  return (
    <ListPage before={<InboxLiveRefresh />} title="Inbox" description="Handoffs, callbacks, reviews, follow-ups and cancellation approvals. Every change here is one event on the feed.">
      <InboxFilters status={status} kind={kind} counts={counts} openByKind={openByKind} />
      <InboxList tasks={tasks} status={status} kind={kind} users={users} viewer={user} focus={focus} now={now} />
    </ListPage>
  );
}
