import { PageHeader } from "@/components/page-header";
import { CallList } from "@/components/calls/call-list";
import { requireUser } from "@/lib/auth";
import { listCalls, parseFilter } from "./data";

export const metadata = { title: "Calls" };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ f?: string; q?: string }> };

export default async function CallsPage({ searchParams }: Props) {
  await requireUser();
  const sp = await searchParams;
  const filter = parseFilter(sp.f);
  const q = (sp.q ?? "").trim().slice(0, 200);
  const initial = await listCalls({ filter, q });

  return (
    <div>
      <PageHeader title="Calls" description="Every call the agent has handled: who called, what it did, what it promised." />
      <CallList key={`${filter}|${q}`} initial={initial} filter={filter} q={q} />
    </div>
  );
}
